/**
 * DOÑA ROMANTIKA - Sales, Reporting, Cut-Off & CSV Export
 */

import { state } from './state.js';
import { API_BASE } from './config.js';
import { apiFetch, escapeHtml, formatCurrency, showToast } from './utils.js';
import { onTabChange } from './navigation.js';
import { openReceiptModal } from './payment.js';

export function initSalesControls() {
  const btnRefreshSales = document.getElementById('btn-refresh-sales');
  const salesDatePicker = document.getElementById('sales-date-picker');
  const btnDoSalesCutoff = document.getElementById('btn-do-cutoff');
  const btnExportSales = document.getElementById('btn-export-sales');

  if (btnRefreshSales) btnRefreshSales.addEventListener('click', fetchSalesSummary);

  document.querySelectorAll('#timeframe-pills .timeframe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#timeframe-pills .timeframe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSalesTimeframe = btn.getAttribute('data-timeframe');
      state.currentSalesDate = '';
      if (salesDatePicker) salesDatePicker.value = '';
      fetchSalesSummary();
    });
  });

  if (salesDatePicker) {
    salesDatePicker.addEventListener('change', (e) => {
      state.currentSalesDate = e.target.value;
      if (state.currentSalesDate) {
        document.querySelectorAll('#timeframe-pills .timeframe-btn').forEach(b => b.classList.remove('active'));
      }
      fetchSalesSummary();
    });
  }

  if (btnDoSalesCutoff) {
    btnDoSalesCutoff.addEventListener('click', performSalesCutoff);
  }

  if (btnExportSales) {
    btnExportSales.addEventListener('click', triggerSalesExport);
  }

  onTabChange('sales-tab', fetchSalesSummary);
}

export async function fetchSalesSummary() {
  const salesPeriodTag = document.getElementById('sales-period-tag');
  let url = `/api/sales?timeframe=${encodeURIComponent(state.currentSalesTimeframe)}`;
  if (state.currentSalesDate) {
    url += `&date=${encodeURIComponent(state.currentSalesDate)}`;
  }

  if (salesPeriodTag) {
    if (state.currentSalesDate) {
      salesPeriodTag.textContent = `Date: ${state.currentSalesDate}`;
    } else {
      const names = { daily: 'Today', weekly: 'This Week', monthly: 'This Month', current: 'Current Shift', all: 'All Time' };
      salesPeriodTag.textContent = `Period: ${names[state.currentSalesTimeframe] || state.currentSalesTimeframe}`;
    }
  }

  try {
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Failed to fetch sales');
    const data = await res.json();
    if (data.status === 'success') {
      renderSalesKPI(data.sales);
      renderSoldGoodsTable(data.sales.sold_goods || []);
      renderSalesTable(data.sales.completed_orders || []);
    }
  } catch (err) {
    console.error('Error loading sales summary:', err);
  }
}

export function renderSalesKPI(sales) {
  const kpiRevenue = document.getElementById('kpi-revenue');
  const kpiPax = document.getElementById('kpi-pax');
  const kpiOrders = document.getElementById('kpi-orders');
  const kpiAvg = document.getElementById('kpi-avg');

  if (kpiRevenue) kpiRevenue.textContent = formatCurrency(sales.total_revenue);
  if (kpiPax) kpiPax.textContent = (sales.total_pax || 0).toLocaleString();
  if (kpiOrders) kpiOrders.textContent = (sales.total_orders || 0).toLocaleString();
  const avg = sales.total_orders > 0 ? (sales.total_revenue / sales.total_orders) : 0;
  if (kpiAvg) kpiAvg.textContent = formatCurrency(avg);
}

export function renderSoldGoodsTable(soldGoodsList) {
  const soldGoodsTableBody = document.getElementById('sold-goods-table-body');
  if (!soldGoodsTableBody) return;
  soldGoodsTableBody.innerHTML = '';

  if (!soldGoodsList || soldGoodsList.length === 0) {
    soldGoodsTableBody.innerHTML = `
      <tr>
        <td colspan="2" class="text-center text-muted" style="padding: 1.5rem;">No goods or products sold for this period.</td>
      </tr>
    `;
    return;
  }

  soldGoodsList.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${escapeHtml(item.product_name)}</div>
        <div style="font-size: 0.75rem; color: #64748b;">Category: ${escapeHtml(item.category)}</div>
      </td>
      <td style="text-align: right;">
        <span class="qty-highlight">${item.quantity_sold}</span>
        <span style="font-size: 0.8rem; color: #64748b; margin-left: 4px;">${escapeHtml(item.unit || 'units')}</span>
      </td>
    `;
    soldGoodsTableBody.appendChild(tr);
  });
}

export function renderSalesTable(completedOrders) {
  const salesTableBody = document.getElementById('sales-table-body');
  if (!salesTableBody) return;
  salesTableBody.innerHTML = '';
  if (!completedOrders || completedOrders.length === 0) {
    salesTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted" style="padding: 2rem;">No completed transactions recorded for this period.</td>
      </tr>
    `;
    return;
  }

  completedOrders.forEach(order => {
    const tr = document.createElement('tr');
    let itemDetails = [];
    if (order.unli_plan_name) {
      itemDetails.push(`<strong>${escapeHtml(order.unli_plan_name)}</strong> (${order.pax} pax)`);
    }
    if (order.items && order.items.length > 0) {
      order.items.forEach(i => itemDetails.push(`${escapeHtml(i.item_name)} (${i.quantity})`));
    }

    tr.innerHTML = `
      <td><strong>${escapeHtml(order.receipt_number || '')}</strong></td>
      <td><span class="badge" style="background:#e2e8f0; color:#333; padding: 2px 6px; border-radius: 4px;">${escapeHtml(order.table_number)}</span></td>
      <td>${escapeHtml(order.waiter)}</td>
      <td><strong>${order.pax || 0}</strong></td>
      <td style="font-size: 0.82rem;">${itemDetails.join(', ') || '-'}</td>
      <td><strong style="color:#c21d24; font-family:'JetBrains Mono', monospace;">${formatCurrency(order.amount_paid || order.gross_total)}</strong></td>
      <td style="font-size: 0.8rem; color:#64748b;">${escapeHtml(order.paid_at || order.updated_at || '-')}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-view-receipt" data-id="${order.id}">📄 View Receipt</button>
      </td>
    `;

    tr.querySelector('.btn-view-receipt').addEventListener('click', () => openReceiptModal(order));
    salesTableBody.appendChild(tr);
  });
}

export async function performSalesCutoff() {
  const confirmed = confirm(
    'Shift Cut-Off\n\nThis will archive all current shift\'s PAID orders and reset the active shift total.\n\nProceed with cut-off?'
  );
  if (!confirmed) return;

  const notes = prompt('Optional: Enter note for this cut-off (e.g. "Lunch Shift", "Cashier Juan"):') || '';

  try {
    const res = await apiFetch('/api/sales/cutoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Cut-off failed. No paid orders in current shift.');
      return;
    }
    showToast(`✂️ ${data.message}`);
    fetchSalesSummary();
  } catch (err) {
    alert('Server error during cut-off. Check server window.');
  }
}

export function triggerSalesExport() {
  let url = `${API_BASE}/api/sales/export?timeframe=${encodeURIComponent(state.currentSalesTimeframe)}`;
  if (state.currentSalesDate) url += `&date=${encodeURIComponent(state.currentSalesDate)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('📥 Downloading sales report CSV...');
}

