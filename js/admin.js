// ============================================================
// TOPUPKU – ADMIN DASHBOARD LOGIC
// © DanzModss
// ============================================================

const API_URL = window.location.origin + '/api/admin';
const $ = id => document.getElementById(id);

let authToken = localStorage.getItem('admin_token');
let refreshInterval = null;
let currentFilter = 'all';

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    showDashboard();
  } else {
    showLogin();
  }
  
  // Attach event listeners
  $('loginForm')?.addEventListener('submit', handleLogin);
  $('logoutBtn')?.addEventListener('click', handleLogout);
  $('refreshBtn')?.addEventListener('click', loadAll);
  $('searchOrder')?.addEventListener('input', filterOrders);
});

// ==================== LOGIN ====================
function showLogin() {
  $('loginPage').style.display = 'flex';
  $('dashboardPage').style.display = 'none';
}

function showDashboard() {
  $('loginPage').style.display = 'none';
  $('dashboardPage').style.display = 'block';
  loadAll();
  
  // Auto refresh tiap 30 detik
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(loadAll, 30000);
}

async function handleLogin(e) {
  e.preventDefault();
  
  const username = $('username').value.trim();
  const password = $('password').value;
  const btn = $('loginBtn');
  
  btn.disabled = true;
  btn.textContent = '⏳ LOGIN...';
  
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Login gagal');
    }
    
    authToken = data.token;
    localStorage.setItem('admin_token', authToken);
    
    showToast('✓ Login berhasil');
    showDashboard();
    
  } catch (err) {
    showToast('❌ ' + err.message);
    btn.disabled = false;
    btn.textContent = '🔐 MASUK';
  }
}

function handleLogout() {
  if (!confirm('Yakin mau logout?')) return;
  
  authToken = null;
  localStorage.removeItem('admin_token');
  
  if (refreshInterval) clearInterval(refreshInterval);
  
  showLogin();
  showToast('✓ Logout berhasil');
}

// ==================== LOAD ALL DATA ====================
async function loadAll() {
  await Promise.all([
    loadStats(),
    loadOrders(),
  ]);
}

// ==================== LOAD STATS ====================
async function loadStats() {
  try {
    const res = await fetch(`${API_URL}/stats`, {
      headers: { 'Authorization': 'Basic ' + authToken }
    });
    
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    const s = data.data;
    
    $('statTotalOrders').textContent = formatNumber(s.total_orders);
    $('statSuccessOrders').textContent = formatNumber(s.success_orders);
    $('statPendingOrders').textContent = formatNumber(s.pending_orders);
    $('statRevenue').textContent = 'Rp ' + formatNumber(s.revenue);
    
  } catch (err) {
    console.error('Load stats failed:', err);
  }
}

// ==================== LOAD ORDERS ====================
let allOrders = [];

async function loadOrders() {
  try {
    const res = await fetch(`${API_URL}/orders`, {
      headers: { 'Authorization': 'Basic ' + authToken }
    });
    
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    allOrders = data.data;
    renderOrders(allOrders);
    
  } catch (err) {
    console.error('Load orders failed:', err);
    showToast('❌ Gagal load orders');
  }
}

