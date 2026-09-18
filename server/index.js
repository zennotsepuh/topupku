const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config');
const { testConnection } = require('./database');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    env: config.env 
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  await testConnection();
  app.listen(config.port, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🚀 TOPUPKU SERVER');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Port    : ${config.port}`);
    console.log(`  Env     : ${config.env}`);
    console.log(`  URL     : http://localhost:${config.port}`);
    console.log(`  Admin   : http://localhost:${config.port}/admin`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

start();
