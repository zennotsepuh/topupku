const express = require('express');
const router = express.Router();
const midtransClient = require('midtrans-client');
const config = require('../config');
const { pool } = require('../database');

const snap = new midtransClient.Snap({
  isProduction: config.midtrans.isProduction,
  serverKey: config.midtrans.serverKey,
  clientKey: config.midtrans.clientKey,
});

// Create payment token
router.post('/create', async (req, res) => {
  try {
    const { order_id } = req.body;
    
    // Ambil order dari DB
    const [rows] = await pool.query(
      `SELECT o.*, g.name as game_name, d.name as denom_name
       FROM orders o
       LEFT JOIN games g ON o.game_id = g.id
       LEFT JOIN denominations d ON o.denom_id = d.id
       WHERE o.order_id = ?`,
      [order_id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    const order = rows[0];
    
    // Parameter Midtrans
    const parameter = {
      transaction_details: {
        order_id: order.order_id,
        gross_amount: parseFloat(order.total),
      },
      item_details: [{
        id: order.denom_id,
        price: parseFloat(order.price),
        quantity: 1,
        name: `${order.game_name} - ${order.denom_name}`,
      }],
      customer_details: {
        first_name: order.buyer_name || 'Guest',
        phone: order.contact,
      },
    };
    
    // Create transaction
    const transaction = await snap.createTransaction(parameter);
    
    // Update order
    await pool.query(
      'UPDATE orders SET payment_token = ?, payment_url = ? WHERE order_id = ?',
      [transaction.token, transaction.redirect_url, order.order_id]
    );
    
    res.json({
      success: true,
      data: {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Midtrans notification handler
router.post('/notification', async (req, res) => {
  try {
    const notification = req.body;
    
    const statusResponse = await snap.transaction.notification(notification);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;
    
    let orderStatus = 'pending';
    
    if (transactionStatus === 'capture') {
      orderStatus = fraudStatus === 'accept' ? 'paid' : 'pending';
    } else if (transactionStatus === 'settlement') {
      orderStatus = 'paid';
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      orderStatus = 'failed';
    } else if (transactionStatus === 'pending') {
      orderStatus = 'pending';
    }
    
    // Update order
    await pool.query(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      [orderStatus, orderId]
    );
    
    // Kalo paid, kirim ke supplier (Digiflazz)
    if (orderStatus === 'paid') {
      await processOrderToSupplier(orderId);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Process order to supplier
async function processOrderToSupplier(orderId) {
  // TODO: Integrasi Digiflazz
  console.log('Processing order to supplier:', orderId);
  // Update status jadi 'processing'
  await pool.query(
    'UPDATE orders SET status = ? WHERE order_id = ?',
    ['processing', orderId]
  );
}

module.exports = router;