// ==================== RENDER ORDERS ====================
function renderOrders(orders) {
  const tbody = $('ordersBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:40px;color:var(--muted);">
          📭 Belum ada order
        </td>
      </tr>
    `;
    return;
  }
  
  orders.forEach(o => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${o.order_id}</code></td>
      <td>${o.buyer_name || '-'}</td>
      <td>
        <div style="font-weight:600;">${o.game_name || '-'}</div>
        <div style="font-size:0.75em;color:var(--muted);">${o.denom_name || '-'}</div>
      </td>
      <td><code>${o.user_game_id}${o.server_id ? ' (' + o.server_id + ')' : ''}</code></td>
      <td>${o.payment_name || '-'}</td>
      <td><strong>Rp ${formatNumber(o.total)}</strong></td>
      <td><span class="status-badge status-${o.status}">${o.status.toUpperCase()}</span></td>
      <td>
        <button class="action-btn" onclick="viewOrder('${o.order_id}')">👁️</button>
        <button class="action-btn" onclick="editOrder('${o.order_id}')">✏️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==================== FILTER ORDERS ====================
function filterOrders() {
  const q = $('searchOrder').value.toLowerCase().trim();
  
  let filtered = allOrders;
  
  // Filter by status
  if (currentFilter !== 'all') {
    filtered = filtered.filter(o => o.status === currentFilter);
  }
  
  // Filter by search
  if (q) {
    filtered = filtered.filter(o =>
      o.order_id.toLowerCase().includes(q) ||
      (o.buyer_name || '').toLowerCase().includes(q) ||
      (o.user_game_id || '').toLowerCase().includes(q) ||
      (o.contact || '').toLowerCase().includes(q)
    );
  }
  
  renderOrders(filtered);
}

// ==================== FILTER BY STATUS ====================
function setStatusFilter(status, btn) {
  currentFilter = status;
  
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  filterOrders();
}

// ==================== VIEW ORDER DETAIL ====================
async function viewOrder(orderId) {
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}`, {
      headers: { 'Authorization': 'Basic ' + authToken }
    });
    
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    const o = data.data;
    
    const modal = $('orderModal');
    $('modalBody').innerHTML = `
      <div class="detail-row">
        <div class="detail-label">Order ID</div>
        <div class="detail-value"><code>${o.order_id}</code></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Status</div>
        <div class="detail-value"><span class="status-badge status-${o.status}">${o.status.toUpperCase()}</span></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Game</div>
        <div class="detail-value">${o.game_name}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Item</div>
        <div class="detail-value">${o.denom_name}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">User Game ID</div>
        <div class="detail-value"><code>${o.user_game_id}${o.server_id ? ' (' + o.server_id + ')' : ''}</code></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Pembeli</div>
        <div class="detail-value">${o.buyer_name || '-'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Kontak</div>
        <div class="detail-value">${o.contact}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Metode Bayar</div>
        <div class="detail-value">${o.payment_name}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Harga</div>
        <div class="detail-value">Rp ${formatNumber(o.price)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Biaya Admin</div>
        <div class="detail-value">Rp ${formatNumber(o.fee)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Total</div>
        <div class="detail-value" style="color:var(--accent);font-size:1.2em;font-weight:bold;">Rp ${formatNumber(o.total)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Supplier Ref</div>
        <div class="detail-value">${o.supplier_ref || '-'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Supplier SN</div>
        <div class="detail-value">${o.supplier_sn || '-'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Catatan</div>
        <div class="detail-value">${o.notes || '-'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Dibuat</div>
        <div class="detail-value">${formatDate(o.created_at)}</div>
      </div>
    `;
    
    modal.classList.add('active');
    
  } catch (err) {
    showToast('❌ ' + err.message);
  }
}

// ==================== EDIT ORDER ====================
async function editOrder(orderId) {
  const status = prompt(
    'Ubah status order:\n\n' +
    'pending / paid / processing / success / failed / refund',
    'success'
  );
  
  if (!status) return;
  
  const validStatus = ['pending', 'paid', 'processing', 'success', 'failed', 'refund'];
  if (!validStatus.includes(status)) {
    showToast('❌ Status gak valid');
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}`, {
      method: 'PUT',
      headers: {
        'Authorization': 'Basic ' + authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    showToast('✓ Status diupdate ke ' + status);
    loadAll();
    
  } catch (err) {
    showToast('❌ ' + err.message);
  }
}

// ==================== CLOSE MODAL ====================
function closeModal() {
  $('orderModal').classList.remove('active');
}

// ==================== UTILS ====================
function formatNumber(n) {
  if (!n) return '0';
  return parseFloat(n).toLocaleString('id-ID');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('active');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.remove('active'), 2500);
}

// ==================== MODAL CLOSE ON CLICK OUTSIDE ====================
document.addEventListener('click', (e) => {
  if (e.target.id === 'orderModal') closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
