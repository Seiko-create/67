/**
 * DOÑA ROMANTIKA - Active Dining Tables & Session Monitoring
 */

import { state } from './state.js';
import { apiFetch, escapeHtml, formatCurrency, showToast } from './utils.js';
import { switchToTab, onTabChange } from './navigation.js';
import { renderLiveSlip, renderMenu, resetOrderForm } from './cashier.js';
import { fetchDispatcherTables } from './dispatcher.js';
import { getPendingSyncOrders } from './offline-db.js';

export function initActiveTablesTab() {
  const btnRefreshTables = document.getElementById('btn-refresh-tables');
  if (btnRefreshTables) {
    btnRefreshTables.addEventListener('click', fetchActiveTables);
  }
  onTabChange('active-tables-tab', fetchActiveTables);
}

export async function fetchActiveTables() {
  const activeTablesBadge = document.getElementById('active-tables-badge');
  try {
    const res = await apiFetch('/api/orders?status=ON%20HOLD');
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    if (data.status === 'success') {
      state.activeTableOrders = data.orders;
      renderActiveTables(data.orders);
      if (activeTablesBadge) activeTablesBadge.textContent = data.orders.length;
      return;
    }
  } catch (err) {
    console.warn('Network issue fetching active tables from server, checking local IndexedDB:', err);
    try {
      const pending = await getPendingSyncOrders();
      const offlineActive = pending.filter(o => o.status === 'ON HOLD');
      state.activeTableOrders = offlineActive;
      renderActiveTables(offlineActive);
      if (activeTablesBadge) activeTablesBadge.textContent = offlineActive.length;
    } catch (e) {
      console.error('Failed to load active tables from IndexedDB:', e);
    }
  }
}

export function renderActiveTables(orders) {
  const activeTablesGrid = document.getElementById('active-tables-grid');
  if (!activeTablesGrid) return;
  activeTablesGrid.innerHTML = '';

  if (!orders || orders.length === 0) {
    activeTablesGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🪑</div>
        <h3>No Active Tables Right Now</h3>
        <p>Click <strong>"➕ Add Table"</strong> to open a new dining table.</p>
      </div>
    `;
    return;
  }

  orders.forEach(order => {
    const card = document.createElement('div');
    card.className = 'table-card';

    let itemLines = [];
    if (order.unli_plan_name) {
      itemLines.push(`🥩 <strong>${escapeHtml(order.unli_plan_name)}</strong> (${order.pax} PAX)`);
    }
    if (order.items && order.items.length > 0) {
      order.items.forEach(i => itemLines.push(`• ${escapeHtml(i.item_name)} ×${i.quantity}`));
    }
    if (order.meat_refills && order.meat_refills.length > 0) {
      order.meat_refills.forEach(rf => itemLines.push(`🍖 Refill: ${escapeHtml(rf.meat_type)} (${rf.plates} plates)`));
    }

    card.innerHTML = `
      <div class="table-card-header">
        <div>
          <div class="table-card-title">${escapeHtml(order.table_number)}</div>
          <span class="table-card-no">${escapeHtml(order.order_number)}</span>
        </div>
        <div class="table-countdown" id="countdown-${order.id}">⏱️ 2h 00m</div>
      </div>
      <div class="table-card-meta">
        <div><strong>Waiter:</strong> ${escapeHtml(order.waiter)}</div>
        <div><strong>Customer:</strong> ${escapeHtml(order.customer || 'Walk-in')}</div>
        <div><strong>Window:</strong> ${escapeHtml(order.start_time || '--')} - ${escapeHtml(order.end_time || '--')}</div>
      </div>
      <div class="table-card-items">
        ${itemLines.length > 0 ? itemLines.join('<br>') : '<span class="text-muted">No items yet — table open</span>'}
      </div>
      <div class="table-card-footer">
        <div class="table-card-balance">
          <small>Balance Due</small>
          <strong>${formatCurrency(order.balance_due)}</strong>
        </div>
        <div class="table-card-actions">
          <button class="btn btn-secondary btn-sm btn-close-table" data-id="${order.id}">Close</button>
          <button class="btn btn-primary btn-sm btn-open-order" data-id="${order.id}">✏️ Open Slip</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-open-order').addEventListener('click', () => loadOrderIntoCashier(order));
    card.querySelector('.btn-close-table').addEventListener('click', () => closeActiveTableWithoutPay(order));
    activeTablesGrid.appendChild(card);
  });
}

