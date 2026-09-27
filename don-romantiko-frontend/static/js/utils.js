/**
 * DOÑA ROMANTIKA - Utilities & Helpers
 */

import { API_BASE } from './config.js';

export function notifyServerReachability(online) {
  document.dispatchEvent(new CustomEvent('pos:server-reachability', {
    detail: { online }
  }));
}

export async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      credentials: 'include',
      ...options
    });
    // Server responded (connection exists)
    notifyServerReachability(true);
    return res;
  } catch (err) {
    // Network failure / connection refused / DNS failure / server turned off
    notifyServerReachability(false);
    throw err;
  }
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatCurrency(amount) {
  const val = parseFloat(amount) || 0;
  return `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

let toastTimeout;
export function showToast(msg) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  clearTimeout(toastTimeout);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2800);
}

