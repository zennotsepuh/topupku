require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE,
  },
  
  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  },
  
  digiflazz: {
    username: process.env.DIGIFLAZZ_USERNAME,
    apiKey: process.env.DIGIFLAZZ_API_KEY,
    mode: process.env.DIGIFLAZZ_MODE,
  },
  
  admin: {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  }
};
