// ============================================================
// AUTH MIDDLEWARE – © DanzModss
// ============================================================
// Fungsi:
//   - Verify JWT token (user)
//   - Verify Basic Auth (admin)
//   - Generate JWT token
// ============================================================

const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../database');

// ============================================================
// GENERATE TOKEN (User)
// ============================================================
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || 'user',
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );
}

// ============================================================
// VERIFY TOKEN (User)
// ============================================================
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
}

// ============================================================
// MIDDLEWARE: USER AUTH (JWT)
// ============================================================
// Pake: header Authorization: Bearer <token>
async function userAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token tidak ditemukan'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Token tidak valid atau expired'
      });
    }
    
    // Ambil data user dari DB
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, role, balance FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User tidak ditemukan'
      });
    }
    
    req.user = rows[0];
    next();
    
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// ============================================================
// MIDDLEWARE: ADMIN AUTH (Basic Auth)
// ============================================================
// Pake: header Authorization: Basic <base64(username:password)>
function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const token = authHeader.replace('Basic ', '');
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');
    
    if (
      username === config.admin.username &&
      password === config.admin.password
    ) {
      req.admin = { username };
      return next();
    }
    
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
    
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// ============================================================
// MIDDLEWARE: OPTIONAL AUTH (User login atau guest)
// ============================================================
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = verifyToken(token);
      
      if (decoded) {
        const [rows] = await pool.query(
          'SELECT id, name, email, phone, role, balance FROM users WHERE id = ?',
          [decoded.id]
        );
        
        if (rows.length > 0) {
          req.user = rows[0];
        }
      }
    }
    
    next();
    
  } catch (err) {
    next();
  }
}

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  generateToken,
  verifyToken,
  userAuth,
  adminAuth,
  optionalAuth,
};
