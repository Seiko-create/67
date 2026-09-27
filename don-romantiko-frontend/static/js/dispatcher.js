/**
 * DOÑA ROMANTIKA - Kitchen Meat Dispatcher & Refill Analytics
 */

import { apiFetch, escapeHtml, showToast } from './utils.js';
import { onTabChange } from './navigation.js';
import { loadInventory } from './inventory.js';

export function getAllowedMeatsForPlan(planName) {
  if (!planName) return [];
  const name = planName.toUpperCase();
  const allowed = [];

  const isAll = name.includes('ALL') || name.includes('PREMIUM');
  const hasJowls = name.includes('JOWL') || isAll;
  const hasPork = (name.includes('PORK') || name.includes('BELLY')) || isAll;
  const hasBeef = name.includes('BEEF') || isAll;
  const hasWings = (name.includes('WING') || name.includes('CHICKEN')) || isAll;

  if (hasPork) allowed.push('Pork Belly');
  if (hasJowls) allowed.push('Pork Jowls');
  if (hasBeef) allowed.push('Beef Samgyup');
  if (hasWings) allowed.push('Chicken Wings');

  return allowed;
}

export function initDispatcherTab() {
  const btnRefreshDispatcher = document.getElementById('btn-refresh-dispatcher');
  const dispatcherDatePicker = document.getElementById('dispatcher-date-picker');

  if (btnRefreshDispatcher) {
    btnRefreshDispatcher.addEventListener('click', () => {
      fetchDispatcherTables();
      loadDispatcherAnalytics();
    });
  }

  if (dispatcherDatePicker) {
    dispatcherDatePicker.addEventListener('change', loadDispatcherAnalytics);
  }

  onTabChange('dispatcher-tab', () => {
    fetchDispatcherTables();
    loadDispatcherAnalytics();
  });
}

