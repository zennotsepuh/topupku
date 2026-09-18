const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const crypto = require('crypto');

// Create order
router.post('/', async (req, res) => {
  try {
    const {
      game_id, denom_id, payment_id,
      user_game_id, server_id, contact, buyer_name
    } = req.body;
    
    // Validasi
    if (!game_id || !denom_id || !payment_id || !user_game_id || !contact) {
      return res.status(400).json({ 
        success: false, 
        error: 'Data tidak lengkap' 
      });
    }
    
    // Ambil data denom & payment
    const [denoms] = await pool.query(
      'SELECT * FROM denominations WHERE id = ?',
      [denom_id]
    );
    
    const [payments] = await pool.query(
      'SELECT * FROM payment_methods WHERE id = ?',
      [payment_id]
    );
    
    if (denoms.length === 0 || payments.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Denom atau payment tidak ditemukan' 
      });
    }
    
    const denom = denoms[0];
    const payment = payments[0];
    
    // Hitung total
    const price = parseFloat(denom.price);
    const fee = parseFloat(payment.fee) + (price * parseFloat(payment.fee_percent) / 100);
    const total = price + fee;
    
    // Generate order ID
    const orderId = 'TRX' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
    
    // Insert order
    const [result] = await pool.query(
      `INSERT INTO orders 
       (order_id, game_id, denom_id, payment_id, user_game_id, server_id, 
        contact, buyer_name, price, fee, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [orderId, game_id, denom_id, payment_id, user_game_id, server_id || null,
       contact, buyer_name || 'Guest', price, fee, total]
    );
    
    res.json({
      success: true,
      data: {
        order_id: orderId,
        price,
        fee,
        total,
        status: 'pending'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Check order status
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const [rows] = await pool.query(
      `SELECT o.*, g.name as game_name, d.name as denom_name, p.name as payment_name
       FROM orders o
       LEFT JOIN games g ON o.game_id = g.id
       LEFT JOIN denominations d ON o.denom_id = d.id
       LEFT JOIN payment_methods p ON o.payment_id = p.id
       WHERE o.order_id = ?`,
      [orderId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
