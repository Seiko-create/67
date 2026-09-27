/**
 * DOÑA ROMANTIKA - Cashier, Catalog & Order Entry Slip
 */

import { state, getCurrentWaiter, createDefaultOrder } from './state.js';
import { apiFetch, escapeHtml, formatCurrency, showToast } from './utils.js';
import { openPaxModal } from './pax-modal.js';
import { openPaymentModal } from './payment.js';
import { fetchActiveTables } from './tables.js';
import { fetchDispatcherTables } from './dispatcher.js';
import { switchToTab } from './navigation.js';
import {
  saveOfflineOrder,
  cacheMenuCatalog,
  getCachedMenuCatalog,
  getDeviceId
} from './offline-db.js';

export function checkCurrentTableOccupiedStatus() {
  const tableStatusIndicator = document.getElementById('table-status-indicator');
  const btnOpenTable = document.getElementById('btn-open-table');
  const tableInput = document.getElementById('table-input');
  if (!tableStatusIndicator) return;

  if (state.currentOrder.id) {
    tableStatusIndicator.className = 'table-status-indicator available';
    tableStatusIndicator.textContent = 'Active Session';
    if (btnOpenTable) btnOpenTable.disabled = true;
    return;
  }

  const rawVal = tableInput ? tableInput.value.trim() : '1';
  const tableNum = parseInt(rawVal) || 1;
  const occupiedNumbers = getOccupiedTableNumbers();

  if (occupiedNumbers.has(tableNum)) {
    tableStatusIndicator.className = 'table-status-indicator occupied';
    tableStatusIndicator.textContent = '⚠️ Occupied';
    if (btnOpenTable) {
      btnOpenTable.disabled = true;
      btnOpenTable.title = `Table ${tableNum} has an active ongoing order. Open it from Active Tables.`;
    }
  } else {
    tableStatusIndicator.className = 'table-status-indicator available';
    tableStatusIndicator.textContent = '✓ Available';
    if (btnOpenTable) {
      btnOpenTable.disabled = false;
      btnOpenTable.title = 'Open this table before adding items';
    }
  }
}

export function getOccupiedTableNumbers() {
  return new Set(
    state.activeTableOrders
      .map(order => String(order.table_number || '').match(/\d+/)?.[0])
      .filter(Boolean)
      .map(Number)
  );
}

export function getNextTableNumber() {
  const occupiedNumbers = getOccupiedTableNumbers();
  let candidate = 1;
  while (occupiedNumbers.has(candidate)) candidate += 1;
  return candidate;
}

export function getAvailableTableNumber(startNumber, direction) {
  const occupiedNumbers = getOccupiedTableNumbers();
  let candidate = Math.max(1, startNumber);
  while (occupiedNumbers.has(candidate) && candidate > 1 && direction < 0) {
    candidate -= 1;
  }
  if (!occupiedNumbers.has(candidate)) return candidate;

  candidate = Math.max(1, startNumber);
  while (occupiedNumbers.has(candidate)) candidate += 1;
  return candidate;
}

export function changeTableNumber(amount) {
  const tableInput = document.getElementById('table-input');
  const slipTableVal = document.getElementById('slip-table-val');
  if (state.currentOrder.id || !tableInput) return;
  const currentNumber = Number(tableInput.value) || 1;
  const nextNumber = getAvailableTableNumber(currentNumber + amount, amount);
  tableInput.value = nextNumber;
  state.currentOrder.table_number = `Table ${nextNumber}`;
  if (slipTableVal) slipTableVal.textContent = escapeHtml(state.currentOrder.table_number);
  checkCurrentTableOccupiedStatus();
}

export async function startNewTable() {
  const tableInput = document.getElementById('table-input');
  const waiterInput = document.getElementById('waiter-input');
  const customerInput = document.getElementById('customer-input');

  await fetchActiveTables();
  resetOrderForm();
  const nextTableNumber = getNextTableNumber();
  if (tableInput) tableInput.value = nextTableNumber;
  if (waiterInput) waiterInput.value = getCurrentWaiter();
  if (customerInput) customerInput.value = '';
  state.currentOrder.table_number = `Table ${nextTableNumber}`;
  state.currentOrder.waiter = getCurrentWaiter();
  openTable();
}

