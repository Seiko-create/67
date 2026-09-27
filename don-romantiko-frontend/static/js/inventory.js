/**
 * DOÑA ROMANTIKA - Menu Items & Inventory Stock Management (Admin)
 */

import { state, isAdmin } from './state.js';
import { apiFetch, escapeHtml, formatCurrency, showToast } from './utils.js';
import { openAdminPinModal, loadAccounts } from './auth.js';
import { loadMenuFromBackend } from './cashier.js';
import { onTabChange } from './navigation.js';

export function initInventoryManagement() {
  const btnOpenStockModal = document.getElementById('btn-open-stock-modal');
  const btnCloseStockModal = document.getElementById('btn-close-stock-modal');
  const btnCancelStock = document.getElementById('btn-cancel-stock');
  const btnSaveStock = document.getElementById('btn-save-stock');
  const adjustStockModal = document.getElementById('adjust-stock-modal');

  const stockItemId = document.getElementById('stock-item-id');
  const stockItemName = document.getElementById('stock-item-name');
  const stockQtyInput = document.getElementById('stock-qty-input');
  const stockMinThreshold = document.getElementById('stock-min-threshold');
  const stockUnitSelect = document.getElementById('stock-unit-select');
  const stockItemCat = document.getElementById('stock-item-cat');

  if (btnOpenStockModal && adjustStockModal) {
    btnOpenStockModal.addEventListener('click', () => {
      if (stockItemId) stockItemId.value = '';
      if (stockItemName) stockItemName.value = '';
      if (stockQtyInput) stockQtyInput.value = '';
      if (stockMinThreshold) stockMinThreshold.value = '10';
      adjustStockModal.classList.add('active');
    });
  }

  if (btnCloseStockModal && adjustStockModal) {
    btnCloseStockModal.addEventListener('click', () => adjustStockModal.classList.remove('active'));
  }
  if (btnCancelStock && adjustStockModal) {
    btnCancelStock.addEventListener('click', () => adjustStockModal.classList.remove('active'));
  }

  if (btnSaveStock) {
    btnSaveStock.addEventListener('click', async () => {
      const id = stockItemId?.value ? parseInt(stockItemId.value) : null;
      const name = stockItemName?.value.trim();
      const qty = parseFloat(stockQtyInput?.value);
      const unit = stockUnitSelect?.value;
      const cat = stockItemCat?.value;
      const thresh = parseFloat(stockMinThreshold?.value) || 10;

      if (!name || isNaN(qty)) {
        alert('Please enter an item name and valid stock quantity.');
        return;
      }

      try {
        const res = await apiFetch('/api/inventory/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id, item_name: name, stock_qty: qty, unit: unit, category: cat, min_threshold: thresh })
        });
        if (!res.ok) throw new Error('Failed to update stock');
        if (adjustStockModal) adjustStockModal.classList.remove('active');
        showToast(`Stock for "${name}" updated to ${qty} ${unit}!`);
        loadInventory();
      } catch (err) {
        alert('Failed to update inventory stock.');
      }
    });
  }

  onTabChange('manage-menu-tab', () => {
    loadAdminMenu();
    loadInventory();
    if (isAdmin()) loadAccounts();
  });
}

