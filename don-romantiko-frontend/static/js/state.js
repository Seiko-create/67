/**
 * DOÑA ROMANTIKA - Shared Reactive State
 */

export function createDefaultOrder() {
  return {
    id: null,
    offline_uuid: null,
    device_id: null,
    order_number: 'New Draft',
    table_number: 'Table 1',
    // Cannot call getCurrentWaiter() here: 'state' const is still being initialized
    // (TDZ — Temporal Dead Zone). Default to 'Staff'; applyAuthenticatedUser()
    // overwrites this with the real user name after login.
    waiter: 'Staff',
    customer: '',
    unli_plan: null, // { id, name, price, pax, subtotal }
    items: [],       // [ { id, name, price, quantity, subtotal } ]
    gross_total: 0,
    amount_paid: 0,
    balance_due: 0,
    status: 'DRAFT',
    start_time: null,
    end_time: null,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

export const state = {
  menuCatalog: {},
  allAdminMenuItems: [],
  activeCategory: 'ALL',
  adminActiveCategory: 'ALL',
  searchQuery: '',
  activeTableOrders: [],
  currentUser: null,
  currentSalesTimeframe: 'daily',
  currentSalesDate: '',
  currentOrder: createDefaultOrder(),
  tempSelectedPlan: null,
  currentViewingReceipt: null,
  isOnline: true,
  pendingSyncCount: 0
};

export function getCurrentWaiter() {
  return state.currentUser?.full_name || state.currentUser?.username || 'Staff';
}

export function isAdmin() {
  return state.currentUser?.role === 'admin';
}

export function resetCurrentOrder() {
  state.currentOrder = createDefaultOrder();
}