export function resetOrderForm() {
  const tableInput = document.getElementById('table-input');
  const customerInput = document.getElementById('customer-input');
  const nextTableNumber = getNextTableNumber();

  if (tableInput) tableInput.value = nextTableNumber;
  state.currentOrder = {
    ...createDefaultOrder(),
    table_number: `Table ${nextTableNumber}`
  };
  if (customerInput) customerInput.value = '';
  renderLiveSlip();
  renderMenu();
  checkCurrentTableOccupiedStatus();
}

export function initHeaderInputs() {
  const tableNumberDown = document.getElementById('table-number-down');
  const tableNumberUp = document.getElementById('table-number-up');
  const tableInput = document.getElementById('table-input');
  const waiterInput = document.getElementById('waiter-input');
  const customerInput = document.getElementById('customer-input');
  const btnNewOrder = document.getElementById('btn-new-order');
  const btnOpenTable = document.getElementById('btn-open-table');
  const slipTableVal = document.getElementById('slip-table-val');
  const slipWaiterVal = document.getElementById('slip-waiter-val');
  const btnAddTable = document.getElementById('btn-add-table');

  if (btnAddTable) btnAddTable.addEventListener('click', startNewTable);

  if (tableNumberDown) tableNumberDown.addEventListener('click', () => changeTableNumber(-1));
  if (tableNumberUp) tableNumberUp.addEventListener('click', () => changeTableNumber(1));

  if (tableInput) {
    tableInput.addEventListener('input', (e) => {
      const rawVal = e.target.value.trim();
      if (rawVal) {
        state.currentOrder.table_number = rawVal.toLowerCase().startsWith('table') ? rawVal : `Table ${rawVal}`;
      } else {
        state.currentOrder.table_number = 'Table 1';
      }
      if (slipTableVal) slipTableVal.textContent = escapeHtml(state.currentOrder.table_number);
      checkCurrentTableOccupiedStatus();
    });
  }

  if (waiterInput) {
    waiterInput.addEventListener('input', (e) => {
      state.currentOrder.waiter = e.target.value.trim() || 'Server';
      if (slipWaiterVal) slipWaiterVal.textContent = escapeHtml(state.currentOrder.waiter);
    });
  }

  if (customerInput) {
    customerInput.addEventListener('input', (e) => {
      state.currentOrder.customer = e.target.value.trim();
    });
  }

  if (btnNewOrder) {
    btnNewOrder.addEventListener('click', () => {
      if (confirm('Start a fresh order ticket? Any unsaved changes on this draft will be cleared.')) {
        resetOrderForm();
        showToast('Fresh order sheet ready!');
      }
    });
  }

  if (btnOpenTable) {
    btnOpenTable.addEventListener('click', openTable);
  }
  checkCurrentTableOccupiedStatus();
}

// ================= MENU & CATALOG =================
export async function loadMenuFromBackend() {
  try {
    const res = await apiFetch('/api/menu');
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();
    if (data.status === 'success') {
      state.menuCatalog = data.menu;
      cacheMenuCatalog(data.menu);
      renderMenu();
    }
  } catch (err) {
    console.warn('Network issue fetching menu from server, checking local IndexedDB cache:', err);
    const cached = await getCachedMenuCatalog();
    if (cached && Object.keys(cached).length > 0) {
      state.menuCatalog = cached;
      renderMenu();
      showToast('⚡ Server offline: Loaded cached menu catalog from local database.');
    } else {
      showToast('⚠️ Cannot connect to backend server. Make sure Python is running.');
    }
  }
}

export function initCatalogFilters() {
  const categoryTabs = document.querySelectorAll('#category-tabs .cat-btn');
  const itemSearchInput = document.getElementById('item-search');

  categoryTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCategory = btn.getAttribute('data-category');
      renderMenu();
    });
  });

  if (itemSearchInput) {
    itemSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderMenu();
    });
  }
}

