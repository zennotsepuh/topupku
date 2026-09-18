// ============================================================
// DIGIFLAZZ SERVICE – © DanzModss
// ============================================================
// Fungsi:
//   - Cek saldo
//   - Ambil daftar harga
//   - Kirim order top up
//   - Cek status transaksi
// ============================================================

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const { pool } = require('../database');

// ============================================================
// KONFIGURASI
// ============================================================
const BASE_URL = 'https://api.digiflazz.com/v1';
const USERNAME = config.digiflazz.username;
const API_KEY = config.digiflazz.apiKey;

// ============================================================
// SIGNATURE GENERATOR
// ============================================================
// Format: md5(username + apiKey + refId)
// ============================================================
function generateSignature(refId) {
  const raw = `${USERNAME}${API_KEY}${refId}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

// ============================================================
// CEK SALDO
// ============================================================
async function cekSaldo() {
  try {
    const refId = 'SALDO' + Date.now();
    const sign = generateSignature(refId);
    
    const response = await axios.post(`${BASE_URL}/cek-saldo`, {
      cmd: 'deposit',
      username: USERNAME,
      sign: sign,
    });
    
    const data = response.data.data;
    
    return {
      success: true,
      saldo: data.deposit,
      message: 'Saldo berhasil diambil',
    };
    
  } catch (err) {
    return {
      success: false,
      error: err.response?.data?.data?.message || err.message,
    };
  }
}

// ============================================================
// DAFTAR HARGA
// ============================================================
async function daftarHarga(category = '') {
  try {
    const refId = 'PRICE' + Date.now();
    const sign = generateSignature(refId);
    
    const body = {
      cmd: 'prepaid',
      username: USERNAME,
      sign: sign,
    };
    
    if (category) {
      body.category = category;
    }
    
    const response = await axios.post(`${BASE_URL}/price-list`, body);
    const data = response.data.data;
    
    return {
      success: true,
      data: data,
    };
    
  } catch (err) {
    return {
      success: false,
      error: err.response?.data?.data?.message || err.message,
    };
  }
}

// ============================================================
// KIRIM ORDER TOP UP
// ============================================================
// Params:
//   - sku: kode produk (contoh: "MLBB5", "FF100")
//   - customerNo: User ID game (contoh: "12345678")
//   - refId: order ID unik dari sistem kita
// ============================================================
async function topup(sku, customerNo, refId) {
  try {
    const sign = generateSignature(refId);
    
    const response = await axios.post(`${BASE_URL}/transaction`, {
      username: USERNAME,
      buyer_sku_code: sku,
      customer_no: customerNo,
      ref_id: refId,
      sign: sign,
      testing: config.digiflazz.mode === 'development',
    });
    
    const data = response.data.data;
    
    return {
      success: true,
      data: {
        ref_id: data.ref_id,
        customer_no: data.customer_no,
        buyer_sku_code: data.buyer_sku_code,
        message: data.message,
        status: data.status,        // 'Sukses' | 'Pending' | 'Gagal'
        rc: data.rc,                // response code
        sn: data.sn,                // serial number
        price: data.price,
        admin: data.admin,
      },
    };
    
  } catch (err) {
    return {
      success: false,
      error: err.response?.data?.data?.message || err.message,
    };
  }
}

// ============================================================
// CEK STATUS TRANSAKSI
// ============================================================
async function cekStatus(refId) {
  try {
    const sign = generateSignature(refId);
    
    const response = await axios.post(`${BASE_URL}/transaction`, {
      username: USERNAME,
      buyer_sku_code: '',
      customer_no: '',
      ref_id: refId,
      sign: sign,
      testing: config.digiflazz.mode === 'development',
    });
    
    const data = response.data.data;
    
    return {
      success: true,
      data: data,
    };
    
  } catch (err) {
    return {
      success: false,
      error: err.response?.data?.data?.message || err.message,
    };
  }
}

// ============================================================
// PROSES ORDER DARI DATABASE
// ============================================================
async function processOrder(orderId) {
  try {
    // Ambil data order dari DB
    const [orders] = await pool.query(
      `SELECT o.*, d.sku as denom_sku, g.code as game_code
       FROM orders o
       LEFT JOIN denominations d ON o.denom_id = d.id
       LEFT JOIN games g ON o.game_id = g.id
       WHERE o.order_id = ?`,
      [orderId]
    );
    
    if (orders.length === 0) {
      return { success: false, error: 'Order tidak ditemukan' };
    }
    
    const order = orders[0];
    
    // Cek status order
    if (order.status !== 'paid' && order.status !== 'processing') {
      return { success: false, error: 'Order belum dibayar' };
    }
    
    // Kirim ke Digiflazz
    const result = await topup(
      order.denom_sku,
      order.user_game_id,
      order.order_id
    );
    
    if (!result.success) {
      // Update status jadi failed
      await pool.query(
        'UPDATE orders SET status = ?, notes = ? WHERE order_id = ?',
        ['failed', result.error, orderId]
      );
      
      return { success: false, error: result.error };
    }
    
    // Update status berdasarkan response Digiflazz
    const digiStatus = result.data.status?.toLowerCase() || '';
    let orderStatus = 'processing';
    
    if (digiStatus === 'sukses' || digiStatus === 'success') {
      orderStatus = 'success';
    } else if (digiStatus === 'gagal' || digiStatus === 'failed') {
      orderStatus = 'failed';
    } else if (digiStatus === 'pending') {
      orderStatus = 'processing';
    }
    
    await pool.query(
      `UPDATE orders 
       SET status = ?, supplier_ref = ?, supplier_sn = ?, notes = ?
       WHERE order_id = ?`,
      [
        orderStatus,
        result.data.ref_id || null,
        result.data.sn || null,
        result.data.message || null,
        orderId,
      ]
    );
    
    return {
      success: true,
      status: orderStatus,
      data: result.data,
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// SYNC HARGA DARI DIGIFLAZZ KE DATABASE
// ============================================================
async function syncHarga() {
  try {
    const result = await daftarHarga();
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    let updated = 0;
    let inserted = 0;
    
    for (const item of result.data) {
      // Skip kalo seller gak aktif
      if (!item.seller_product_status) continue;
      
      // Cek apakah SKU udah ada
      const [existing] = await pool.query(
        'SELECT id FROM denominations WHERE sku = ?',
        [item.buyer_sku_code]
      );
      
      // Cari game dari brand atau nama
      const [games] = await pool.query(
        'SELECT id FROM games WHERE name LIKE ? OR code = ?',
        [`%${item.brand}%`, item.brand.toLowerCase()]
      );
      
      if (games.length === 0) continue;
      
      const gameId = games[0].id;
      const price = parseFloat(item.price);
      const priceSell = Math.ceil(price * 1.10); // markup 10%
      
      if (existing.length > 0) {
        // Update
        await pool.query(
          `UPDATE denominations 
           SET name = ?, price = ?, price_supplier = ?, is_active = ?
           WHERE id = ?`,
          [
            item.product_name,
            priceSell,
            price,
            item.buyer_product_status ? 1 : 0,
            existing[0].id,
          ]
        );
        updated++;
      } else {
        // Insert
        await pool.query(
          `INSERT INTO denominations 
           (game_id, sku, name, price, price_supplier, is_active)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            gameId,
            item.buyer_sku_code,
            item.product_name,
            priceSell,
            price,
            item.buyer_product_status ? 1 : 0,
          ]
        );
        inserted++;
      }
    }
    
    return {
      success: true,
      updated,
      inserted,
      total: result.data.length,
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// WEBHOOK HANDLER
// ============================================================
// Digiflazz akan kirim POST ke endpoint webhook kita
// saat status transaksi berubah
// ============================================================
async function handleWebhook(body) {
  try {
    const { ref_id, status, sn, message, customer_no, buyer_sku_code } = body;
    
    if (!ref_id) {
      return { success: false, error: 'ref_id tidak ditemukan' };
    }
    
    // Cek signature
    const expectedSign = crypto
      .createHash('md5')
      .update(`${USERNAME}${API_KEY}${ref_id}`)
      .digest('hex');
    
    if (body.sign && body.sign !== expectedSign) {
      return { success: false, error: 'Signature tidak valid' };
    }
    
    // Update order status
    const statusLower = (status || '').toLowerCase();
    let orderStatus = 'processing';
    
    if (statusLower === 'sukses' || statusLower === 'success') {
      orderStatus = 'success';
    } else if (statusLower === 'gagal' || statusLower === 'failed') {
      orderStatus = 'failed';
    }
    
    await pool.query(
      `UPDATE orders 
       SET status = ?, supplier_ref = ?, supplier_sn = ?, notes = ?
       WHERE order_id = ?`,
      [orderStatus, ref_id, sn || null, message || null, ref_id]
    );
    
    return { success: true, status: orderStatus };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  cekSaldo,
  daftarHarga,
  topup,
  cekStatus,
  processOrder,
  syncHarga,
  handleWebhook,
};