export async function loadInventory() {
  const inventoryGroupsContainer = document.getElementById('inventory-groups-container');
  const adjustStockModal = document.getElementById('adjust-stock-modal');
  const stockItemId = document.getElementById('stock-item-id');
  const stockItemName = document.getElementById('stock-item-name');
  const stockQtyInput = document.getElementById('stock-qty-input');
  const stockUnitSelect = document.getElementById('stock-unit-select');
  const stockItemCat = document.getElementById('stock-item-cat');
  const stockMinThreshold = document.getElementById('stock-min-threshold');

  if (!inventoryGroupsContainer) return;
  try {
    const res = await apiFetch('/api/inventory');
    if (!res.ok) return;
    const data = await res.json();
    const inventory = data.inventory || [];

    // Group inventory items by category
    if (inventory.length === 0) {
      inventoryGroupsContainer.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">No inventory records found.</div>`;
    } else {
      const groups = {};
      const categoryLabels = {
        'MEAT': '🥩 MEAT & RAW INGREDIENTS',
        'DRINKS': '🍹 DRINKS & BEVERAGES',
        'SIDES': '🍚 SIDES, RICE & DIPS',
        'ALA CARTE': '🍱 ALA CARTE & NOODLES',
        'DESSERT': '🍦 DESSERTS',
        'GENERAL': '📦 GENERAL SUPPLIES'
      };

      inventory.forEach(item => {
        const cat = (item.category || 'GENERAL').toUpperCase();
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
      });

      const groupKeys = Object.keys(groups);
      inventoryGroupsContainer.innerHTML = groupKeys.map(catKey => {
        const catItems = groups[catKey];
        const catTitle = categoryLabels[catKey] || `📦 ${catKey}`;

        const rowsHtml = catItems.map(item => {
          let statusBadge = '<span class="stock-pill stock-good">In Stock</span>';
          if (item.stock_qty <= 0) {
            statusBadge = '<span class="stock-pill stock-out">Out of Stock</span>';
          } else if (item.stock_qty <= item.min_threshold) {
            statusBadge = '<span class="stock-pill stock-low">Low Stock</span>';
          }

          const displayQty = (item.unit === 'kg' || item.stock_qty % 1 !== 0)
            ? Number(item.stock_qty).toFixed(2)
            : Number(item.stock_qty).toLocaleString();

          return `
            <tr>
              <td><strong>${escapeHtml(item.item_name)}</strong></td>
              <td><strong style="font-size:1rem; font-family:'JetBrains Mono', monospace;">${displayQty}</strong></td>
              <td><strong>${escapeHtml(item.unit)}</strong></td>
              <td><span style="font-size:0.8rem; color:#64748b;">Alert &le; ${item.min_threshold} ${escapeHtml(item.unit)}</span></td>
              <td>${statusBadge}</td>
              <td>
                <button class="btn btn-secondary btn-sm btn-quick-stock" data-id="${item.id}" data-name="${escapeHtml(item.item_name)}" data-qty="${item.stock_qty}" data-unit="${item.unit}" data-cat="${item.category}" data-thresh="${item.min_threshold}">✏️ Adjust</button>
              </td>
            </tr>
          `;
        }).join('');

        return `
          <div class="inventory-category-group">
            <div class="inventory-group-header">
              <div class="inventory-group-title">${catTitle}</div>
              <span class="inventory-group-count">${catItems.length} items</span>
            </div>
            <div class="table-responsive">
              <table class="sales-table admin-table">
                <thead>
                  <tr>
                    <th style="width:34%;">Item / Material Name</th>
                    <th style="width:20%;">Current Stock</th>
                    <th style="width:12%;">Unit</th>
                    <th style="width:16%;">Threshold</th>
                    <th style="width:10%;">Status</th>
                    <th style="width:8%;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');

      inventoryGroupsContainer.querySelectorAll('.btn-quick-stock').forEach(btn => {
        btn.addEventListener('click', () => {
          if (stockItemId) stockItemId.value = btn.dataset.id || '';
          if (stockItemName) stockItemName.value = btn.dataset.name;
          if (stockQtyInput) stockQtyInput.value = btn.dataset.qty;
          if (stockUnitSelect) stockUnitSelect.value = btn.dataset.unit;
          if (stockItemCat) stockItemCat.value = btn.dataset.cat;
          if (stockMinThreshold) stockMinThreshold.value = btn.dataset.thresh;
          if (adjustStockModal) adjustStockModal.classList.add('active');
        });
      });
    }
  } catch (err) {
    console.error('Error loading inventory:', err);
  }
}

export function initAdminMenu() {
  const adminCategoryTabs = document.querySelectorAll('#admin-category-tabs .cat-btn');
  const btnOpenAddItemModal = document.getElementById('btn-open-add-item-modal');
  const btnCloseAddItemModal = document.getElementById('btn-close-add-item-modal');
  const btnCancelAddItem = document.getElementById('btn-cancel-add-item');
  const btnSaveNewItem = document.getElementById('btn-save-new-item');
  const addItemModal = document.getElementById('add-item-modal');
  const editItemId = document.getElementById('edit-item-id');
  const modalMenuTitle = document.getElementById('modal-menu-title');
  const newItemName = document.getElementById('new-item-name');
  const newItemCat = document.getElementById('new-item-cat');
  const newItemPrice = document.getElementById('new-item-price');
  const newItemUnli = document.getElementById('new-item-unli');
  const newItemDesc = document.getElementById('new-item-desc');
  const newItemStock = document.getElementById('new-item-stock');
  const newItemUnit = document.getElementById('new-item-unit');
  const newItemStockRow = document.getElementById('new-item-stock-row');

  adminCategoryTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      adminCategoryTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.adminActiveCategory = btn.getAttribute('data-admin-cat');
      renderAdminMenuTable();
    });
  });

  const resetAddItemModal = () => {
    if (editItemId) editItemId.value = '';
    if (modalMenuTitle) modalMenuTitle.textContent = 'Add New Menu Item';
    if (newItemName) newItemName.value = '';
    if (newItemPrice) newItemPrice.value = '';
    if (newItemDesc) newItemDesc.value = '';
    if (newItemUnli) newItemUnli.checked = false;
    if (newItemStock) newItemStock.value = '0';
    if (newItemUnit) newItemUnit.value = 'pcs';
    if (newItemStockRow) newItemStockRow.style.display = 'grid';
    if (addItemModal) addItemModal.classList.add('active');
  };

  if (btnOpenAddItemModal) {
    btnOpenAddItemModal.addEventListener('click', () => {
      if (!isAdmin()) {
        openAdminPinModal(resetAddItemModal);
        return;
      }
      resetAddItemModal();
    });
  }

  if (btnCloseAddItemModal && addItemModal) {
    btnCloseAddItemModal.addEventListener('click', () => addItemModal.classList.remove('active'));
  }
  if (btnCancelAddItem && addItemModal) {
    btnCancelAddItem.addEventListener('click', () => addItemModal.classList.remove('active'));
  }

  if (btnSaveNewItem) {
    btnSaveNewItem.addEventListener('click', async () => {
      const id = editItemId?.value ? parseInt(editItemId.value) : null;
      const name = newItemName?.value.trim();
      const price = parseFloat(newItemPrice?.value);
      const category = newItemCat?.value;
      const is_unli = newItemUnli?.checked;
      const description = newItemDesc?.value.trim();
      const initial_stock = newItemStock ? (parseFloat(newItemStock.value) || 0) : 0;
      const stock_unit = newItemUnit ? newItemUnit.value : 'pcs';

      if (!name || isNaN(price) || price < 0) {
        alert('Please enter a valid item name and non-negative price.');
        return;
      }

      try {
        let res;
        if (id) {
          res = await apiFetch(`/api/menu/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, price, category, is_unli, description })
          });
        } else {
          res = await apiFetch('/api/menu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, price, category, is_unli, description, initial_stock, stock_unit })
          });
        }

        if (!res.ok) throw new Error('Failed to save item');
        if (addItemModal) addItemModal.classList.remove('active');
        showToast(id ? `Updated "${name}"! 🎉` : `Added "${name}" & linked to stocks! 🎉`);
        await loadAdminMenu();
        await loadInventory();
        await loadMenuFromBackend();
      } catch (err) {
        alert('Failed to save menu item. Administrator access required.');
      }
    });
  }
}

