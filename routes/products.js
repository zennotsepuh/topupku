const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// Get all games
router.get('/games', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM games WHERE is_active = 1 ORDER BY sort_order ASC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get denominations by game
router.get('/games/:code/denoms', async (req, res) => {
  try {
    const { code } = req.params;
    const [games] = await pool.query(
      'SELECT id FROM games WHERE code = ? AND is_active = 1',
      [code]
    );
    
    if (games.length === 0) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }
    
    const [denoms] = await pool.query(
      'SELECT * FROM denominations WHERE game_id = ? AND is_active = 1 ORDER BY price ASC',
      [games[0].id]
    );
    
    res.json({ success: true, data: denoms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get payment methods
router.get('/payments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM payment_methods WHERE is_active = 1'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