export async function loadDispatcherAnalytics() {
  const dispatcherMeatSummaryBody = document.getElementById('dispatcher-meat-summary-body');
  const dispatcherDatePicker = document.getElementById('dispatcher-date-picker');
  const dispatcherDateTag = document.getElementById('dispatcher-date-tag');
  if (!dispatcherMeatSummaryBody) return;

  const dateVal = dispatcherDatePicker ? dispatcherDatePicker.value : '';
  const today = new Date().toISOString().split('T')[0];
  const queryDate = dateVal || today;

  if (dispatcherDateTag) {
    dispatcherDateTag.textContent = dateVal
      ? `Date: ${dateVal}`
      : `Date: Today (${today})`;
  }

  dispatcherMeatSummaryBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:1rem;">Loading...</td></tr>`;

  try {
    const res = await apiFetch(`/api/dispatcher/analytics?date=${encodeURIComponent(queryDate)}`);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Analytics fetch failed:', res.status, errText);
      dispatcherMeatSummaryBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#dc2626; padding:1rem;">⚠️ Could not load data (${res.status}). Check console.</td></tr>`;
      return;
    }
    const data = await res.json();
    const summary = data.refills_summary || [];

    if (summary.length === 0) {
      dispatcherMeatSummaryBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 1.5rem;">No meat refills logged for ${queryDate}.</td></tr>`;
      return;
    }

    const rowsHtml = summary.map(rf => {
      const plates = Number(rf.total_plates || 0);
      const grams = Number(rf.total_grams_consumed || 0);
      const kg = grams / 1000;
      return `
        <tr>
          <td><strong>🥩 ${escapeHtml(rf.meat_type)}</strong></td>
          <td><strong style="color:var(--primary); font-size:1.05rem;">${plates} plates</strong></td>
          <td><strong>${kg.toFixed(2)} kg</strong></td>
          <td>${grams.toLocaleString()} g</td>
          <td style="color:#64748b; font-size:0.85rem;">${plates} × 200g servings</td>
        </tr>
      `;
    }).join('');

    dispatcherMeatSummaryBody.innerHTML = rowsHtml;
  } catch (err) {
    console.error('Error loading dispatcher analytics:', err);
    dispatcherMeatSummaryBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#dc2626; padding:1rem;">⚠️ Network error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

export async function fetchDispatcherTables() {
  const dispatcherGrid = document.getElementById('dispatcher-grid');
  const dispatcherBadge = document.getElementById('dispatcher-badge');
  if (!dispatcherGrid) return;

  try {
    const res = await apiFetch('/api/orders?status=ON%20HOLD');
    if (!res.ok) return;
    const data = await res.json();
    const allOrders = data.orders || [];
    // Filter tables that have an active Unlimited Plan
    const unliOrders = allOrders.filter(o => o.unli_plan_name || (o.unli_plan && o.unli_plan.name));
    if (dispatcherBadge) dispatcherBadge.textContent = unliOrders.length;

    if (unliOrders.length === 0) {
      dispatcherGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-icon">🥩</div>
          <h3>No Active Unlimited Tables</h3>
          <p>When customers open an unlimited dining session, their table will appear here for meat refilling.</p>
        </div>
      `;
      return;
    }

    // Fetch live refills for each order in parallel
    const refillPromises = unliOrders.map(o =>
      apiFetch(`/api/orders/${o.id}/refills`)
        .then(r => r.json())
        .then(d => ({ orderId: o.id, refills: d.refills || [] }))
        .catch(() => ({ orderId: o.id, refills: [] }))
    );

    const refillsResults = await Promise.all(refillPromises);
    const refillsMap = {};
    refillsResults.forEach(r => { refillsMap[r.orderId] = r.refills; });

    dispatcherGrid.innerHTML = unliOrders.map(order => {
      const planName = order.unli_plan_name || order.unli_plan?.name || '';
      const allowedMeats = getAllowedMeatsForPlan(planName);

      const isPorkAllowed = allowedMeats.includes('Pork Belly');
      const isJowlsAllowed = allowedMeats.includes('Pork Jowls');
      const isBeefAllowed = allowedMeats.includes('Beef Samgyup');
      const isWingsAllowed = allowedMeats.includes('Chicken Wings');

      const orderRefills = refillsMap[order.id] || [];
      const totals = {};
      let totalGrams = 0;
      let totalPlates = 0;

      orderRefills.forEach(rf => {
        totals[rf.meat_type] = (totals[rf.meat_type] || 0) + rf.plates_count;
        totalGrams += rf.total_grams;
        totalPlates += rf.plates_count;
      });

      const tagsHtml = Object.keys(totals).length > 0
        ? Object.keys(totals).map(k => `<span class="refill-tag">${escapeHtml(k)}: <strong>${totals[k]}p</strong> (${(totals[k] * 0.2).toFixed(2)}kg)</span>`).join('')
        : '<span style="font-size:0.75rem; color:#94a3b8;">No plate refills dispatched yet</span>';

      return `
        <div class="dispatcher-card" data-order-id="${order.id}">
          <div class="dispatcher-card-header">
            <div>
              <div class="dispatcher-table-title">${escapeHtml(order.table_number)}</div>
              <div class="dispatcher-plan-badge">🥩 ${escapeHtml(planName)} (${order.pax || order.unli_plan?.pax} PAX)</div>
            </div>
            <span class="table-card-no">${escapeHtml(order.order_number)}</span>
          </div>

          <div class="dispatcher-stats">
            <div>
              <small style="color:#881337; font-weight:700;">TOTAL DISPATCHED</small>
              <div class="dispatcher-stats-plates">${totalPlates} Plates</div>
            </div>
            <div style="text-align: right;">
              <small style="color:#64748b; font-weight:700;">CONSUMED</small>
              <div class="dispatcher-stats-grams">${(totalGrams / 1000).toFixed(2)} kg <small>(${totalGrams.toLocaleString()}g)</small></div>
            </div>
          </div>

          <div class="dispatcher-buttons">
            <button type="button" class="btn-dispatch" data-order-id="${order.id}" data-meat="Pork Belly" ${!isPorkAllowed ? 'disabled title="Not included in ' + escapeHtml(planName) + '"' : 'title="Dispatch +1 Pork Belly (200g)"'}>
              <span>${isPorkAllowed ? '+1 Pork Belly' : '🔒 Pork Belly'}</span>
              <small>${isPorkAllowed ? '0.20 kg / plate' : 'Not in plan'}</small>
            </button>
            <button type="button" class="btn-dispatch" data-order-id="${order.id}" data-meat="Pork Jowls" ${!isJowlsAllowed ? 'disabled title="Not included in ' + escapeHtml(planName) + '"' : 'title="Dispatch +1 Pork Jowls (200g)"'}>
              <span>${isJowlsAllowed ? '+1 Pork Jowls' : '🔒 Pork Jowls'}</span>
              <small>${isJowlsAllowed ? '0.20 kg / plate' : 'Not in plan'}</small>
            </button>
            <button type="button" class="btn-dispatch" data-order-id="${order.id}" data-meat="Beef Samgyup" ${!isBeefAllowed ? 'disabled title="Not included in ' + escapeHtml(planName) + '"' : 'title="Dispatch +1 Beef Samgyup (200g)"'}>
              <span>${isBeefAllowed ? '+1 Beef Samgyup' : '🔒 Beef Samgyup'}</span>
              <small>${isBeefAllowed ? '0.20 kg / plate' : 'Not in plan'}</small>
            </button>
            <button type="button" class="btn-dispatch" data-order-id="${order.id}" data-meat="Chicken Wings" ${!isWingsAllowed ? 'disabled title="Not included in ' + escapeHtml(planName) + '"' : 'title="Dispatch +1 Wings Refill (200g)"'}>
              <span>${isWingsAllowed ? '+1 Wings Refill' : '🔒 Wings Refill'}</span>
              <small>${isWingsAllowed ? '0.20 kg serving' : 'Not in plan'}</small>
            </button>
          </div>

          <div class="refill-log-tags" style="margin-top: 0.5rem; border-top: 1px dashed #fecdd3; padding-top: 0.5rem;">
            ${tagsHtml}
          </div>
        </div>
      `;
    }).join('');

    // Attach dispatch events
    dispatcherGrid.querySelectorAll('.btn-dispatch:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.orderId;
        const meatType = btn.dataset.meat;
        try {
          const res = await apiFetch(`/api/orders/${orderId}/refills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meat_type: meatType, plates_count: 1, grams_per_plate: 200.0 })
          });
          if (res.ok) {
            showToast(`🥩 Dispatched +1 ${meatType} (0.20 kg)!`);
            fetchDispatcherTables();
            loadDispatcherAnalytics();
            loadInventory();
          }
        } catch (err) {
          alert('Failed to log dispatch refill.');
        }
      });
    });
  } catch (err) {
    console.error('Error fetching dispatcher tables:', err);
  }
}

