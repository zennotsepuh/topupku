const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test koneksi
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✓ Database connected');
    conn.release();
    return true;
  } catch (err) {
    console.error('✗ Database error:', err.message);
    return false;
  }
}

module.exports = { pool, testConnection };