export async function loadAdminMenu() {
  try {
    const res = await apiFetch('/api/menu/all');
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'success') {
      state.allAdminMenuItems = data.items;
      renderAdminMenuTable();
    }
  } catch (err) {
    console.error('Error loading admin menu:', err);
  }
}

export function renderAdminMenuTable() {
  const adminMenuTableBody = document.getElementById('admin-menu-table-body');
  const addItemModal = document.getElementById('add-item-modal');
  const editItemId = document.getElementById('edit-item-id');
  const modalMenuTitle = document.getElementById('modal-menu-title');
  const newItemName = document.getElementById('new-item-name');
  const newItemCat = document.getElementById('new-item-cat');
  const newItemPrice = document.getElementById('new-item-price');
  const newItemUnli = document.getElementById('new-item-unli');
  const newItemDesc = document.getElementById('new-item-desc');
  const newItemStockRow = document.getElementById('new-item-stock-row');

  if (!adminMenuTableBody) return;
  adminMenuTableBody.innerHTML = '';

  let items = state.allAdminMenuItems;
  if (state.adminActiveCategory !== 'ALL') {
    items = items.filter(i => i.category === state.adminActiveCategory);
  }

  if (items.length === 0) {
    adminMenuTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted" style="padding: 2rem;">No menu items in this category.</td>
      </tr>
    `;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${item.id}</strong></td>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td><span class="badge" style="background:#f1f5f9; color:#475569; font-weight:700;">${escapeHtml(item.category)}</span></td>
      <td><span class="${item.is_unli ? 'badge-unli' : 'badge-alacarte'}">${item.is_unli ? '2-Hr Unli Plan' : 'Ala Carte / Add-on'}</span></td>
      <td>
        <input type="number" class="price-input" value="${item.price}" step="any" min="0" data-id="${item.id}">
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" class="status-toggle" data-id="${item.id}" ${item.is_active ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <div style="display: flex; gap: 0.35rem; align-items: center;">
          <button class="btn btn-primary btn-sm btn-save-price" data-id="${item.id}" title="Quick save price">💾</button>
          <button class="btn btn-secondary btn-sm btn-edit-menu-item" data-id="${item.id}">✏️ Edit</button>
          <button class="btn btn-outline-danger btn-sm btn-delete-menu-item" data-id="${item.id}" title="Delete menu item">🗑️</button>
        </div>
      </td>
    `;

    tr.querySelector('.btn-save-price').addEventListener('click', async () => {
      if (!isAdmin()) {
        openAdminPinModal(() => tr.querySelector('.btn-save-price').click());
        return;
      }
      const newP = parseFloat(tr.querySelector('.price-input').value) || 0;
      try {
        const res = await apiFetch(`/api/menu/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: newP })
        });
        if (res.ok) {
          showToast(`Updated price for "${item.name}" to ${formatCurrency(newP)}!`);
          await loadMenuFromBackend();
        }
      } catch (err) {
        alert('Failed to update price.');
      }
    });

    tr.querySelector('.btn-edit-menu-item').addEventListener('click', () => {
      if (!isAdmin()) {
        openAdminPinModal(() => tr.querySelector('.btn-edit-menu-item').click());
        return;
      }
      if (editItemId) editItemId.value = item.id;
      if (modalMenuTitle) modalMenuTitle.textContent = `Edit Menu Item #${item.id}`;
      if (newItemName) newItemName.value = item.name;
      if (newItemCat) newItemCat.value = item.category;
      if (newItemPrice) newItemPrice.value = item.price;
      if (newItemUnli) newItemUnli.checked = Boolean(item.is_unli);
      if (newItemDesc) newItemDesc.value = item.description || '';
      if (newItemStockRow) newItemStockRow.style.display = 'none';
      if (addItemModal) addItemModal.classList.add('active');
    });

    tr.querySelector('.btn-delete-menu-item').addEventListener('click', async () => {
      if (!isAdmin()) {
        openAdminPinModal(() => tr.querySelector('.btn-delete-menu-item').click());
        return;
      }
      if (!confirm(`Permanently delete "${item.name}" (#${item.id}) from the menu?\n\nThis cannot be undone.`)) {
        return;
      }
      try {
        const res = await apiFetch(`/api/menu/${item.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete item');
        showToast(`🗑️ Deleted "${item.name}" from menu.`);
        await loadAdminMenu();
        await loadInventory();
        await loadMenuFromBackend();
      } catch (err) {
        alert('Failed to delete menu item.');
      }
    });

    tr.querySelector('.status-toggle').addEventListener('change', async (e) => {
      if (!isAdmin()) {
        e.preventDefault();
        e.target.checked = !e.target.checked;
        openAdminPinModal(() => {});
        return;
      }
      const isActive = e.target.checked;
      try {
        const res = await apiFetch(`/api/menu/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: isActive })
        });
        if (res.ok) {
          showToast(`"${item.name}" is now ${isActive ? 'Active' : 'Inactive'}!`);
          await loadMenuFromBackend();
        }
      } catch (err) {
        alert('Failed to toggle item.');
      }
    });

    adminMenuTableBody.appendChild(tr);
  });
}

