import {
  initializeAuthentication,
  initAdminPinModal,
  initChangePasswordModal,
  initAdminAccounts
} from './auth.js';

import {
  initClock,
  initNavigation
} from './navigation.js';

import {
  initHeaderInputs,
  initCatalogFilters,
  initOrderActions,
  loadMenuFromBackend,
  renderLiveSlip
} from './cashier.js';

import { initPaxModal } from './pax-modal.js';
import { initPaymentModal, initReceiptModal } from './payment.js';
import { initAdminMenu, initInventoryManagement } from './inventory.js';
import { initSalesControls } from './sales.js';
import {
  initDispatcherTab,
  fetchDispatcherTables,
  loadDispatcherAnalytics
} from './dispatcher.js';

import {
  initActiveTablesTab,
  fetchActiveTables,
  updateActiveTableCountdowns
} from './tables.js';

import {
  openOfflineDB,
  getPendingSyncOrders,
  syncOfflineOrders
} from './offline-db.js';

import { apiFetch, showToast } from './utils.js';

let pollingStarted = false;
let isSyncing = false;

/**
 * Update UI status indicator and unsynced badge
 */
async function updateNetworkAndSyncUI(isOnlineOverride) {
  const indicator = document.getElementById('network-status-indicator');
  const textEl = document.getElementById('network-status-text');
  const btnSync = document.getElementById('btn-sync-offline');
  const unsyncedCountEl = document.getElementById('unsynced-count');

  let pendingCount = 0;
  try {
    const pending = await getPendingSyncOrders();
    pendingCount = pending.length;
  } catch (e) {
    // DB not ready yet
  }

  const online = isOnlineOverride !== undefined ? isOnlineOverride : navigator.onLine;

  if (indicator && textEl) {
    if (online) {
      indicator.classList.remove('offline');
      textEl.textContent = 'Online';
    } else {
      indicator.classList.add('offline');
      textEl.textContent = 'Offline (Local DB)';
    }
  }

  if (btnSync && unsyncedCountEl) {
    unsyncedCountEl.textContent = pendingCount;
    btnSync.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
  }
}

/**
 * Trigger background or manual sync of offline orders
 */
async function triggerAutoSync() {
  if (isSyncing) return;
  try {
    const pending = await getPendingSyncOrders();
    if (!pending || pending.length === 0) {
      updateNetworkAndSyncUI(true);
      return;
    }
    isSyncing = true;
    const btnSync = document.getElementById('btn-sync-offline');
    if (btnSync) btnSync.disabled = true;

    const result = await syncOfflineOrders(apiFetch);
    if (result && result.synced_count > 0) {
      showToast(`✓ Synced ${result.synced_count} offline order(s) with central server!`);
      await fetchActiveTables();
    }
    updateNetworkAndSyncUI(true);
  } catch (err) {
    console.warn('Auto-sync deferred (server still unreachable):', err);
    updateNetworkAndSyncUI(false);
  } finally {
    isSyncing = false;
    const btnSync = document.getElementById('btn-sync-offline');
    if (btnSync) btnSync.disabled = false;
  }
}

/**
 * Initialize offline database, event listeners, and heartbeat
 */
function initOfflineSyncCoordinator() {
  openOfflineDB().then(() => {
    updateNetworkAndSyncUI();
  });

  document.addEventListener('pos:sync-status-changed', () => {
    updateNetworkAndSyncUI();
  });

  window.addEventListener('online', () => {
    updateNetworkAndSyncUI(true);
    triggerAutoSync();
  });

  window.addEventListener('offline', () => {
    updateNetworkAndSyncUI(false);
    showToast('⚡ Electricity / Network down: Offline database active.');
  });

  const btnSync = document.getElementById('btn-sync-offline');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      showToast('🔄 Synchronizing offline orders with server...');
      await triggerAutoSync();
    });
  }

  // Periodic heartbeat / ping every 15s to check server connection and sync
  setInterval(async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        updateNetworkAndSyncUI(true);
        const pending = await getPendingSyncOrders();
        if (pending.length > 0) {
          triggerAutoSync();
        }
      } else {
        updateNetworkAndSyncUI(false);
      }
    } catch {
      updateNetworkAndSyncUI(false);
    }
  }, 15000);
}

/**
 * Loads all live data from the server.
 * Only called AFTER the user is confirmed authenticated.
 */
async function loadAppData() {
  await loadMenuFromBackend();
  renderLiveSlip();
  fetchActiveTables();
  fetchDispatcherTables();
  loadDispatcherAnalytics();

  // Start background polling only once per session
  if (!pollingStarted) {
    pollingStarted = true;
    setInterval(fetchActiveTables, 30000);
    setInterval(fetchDispatcherTables, 15000);
    setInterval(updateActiveTableCountdowns, 1000);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('Don Romantiko PWA ServiceWorker active:', reg.scope);
      }).catch((err) => {
        console.warn('ServiceWorker registration error:', err);
      });
    });
  }

  // Initialize UI components and event listeners
  initClock();
  initNavigation();
  initAdminPinModal();
  initChangePasswordModal();
  initHeaderInputs();
  initCatalogFilters();
  initPaxModal();
  initPaymentModal();
  initAdminMenu();
  initInventoryManagement();
  initAdminAccounts();
  initOrderActions();
  initReceiptModal();
  initSalesControls();
  initDispatcherTab();
  initActiveTablesTab();
  // initOfflineSyncCoordinator();

  // Listen for successful authentication
  document.addEventListener('app:authenticated', loadAppData);

  // Check existing session
  await initializeAuthentication();
});