export function updateActiveTableCountdowns() {
  if (!state.activeTableOrders || state.activeTableOrders.length === 0) return;
  const now = new Date();

  state.activeTableOrders.forEach(order => {
    const el = document.getElementById(`countdown-${order.id}`);
    if (!el || !order.end_time) return;

    try {
      const parts = order.end_time.split(/[: ]/);
      let hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const ampm = parts[2]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      const expiry = new Date();
      expiry.setHours(hours, minutes, 0, 0);
      if (expiry < now && now.getHours() - hours > 12) {
        expiry.setDate(expiry.getDate() + 1);
      }

      const diffMs = expiry - now;
      if (diffMs <= 0) {
        el.textContent = '⚠️ Time Expired!';
        el.style.backgroundColor = '#fee2e2';
        el.style.color = '#dc2626';
      } else {
        const totalSecs = Math.floor(diffMs / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        el.textContent = `⏱️ ${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
      }
    } catch (e) {
      el.textContent = '⏱️ Active';
    }
  });
}

export async function closeActiveTableWithoutPay(order) {
  if (!confirm(`Close ${order.table_number} without settling payment?`)) return;
  try {
    const res = await apiFetch(`/api/orders/${order.id}/close`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Failed to close table.');
      return;
    }
    if (state.currentOrder.id === order.id) resetOrderForm();
    showToast(`${order.table_number} closed.`);
    await fetchActiveTables();
    await fetchDispatcherTables();
  } catch (err) {
    alert('Failed to close table.');
  }
}

export function loadOrderIntoCashier(order) {
  const tableInput = document.getElementById('table-input');
  const waiterInput = document.getElementById('waiter-input');
  const customerInput = document.getElementById('customer-input');
  const btnOpenTable = document.getElementById('btn-open-table');

  state.currentOrder = {
    id: order.id,
    offline_uuid: order.offline_uuid || null,
    device_id: order.device_id || null,
    order_number: order.order_number,
    table_number: order.table_number,
    waiter: order.waiter,
    customer: order.customer || '',
    unli_plan: order.unli_plan ? {
      id: order.unli_plan.id,
      name: order.unli_plan.name,
      price: order.unli_plan.price,
      pax: order.unli_plan.pax,
      subtotal: order.unli_plan.subtotal
    } : null,
    items: order.items ? order.items.map(i => ({
      id: i.menu_item_id || i.id,
      name: i.item_name || i.name,
      price: i.unit_price || i.price,
      quantity: i.quantity,
      subtotal: i.subtotal
    })) : [],
    gross_total: parseFloat(order.gross_total) || 0,
    amount_paid: parseFloat(order.amount_paid) || 0,
    balance_due: parseFloat(order.balance_due) || 0,
    status: order.status,
    start_time: order.start_time,
    end_time: order.end_time,
    date: order.created_at ? order.created_at.split(' ')[0] : new Date().toISOString().split('T')[0],
    time: order.created_at ? order.created_at.split(' ')[1] : ''
  };

  if (tableInput) tableInput.value = state.currentOrder.table_number.match(/\d+/)?.[0] || '';
  if (waiterInput) waiterInput.value = state.currentOrder.waiter;
  if (customerInput) customerInput.value = state.currentOrder.customer || '';
  if (btnOpenTable) btnOpenTable.disabled = true;

  switchToTab('cashier-tab');
  renderLiveSlip();
  renderMenu();
  showToast(`Loaded ${order.table_number} (${order.order_number}) back to cashier!`);
}