export function renderMenu() {
  const menuGrid = document.getElementById('menu-grid');
  if (!menuGrid) return;
  menuGrid.innerHTML = '';

  let allItems = [];
  if (state.activeCategory === 'ALL') {
    Object.values(state.menuCatalog).forEach(catItems => {
      allItems = allItems.concat(catItems);
    });
  } else if (state.menuCatalog[state.activeCategory]) {
    allItems = state.menuCatalog[state.activeCategory];
  }

  if (state.searchQuery) {
    allItems = allItems.filter(item =>
      item.name.toLowerCase().includes(state.searchQuery) ||
      (item.description && item.description.toLowerCase().includes(state.searchQuery))
    );
  }

  if (allItems.length === 0) {
    menuGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 2.5rem;">No active menu items in this category.</div>`;
    return;
  }

  const hasActiveUnliPlan = Boolean(state.currentOrder.unli_plan);

  allItems.forEach(item => {
    const card = document.createElement('div');
    let isSelectedInOrder = false;
    let selectedQtyBadge = '';
    let isLockedUnli = false;

    if (item.is_unli) {
      if (hasActiveUnliPlan && state.currentOrder.unli_plan.name === item.name) {
        isSelectedInOrder = true;
        selectedQtyBadge = `<span style="background:#10b981; color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:10px; font-weight:700;">✓ Active Plan (${state.currentOrder.unli_plan.pax} PAX)</span>`;
      } else if (hasActiveUnliPlan) {
        // SINGLE UNLIMITED PLAN LOCK: Lock out other unlimited options
        isLockedUnli = true;
      }
    } else if (!item.is_unli && state.currentOrder.items) {
      const found = state.currentOrder.items.find(i => i.name === item.name || i.id === item.id);
      if (found && found.quantity > 0) {
        isSelectedInOrder = true;
        selectedQtyBadge = `<span style="background:#10b981; color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:10px; font-weight:700;">✓ In Slip (${found.quantity})</span>`;
      }
    }

    const isLeftover = item.category === 'LEFTOVER CHARGES';
    card.className = `menu-card ${item.is_unli ? 'unli-badge-card' : ''} ${isLeftover ? 'leftover-card' : ''} ${isSelectedInOrder ? 'selected-in-cart' : ''} ${isLockedUnli ? 'plan-locked' : ''}`;
    
    if (isSelectedInOrder) {
      card.style.borderColor = '#10b981';
      card.style.backgroundColor = '#f0fdf4';
    }

    card.innerHTML = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
          <div class="menu-card-cat" style="${isLeftover ? 'color:#d97706;' : ''}">${escapeHtml(item.category)}</div>
          ${selectedQtyBadge}
        </div>
        <div class="menu-card-title">${escapeHtml(item.name)}</div>
        <div class="menu-card-desc">${escapeHtml(item.description || '')}</div>
      </div>
      <div class="menu-card-footer">
        <div class="menu-card-price">
          ${formatCurrency(item.price)} ${item.is_unli ? '<small>/ pax</small>' : ''}
        </div>
        <button class="menu-card-btn" style="${isSelectedInOrder ? 'background:#10b981; color:#fff; border-color:#10b981;' : ''}">
          ${item.is_unli ? (isSelectedInOrder ? 'Edit PAX' : (isLockedUnli ? 'Locked' : 'Select Plan')) : (isSelectedInOrder ? '+ Add More' : '+ Add')}
        </button>
      </div>
    `;

    if (!isLockedUnli) {
      card.addEventListener('click', () => handleMenuItemClick(item));
    }
    menuGrid.appendChild(card);
  });
}

export function handleMenuItemClick(item) {
  if (item.is_unli) {
    openPaxModal(item);
  } else {
    addAddonItem(item);
  }
}

export function addAddonItem(item) {
  const existing = state.currentOrder.items.find(i => (i.id && i.id === item.id) || i.name === item.name || i.item_name === item.name);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.currentOrder.items.push({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      category: item.category
    });
  }
  clientRecalculatePreview();
  renderLiveSlip();
  renderMenu();
  showToast(`Added "${item.name}" to slip`);
}

// ================= LIVE ORDER SLIP LOGIC =================
export function renderLiveSlip() {
  const currentSlipTag = document.getElementById('current-slip-tag');
  const slipDisplayNo = document.getElementById('slip-display-no');
  const slipTableVal = document.getElementById('slip-table-val');
  const slipWaiterVal = document.getElementById('slip-waiter-val');
  const slipDateVal = document.getElementById('slip-date-val');
  const slipTimeVal = document.getElementById('slip-time-val');
  const slipWindowBadge = document.getElementById('slip-window-badge');
  const slipStartTime = document.getElementById('slip-start-time');
  const slipEndTime = document.getElementById('slip-end-time');
  const slipUnliContent = document.getElementById('slip-unli-content');
  const slipItemsList = document.getElementById('slip-items-list');
  const slipGrossTotal = document.getElementById('slip-gross-total');
  const slipPaidRow = document.getElementById('slip-paid-row');
  const slipAmountPaid = document.getElementById('slip-amount-paid');
  const slipBalanceLabel = document.getElementById('slip-balance-label');
  const slipBalanceDue = document.getElementById('slip-balance-due');
  const slipStatusTag = document.getElementById('slip-status-tag');

  if (currentSlipTag) currentSlipTag.textContent = escapeHtml(state.currentOrder.order_number || 'New Draft');
  if (slipDisplayNo) slipDisplayNo.textContent = escapeHtml(state.currentOrder.order_number || 'New Draft');
  if (slipTableVal) slipTableVal.textContent = escapeHtml(state.currentOrder.table_number || 'Table 1');
  if (slipWaiterVal) slipWaiterVal.textContent = escapeHtml(state.currentOrder.waiter || 'Staff');
  if (slipDateVal) slipDateVal.textContent = state.currentOrder.date || '--';
  if (slipTimeVal) slipTimeVal.textContent = state.currentOrder.time || '--:--';

  // 2-Hour Dining Window
  if (state.currentOrder.unli_plan && state.currentOrder.start_time && state.currentOrder.end_time) {
    if (slipWindowBadge) slipWindowBadge.style.display = 'block';
    if (slipStartTime) slipStartTime.textContent = escapeHtml(state.currentOrder.start_time);
    if (slipEndTime) slipEndTime.textContent = escapeHtml(state.currentOrder.end_time);
  } else {
    if (slipWindowBadge) slipWindowBadge.style.display = 'none';
  }

  // Render Unlimited Plan
  if (slipUnliContent) {
    if (state.currentOrder.unli_plan) {
      const p = state.currentOrder.unli_plan;
      slipUnliContent.innerHTML = `
        <div class="slip-unli-item">
          <div class="slip-unli-main">
            <span>${escapeHtml(p.name)}</span>
            <span>${formatCurrency(p.subtotal)}</span>
          </div>
          <div class="slip-unli-detail">
            <span>${p.pax} PAX × ${formatCurrency(p.price)}</span>
            <button class="slip-unli-edit-btn" id="btn-edit-pax">✏️ Edit PAX / Plan</button>
          </div>
        </div>
      `;
      document.getElementById('btn-edit-pax')?.addEventListener('click', () => openPaxModal(p));
    } else {
      slipUnliContent.innerHTML = `<div class="empty-unli-hint">👉 Click any UNLIMITED plan from the menu to set up PAX</div>`;
    }
  }

  // Render Add-ons & Ala Carte Items
  if (slipItemsList) {
    if (state.currentOrder.items && state.currentOrder.items.length > 0) {
      slipItemsList.innerHTML = '';
      state.currentOrder.items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'slip-addon-row';
        row.innerHTML = `
          <div class="addon-info">
            <span class="addon-name">${escapeHtml(item.name || item.item_name)}</span>
            <span class="addon-unit-price">${formatCurrency(item.price || item.unit_price)} each</span>
          </div>
          <div class="addon-qty-controls">
            <button class="btn-qty-mini" data-action="dec" data-idx="${index}">-</button>
            <span class="addon-qty-val">${item.quantity}</span>
            <button class="btn-qty-mini" data-action="inc" data-idx="${index}">+</button>
          </div>
          <span class="addon-total-price">${formatCurrency((item.price || item.unit_price) * item.quantity)}</span>
        `;
        slipItemsList.appendChild(row);
      });

      slipItemsList.querySelectorAll('.btn-qty-mini').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-idx'));
          const action = btn.getAttribute('data-action');
          if (action === 'inc') {
            state.currentOrder.items[idx].quantity += 1;
          } else if (action === 'dec') {
            state.currentOrder.items[idx].quantity -= 1;
            if (state.currentOrder.items[idx].quantity <= 0) {
              state.currentOrder.items.splice(idx, 1);
            }
          }
          clientRecalculatePreview();
          renderLiveSlip();
          renderMenu();
        });
      });
    } else {
      slipItemsList.innerHTML = `<div class="empty-addons-hint">No extra items added yet</div>`;
    }
  }

  clientRecalculatePreview();

  if (slipGrossTotal) slipGrossTotal.textContent = formatCurrency(state.currentOrder.gross_total);
  if (slipPaidRow && slipAmountPaid && slipBalanceLabel) {
    if (state.currentOrder.amount_paid > 0) {
      slipPaidRow.style.display = 'flex';
      slipAmountPaid.textContent = `-${formatCurrency(state.currentOrder.amount_paid)}`;
      slipBalanceLabel.textContent = 'BALANCE DUE:';
    } else {
      slipPaidRow.style.display = 'none';
      slipBalanceLabel.textContent = 'TOTAL DUE:';
    }
  }

  if (slipBalanceDue) slipBalanceDue.textContent = formatCurrency(state.currentOrder.balance_due);
  if (slipStatusTag) slipStatusTag.textContent = `STATUS: ${escapeHtml(state.currentOrder.status || 'DRAFT')}`;
}

export function clientRecalculatePreview() {
  let unliSub = 0;
  if (state.currentOrder.unli_plan) {
    unliSub = (parseFloat(state.currentOrder.unli_plan.price) || 0) * (parseInt(state.currentOrder.unli_plan.pax) || 1);
    state.currentOrder.unli_plan.subtotal = unliSub;
    state.currentOrder.pax = state.currentOrder.unli_plan.pax;
  } else {
    state.currentOrder.pax = 0;
  }

  let itemsSub = 0;
  if (state.currentOrder.items) {
    state.currentOrder.items.forEach(item => {
      const price = parseFloat(item.price || item.unit_price) || 0;
      const qty = parseInt(item.quantity) || 1;
      item.subtotal = price * qty;
      itemsSub += item.subtotal;
    });
  }

  state.currentOrder.gross_total = unliSub + itemsSub;
  state.currentOrder.balance_due = Math.max(0, state.currentOrder.gross_total - (state.currentOrder.amount_paid || 0));
}

// ================= ORDER ACTIONS (SAVE, OPEN, PRINT) =================
export function initOrderActions() {
  const btnHoldOrder = document.getElementById('btn-hold-order');
  const btnPrintSlip = document.getElementById('btn-print-slip');
  const btnProceedPay = document.getElementById('btn-proceed-pay');

  if (btnHoldOrder) {
    btnHoldOrder.addEventListener('click', async () => {
      const saved = await saveCurrentOrderToServer('ON HOLD');
      if (saved) {
        showToast(`${saved.table_number || 'Table'} saved to Active Tables!`);
        resetOrderForm();
        await fetchActiveTables();
        await fetchDispatcherTables();
      }
    });
  }

  if (btnPrintSlip) {
    btnPrintSlip.addEventListener('click', () => window.print());
  }

  if (btnProceedPay) {
    btnProceedPay.addEventListener('click', openPaymentModal);
  }
}

export async function saveCurrentOrderToServer(status = 'ON HOLD') {
  const tableInput = document.getElementById('table-input');
  const waiterInput = document.getElementById('waiter-input');
  const customerInput = document.getElementById('customer-input');

  const tableNum = tableInput ? tableInput.value.trim() : '1';
  const formattedTable = state.currentOrder.table_number || (tableNum.toLowerCase().startsWith('table') ? tableNum : `Table ${tableNum}`);

  const payload = {
    id: state.currentOrder.id || null,
    offline_uuid: state.currentOrder.offline_uuid || null,
    device_id: getDeviceId(),
    table_number: formattedTable,
    waiter: state.currentOrder.waiter || (waiterInput ? waiterInput.value.trim() : 'Staff') || getCurrentWaiter(),
    customer: state.currentOrder.customer || (customerInput ? customerInput.value.trim() : '') || '',
    status: status,
    start_time: state.currentOrder.start_time,
    end_time: state.currentOrder.end_time,
    unli_plan: state.currentOrder.unli_plan,
    items: state.currentOrder.items
  };

  try {
    const res = await apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to save order');
    state.currentOrder.id = data.order.id;
    state.currentOrder.order_number = data.order.order_number;
    state.currentOrder.gross_total = data.order.gross_total;
    state.currentOrder.balance_due = data.order.balance_due;
    state.currentOrder.amount_paid = data.order.amount_paid;
    state.currentOrder.status = data.order.status;
    renderLiveSlip();
    return data.order;
  } catch (err) {
    console.warn('Server save error, falling back to local offline IndexedDB:', err);
    const isNetworkError = !navigator.onLine ||
      (err.name === 'TypeError' && String(err.message).toLowerCase().includes('fetch')) ||
      String(err.message).toLowerCase().includes('failed to fetch') ||
      String(err.message).toLowerCase().includes('network');

    if (isNetworkError) {
      const offlineOrder = {
        ...state.currentOrder,
        table_number: formattedTable,
        waiter: payload.waiter,
        customer: payload.customer,
        status: status
      };
      const savedOffline = await saveOfflineOrder(offlineOrder);
      state.currentOrder = savedOffline;
      renderLiveSlip();
      showToast(`⚡ Server offline: Order ${savedOffline.order_number} saved locally on this tablet.`);
      return savedOffline;
    }

    alert(err.message || 'Failed to save order to server.');
    return null;
  }
}

export async function openTable() {
  const tableInput = document.getElementById('table-input');
  const waiterInput = document.getElementById('waiter-input');
  const customerInput = document.getElementById('customer-input');
  const btnOpenTable = document.getElementById('btn-open-table');

  const tableNum = tableInput ? (tableInput.value.trim() || '1') : '1';
  const waiter = waiterInput ? (waiterInput.value.trim() || getCurrentWaiter()) : getCurrentWaiter();
  const customer = customerInput ? customerInput.value.trim() : '';

  try {
    const res = await apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        open_table: true,
        table_number: `Table ${tableNum}`,
        waiter: waiter,
        customer: customer,
        status: 'ON HOLD',
        unli_plan: null,
        items: []
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Unable to open table.');
      return;
    }
    state.currentOrder = {
      id: data.order.id,
      order_number: data.order.order_number,
      table_number: data.order.table_number,
      waiter: data.order.waiter,
      customer: data.order.customer || '',
      unli_plan: null,
      items: [],
      gross_total: 0,
      amount_paid: 0,
      balance_due: 0,
      status: 'ON HOLD',
      start_time: data.order.start_time,
      end_time: data.order.end_time,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    if (btnOpenTable) btnOpenTable.disabled = true;
    switchToTab('cashier-tab');
    renderLiveSlip();
    renderMenu();
    showToast(`Table ${tableNum} opened! Select items from menu.`);
    await fetchActiveTables();
    await fetchDispatcherTables();
  } catch (err) {
    console.warn('Error opening table, checking offline status:', err);
    const isNetworkError = !navigator.onLine ||
      (err.name === 'TypeError' && String(err.message).toLowerCase().includes('fetch')) ||
      String(err.message).toLowerCase().includes('failed to fetch') ||
      String(err.message).toLowerCase().includes('network');

    if (isNetworkError) {
      const now = new Date();
      const start_time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const end_time = twoHoursLater.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newOfflineOrder = {
        ...createDefaultOrder(),
        table_number: `Table ${tableNum}`,
        waiter: waiter,
        customer: customer,
        status: 'ON HOLD',
        start_time: start_time,
        end_time: end_time
      };

      const savedOffline = await saveOfflineOrder(newOfflineOrder);
      state.currentOrder = savedOffline;
      if (btnOpenTable) btnOpenTable.disabled = true;
      switchToTab('cashier-tab');
      renderLiveSlip();
      renderMenu();
      showToast(`⚡ Server offline: Table ${tableNum} opened locally (${savedOffline.order_number}).`);
      return;
    }
    alert('Failed to connect to POS server.');
  }
}

