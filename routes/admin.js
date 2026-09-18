const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const config = require('../config');

// Simple auth middleware
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth ? auth.replace('Basic ', '') : '';
  const [user, pass] = Buffer.from(token, 'base64').toString().split(':');
  
  if (user === config.admin.username && pass === config.admin.password) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === config.admin.username && password === config.admin.password) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// Dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalOrders] = await pool.query('SELECT COUNT(*) as c FROM orders');
    const [successOrders] = await pool.query("SELECT COUNT(*) as c FROM orders WHERE status = 'success'");
    const [pendingOrders] = await pool.query("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'");
    const [revenue] = await pool.query("SELECT SUM(total) as total FROM orders WHERE status = 'success'");
    
    res.json({
      success: true,
      data: {
        total_orders: totalOrders[0].c,
        success_orders: successOrders[0].c,
        pending_orders: pendingOrders[0].c,
        revenue: revenue[0].total || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all orders
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, g.name as game_name, d.name as denom_name, p.name as payment_name
       FROM orders o
       LEFT JOIN games g ON o.game_id = g.id
       LEFT JOIN denominations d ON o.denom_id = d.id
       LEFT JOIN payment_methods p ON o.payment_id = p.id
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update order status
router.put('/orders/:orderId', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    
    await pool.query(
      'UPDATE orders SET status = ?, notes = ? WHERE order_id = ?',
      [status, notes || null, orderId]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
