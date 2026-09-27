/**
 * DON ROMANTIKO POS - Offline IndexedDB & Sync Engine
 * Handles local order caching, power-outage offline transactions,
 * multi-device identification, and automated server synchronization.
 */

const DB_NAME = 'DonRomantikoPOS_DB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Open or initialize IndexedDB
 */
export function openOfflineDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Orders store: keyed by unique offline_uuid
      if (!db.objectStoreNames.contains('orders')) {
        const orderStore = db.createObjectStore('orders', { keyPath: 'offline_uuid' });
        orderStore.createIndex('sync_status', 'sync_status', { unique: false });
        orderStore.createIndex('status', 'status', { unique: false });
        orderStore.createIndex('table_number', 'table_number', { unique: false });
        orderStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // 2. Menu Catalog cache
      if (!db.objectStoreNames.contains('menu_cache')) {
        db.createObjectStore('menu_cache', { keyPath: 'key' });
      }

      // 3. Device & App Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Failed to open IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Persistent Device Identification (for Multi-Tablet support)
 */
export function getDeviceId() {
  let devId = localStorage.getItem('don_romantiko_device_id');
  if (!devId) {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    devId = `TAB-${Date.now().toString().slice(-4)}-${rand}`;
    localStorage.setItem('don_romantiko_device_id', devId);
  }
  return devId;
}

export function getDeviceName() {
  return localStorage.getItem('don_romantiko_device_name') || `Tablet ${getDeviceId()}`;
}

export function setDeviceName(name) {
  if (name && name.trim()) {
    localStorage.setItem('don_romantiko_device_name', name.trim());
  }
}

/**
 * Generate a unique client UUID with embedded Device ID and timestamp
 */
export function generateOfflineUUID() {
  const devId = getDeviceId();
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `ord_${devId}_${ts}_${rand}`;
}

/**
 * Save or Update an Order locally in IndexedDB
 */
export async function saveOfflineOrder(order) {
  const db = await openOfflineDB();

  if (!order.offline_uuid) {
    order.offline_uuid = generateOfflineUUID();
  }

  order.device_id = getDeviceId();
  order.device_name = getDeviceName();
  order.sync_status = 'pending';
  order.offline_saved_at = new Date().toISOString();

  // If order number is not set by server, assign readable offline reference
  if (!order.order_number || order.order_number === 'New Draft') {
    const shortRef = order.offline_uuid.slice(-6).toUpperCase();
    order.order_number = `OFF-${shortRef}`;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('orders', 'readwrite');
    const store = tx.objectStore('orders');
    const request = store.put(order);

    request.onsuccess = () => {
      notifySyncStatusChange();
      resolve(order);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Settle payment for an order while offline
 */
export async function settleOfflinePayment(order, cashTendered, paymentMethod = 'Cash') {
  const balanceDue = Number(order.balance_due || order.gross_total || 0);
  const tendered = Number(cashTendered || 0);
  const change = Math.max(0, tendered - balanceDue);

  order.cash_tendered = tendered;
  order.change_returned = change;
  order.payment_method = paymentMethod;
  order.amount_paid = (Number(order.amount_paid || 0) + balanceDue);
  order.balance_due = 0;
  order.status = 'PAID';
  order.paid_at = new Date().toLocaleString();
  order.sync_status = 'pending';

  if (!order.receipt_number) {
    const shortRef = (order.offline_uuid || generateOfflineUUID()).slice(-6).toUpperCase();
    order.receipt_number = `OFF-R-${shortRef}`;
    order.receipt_issued_at = new Date().toLocaleString();
  }

  return await saveOfflineOrder(order);
}

/**
 * Retrieve all pending unsynced orders
 */
export async function getPendingSyncOrders() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('orders', 'readonly');
    const store = tx.objectStore('orders');
    const index = store.index('sync_status');
    const request = index.getAll('pending');

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Mark specified offline orders as synced after server acknowledgment
 */
export async function markOrdersSynced(syncedList) {
  if (!syncedList || !syncedList.length) return;
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('orders', 'readwrite');
    const store = tx.objectStore('orders');

    syncedList.forEach((item) => {
      const getReq = store.get(item.offline_uuid);
      getReq.onsuccess = () => {
        if (getReq.result) {
          const rec = getReq.result;
          rec.sync_status = 'synced';
          rec.server_id = item.server_id;
          rec.order_number = item.order_number || rec.order_number;
          if (item.status === 'already_paid' || item.status === 'settled') {
            rec.status = 'PAID';
          }
          rec.synced_at = new Date().toISOString();
          store.put(rec);
        }
      };
    });

    tx.oncomplete = () => {
      notifySyncStatusChange();
      resolve(true);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Mark an order as settled in the local IndexedDB
 * (Called when an order is paid online or synced, ensuring it is removed from active tables and pending sync queue)
 */
export async function markOrderSettledInOfflineDB(serverId, offlineUuid) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('orders', 'readwrite');
    const store = tx.objectStore('orders');

    const updateRecord = (record) => {
      record.status = 'PAID';
      record.sync_status = 'synced';
      record.settled_at = new Date().toISOString();
      store.put(record);
    };

    if (offlineUuid) {
      const req = store.get(offlineUuid);
      req.onsuccess = () => {
        if (req.result) updateRecord(req.result);
      };
    }

    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const records = allReq.result || [];
      records.forEach((rec) => {
        if ((serverId && rec.id === serverId) || (serverId && rec.server_id === serverId)) {
          updateRecord(rec);
        }
      });
    };

    tx.oncomplete = () => {
      notifySyncStatusChange();
    };
  } catch (err) {
    console.warn('Could not mark order settled in offline DB:', err);
  }
}

/**
 * Cache Menu Catalog in IndexedDB for 100% offline cashier catalog browsing
 */
export async function cacheMenuCatalog(catalog) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('menu_cache', 'readwrite');
    const store = tx.objectStore('menu_cache');
    store.put({ key: 'current_catalog', catalog, cached_at: new Date().toISOString() });
  } catch (err) {
    console.warn('Failed to cache menu in IndexedDB:', err);
  }
}

export async function getCachedMenuCatalog() {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('menu_cache', 'readonly');
      const store = tx.objectStore('menu_cache');
      const request = store.get('current_catalog');
      request.onsuccess = () => resolve(request.result?.catalog || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Synchronize all pending offline orders with the server
 */
export async function syncOfflineOrders(apiFetchFn) {
  const pending = await getPendingSyncOrders();
  if (!pending || pending.length === 0) {
    return { status: 'success', synced_count: 0, message: 'All orders already synchronized.' };
  }

  const payload = {
    device_id: getDeviceId(),
    device_name: getDeviceName(),
    orders: pending
  };

  const response = await apiFetchFn('/api/orders/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Sync failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.status === 'success' && Array.isArray(data.synced_orders)) {
    await markOrdersSynced(data.synced_orders);
  }

  return data;
}

/**
 * Broadcast sync counter updates to UI components
 */
export async function notifySyncStatusChange() {
  try {
    const pending = await getPendingSyncOrders();
    const event = new CustomEvent('pos:sync-status-changed', {
      detail: { pendingCount: pending.length }
    });
    document.dispatchEvent(event);
  } catch (e) {
    console.warn('Error broadcasting sync status:', e);
  }
}
