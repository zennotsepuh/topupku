// ============================================================
// MIDTRANS SERVICE – © DanzModss
// ============================================================
// Fungsi:
//   - Create payment transaction (Snap)
//   - Handle notification
//   - Check status
//   - Cancel/Refund
// ============================================================

const midtransClient = require('midtrans-client');
const crypto = require('crypto');
const config = require('../config');
const { pool } = require('../database');

// ============================================================
// INIT MIDTRANS CLIENTS
// ============================================================
const snap = new midtransClient.Snap({
  isProduction: config.midtrans.isProduction,
  serverKey: config.midtrans.serverKey,
  clientKey: config.midtrans.clientKey,
});

const core = new midtransClient.CoreApi({
  isProduction: config.midtrans.isProduction,
  serverKey: config.midtrans.serverKey,
  clientKey: config.midtrans.clientKey,
});

// ============================================================
// CREATE PAYMENT TRANSACTION
// ============================================================
// Params:
//   - orderId: order ID dari sistem kita
//   - amount: total harga
//   - customer: { name, email, phone }
//   - items: [{ id, name, price, quantity }]
// ============================================================
async function createTransaction({ orderId, amount, customer, items }) {
  try {
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(amount),
      },
      item_details: items.map(item => ({
        id: String(item.id),
        price: Math.round(item.price),
        quantity: item.quantity || 1,
        name: item.name.substring(0, 50), // Max 50 char
      })),
      customer_details: {
        first_name: customer.name || 'Guest',
        email: customer.email || undefined,
        phone: customer.phone || undefined,
      },
      // Aktifkan semua metode pembayaran
      enabled_payments: [
        'qris',
        'gopay', 
        'shopeepay',
        'dana',
        'ovo',
        'bca_va',
        'bni_va',
        'bri_va',
        'mandiri_va',
        'permata_va',
        'cimb_va',
        'other_va',
        'alfamart',
        'indomaret',
      ],
      // Expire dalam 24 jam
      expiry: {
        unit: 'hours',
        duration: 24,
      },
      // Custom field buat tracking
      custom_field1: orderId,
      custom_field2: 'topupku',
      custom_field3: new Date().toISOString(),
    };
    
    const transaction = await snap.createTransaction(parameter);
    
    return {
      success: true,
      data: {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
      },
    };
    
  } catch (err) {
    console.error('Midtrans createTransaction error:', err);
    return {
      success: false,
      error: err.message || 'Gagal membuat transaksi',
    };
  }
}

// ============================================================
// HANDLE NOTIFICATION
// ============================================================
// Midtrans akan POST ke webhook kita setiap kali status berubah
// ============================================================
async function handleNotification(notification) {
  try {
    // Verifikasi signature key
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      payment_type,
      transaction_id,
      transaction_time,
      settlement_time,
    } = notification;
    
    // Verify signature
    const serverKey = config.midtrans.serverKey;
    const raw = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const expectedSignature = crypto
      .createHash('sha512')
      .update(raw)
      .digest('hex');
    
    if (signature_key !== expectedSignature) {
      console.error('Invalid signature:', { received: signature_key, expected: expectedSignature });
      return { success: false, error: 'Invalid signature' };
    }
    
    // Map status Midtrans ke status kita
    let orderStatus = 'pending';
    
    if (transaction_status === 'capture') {
      orderStatus = fraud_status === 'accept' ? 'paid' : 'pending';
    } else if (transaction_status === 'settlement') {
      orderStatus = 'paid';
    } else if (transaction_status === 'pending') {
      orderStatus = 'pending';
    } else if (['deny', 'cancel', 'expire', 'failure'].includes(transaction_status)) {
      orderStatus = 'failed';
    } else if (transaction_status === 'refund' || transaction_status === 'partial_refund') {
      orderStatus = 'refund';
    }
    
    // Update order di database
    await pool.query(
      `UPDATE orders 
       SET status = ?, payment_token = ?, notes = ?
       WHERE order_id = ?`,
      [
        orderStatus,
        transaction_id || null,
        `Midtrans: ${transaction_status} / ${payment_type}`,
        order_id,
      ]
    );
    
    // Log transaksi
    await pool.query(
      `INSERT INTO transactions (order_id, type, amount, status, reference, description)
       VALUES (?, 'in', ?, ?, ?, ?)`,
      [
        order_id,
        gross_amount,
        transaction_status === 'settlement' || transaction_status === 'capture' ? 'success' : 'pending',
        transaction_id,
        `Payment via ${payment_type}`,
      ]
    );
    
    console.log(`✓ Notification processed: ${order_id} → ${orderStatus}`);
    
    return {
      success: true,
      orderId: order_id,
      status: orderStatus,
      transactionStatus: transaction_status,
      paymentType: payment_type,
    };
    
  } catch (err) {
    console.error('handleNotification error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================
// GET TRANSACTION STATUS
// ============================================================
async function getStatus(orderId) {
  try {
    const status = await core.transaction.status(orderId);
    
    return {
      success: true,
      data: {
        order_id: status.order_id,
        transaction_status: status.transaction_status,
        fraud_status: status.fraud_status,
        payment_type: status.payment_type,
        gross_amount: status.gross_amount,
        transaction_time: status.transaction_time,
        settlement_time: status.settlement_time,
      },
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// CANCEL TRANSACTION
// ============================================================
async function cancelTransaction(orderId) {
  try {
    const result = await core.transaction.cancel(orderId);
    
    // Update status di DB
    await pool.query(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['failed', orderId]
    );
    
    return {
      success: true,
      data: result,
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// REFUND TRANSACTION
// ============================================================
async function refundTransaction(orderId, amount, reason) {
  try {
    const params = {
      refund_key: `${orderId}-refund-${Date.now()}`,
      amount: Math.round(amount),
      reason: reason || 'Refund requested',
    };
    
    const result = await core.transaction.refund(orderId, params);
    
    // Update status di DB
    await pool.query(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['refund', orderId]
    );
    
    // Log transaksi
    await pool.query(
      `INSERT INTO transactions (order_id, type, amount, status, reference, description)
       VALUES (?, 'out', ?, 'success', ?, ?)`,
      [orderId, amount, result.refund_key, `Refund: ${reason}`]
    );
    
    return {
      success: true,
      data: result,
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// EXPIRE TRANSACTION
// ============================================================
async function expireTransaction(orderId) {
  try {
    const result = await core.transaction.expire(orderId);
    
    await pool.query(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['failed', orderId]
    );
    
    return {
      success: true,
      data: result,
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// GET SNAP REDIRECT URL
// ============================================================
async function getSnapRedirectUrl(orderId, amount, customer, items) {
  const result = await createTransaction({
    orderId,
    amount,
    customer,
    items,
  });
  
  if (!result.success) {
    return result;
  }
  
  return {
    success: true,
    redirect_url: result.data.redirect_url,
    token: result.data.token,
  };
}

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  snap,
  core,
  createTransaction,
  handleNotification,
  getStatus,
  cancelTransaction,
  refundTransaction,
  expireTransaction,
  getSnapRedirectUrl,
};
