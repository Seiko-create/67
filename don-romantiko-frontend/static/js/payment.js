/**
 * DOÑA ROMANTIKA - Payment Settlement & Official Receipt Modal
 */

import { state } from './state.js';
import { apiFetch, escapeHtml, formatCurrency, showToast } from './utils.js';
import { saveCurrentOrderToServer, resetOrderForm } from './cashier.js';
import { fetchActiveTables } from './tables.js';
import { fetchDispatcherTables } from './dispatcher.js';
import { loadInventory } from './inventory.js';
import { settleOfflinePayment, markOrderSettledInOfflineDB } from './offline-db.js';

export function initPaymentModal() {
  const btnClosePayModal = document.getElementById('btn-close-pay-modal');
  const btnCancelPay = document.getElementById('btn-cancel-pay');
  const cashTenderedInput = document.getElementById('cash-tendered-input');
  const btnExactCash = document.getElementById('btn-exact-cash');
  const cashChips = document.querySelectorAll('.cash-chip[data-cash]');
  const btnConfirmPayment = document.getElementById('btn-confirm-payment');
  const paymentModal = document.getElementById('payment-modal');

  if (btnClosePayModal && paymentModal) {
    btnClosePayModal.addEventListener('click', () => paymentModal.classList.remove('active'));
  }
  if (btnCancelPay && paymentModal) {
    btnCancelPay.addEventListener('click', () => paymentModal.classList.remove('active'));
  }

  if (cashTenderedInput) {
    cashTenderedInput.addEventListener('input', updateChangeCalculation);
  }

  if (btnExactCash && cashTenderedInput) {
    btnExactCash.addEventListener('click', () => {
      cashTenderedInput.value = state.currentOrder.balance_due;
      updateChangeCalculation();
    });
  }

  cashChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (cashTenderedInput) {
        cashTenderedInput.value = chip.getAttribute('data-cash');
        updateChangeCalculation();
      }
    });
  });

  if (btnConfirmPayment) {
    btnConfirmPayment.addEventListener('click', executePayment);
  }
}

export function openPaymentModal() {
  const paymentModal = document.getElementById('payment-modal');
  const payModalOrderNo = document.getElementById('pay-modal-order-no');
  const payModalTableWaiter = document.getElementById('pay-modal-table-waiter');
  const payModalTotalDue = document.getElementById('pay-modal-total-due');
  const payModalPrevRow = document.getElementById('pay-modal-prev-row');
  const payModalPrevPaid = document.getElementById('pay-modal-prev-paid');
  const cashTenderedInput = document.getElementById('cash-tendered-input');
  const payModalChange = document.getElementById('pay-modal-change');

  if (!state.currentOrder.id && !state.currentOrder.unli_plan && state.currentOrder.items.length === 0) {
    alert('Select an unlimited plan or add items before settling payment.');
    return;
  }

  if (state.currentOrder.balance_due <= 0 && state.currentOrder.gross_total === 0) {
    alert('Cannot settle payment for an empty order.');
    return;
  }

  if (payModalOrderNo) {
    payModalOrderNo.textContent = state.currentOrder.order_number || `#${state.currentOrder.id || 'New'}`;
  }
  if (payModalTableWaiter) {
    payModalTableWaiter.textContent = `${state.currentOrder.table_number || 'Table'} (${state.currentOrder.waiter || 'Staff'})`;
  }
  if (payModalTotalDue) {
    payModalTotalDue.textContent = formatCurrency(state.currentOrder.balance_due);
  }

  if (payModalPrevRow && payModalPrevPaid) {
    if (state.currentOrder.amount_paid > 0) {
      payModalPrevRow.style.display = 'flex';
      payModalPrevPaid.textContent = formatCurrency(state.currentOrder.amount_paid);
    } else {
      payModalPrevRow.style.display = 'none';
    }
  }

  if (cashTenderedInput) cashTenderedInput.value = '';
  if (payModalChange) payModalChange.textContent = '₱0.00';
  if (paymentModal) paymentModal.classList.add('active');
  setTimeout(() => cashTenderedInput && cashTenderedInput.focus(), 80);
}

export function updateChangeCalculation() {
  const cashTenderedInput = document.getElementById('cash-tendered-input');
  const payModalChange = document.getElementById('pay-modal-change');
  if (!cashTenderedInput || !payModalChange) return;

  const tendered = parseFloat(cashTenderedInput.value) || 0;
  const due = state.currentOrder.balance_due || 0;
  const change = Math.max(0, tendered - due);
  payModalChange.textContent = formatCurrency(change);
  if (tendered < due && tendered > 0) {
    payModalChange.style.color = '#ef4444';
  } else {
    payModalChange.style.color = '#047857';
  }
}

export async function executePayment() {
  const cashTenderedInput = document.getElementById('cash-tendered-input');
  const paymentModal = document.getElementById('payment-modal');
  const tendered = cashTenderedInput ? parseFloat(cashTenderedInput.value) || 0 : 0;
  const due = state.currentOrder.balance_due || 0;
  const method = document.querySelector('input[name="pay-method"]:checked')?.value || 'Cash';

  if (tendered < due) {
    alert(`Insufficient cash tendered! Received ₱${tendered.toFixed(2)}, but balance due is ₱${due.toFixed(2)}.`);
    if (cashTenderedInput) cashTenderedInput.focus();
    return;
  }

  try {
    // 1. Ensure order is saved first (online or offline)
    const savedOrder = await saveCurrentOrderToServer('ON HOLD');
    if (!savedOrder) {
      throw new Error('Failed to save table details prior to payment.');
    }

    // Check if we are offline or order was saved in offline DB (no server id yet)
    if (!navigator.onLine || !state.currentOrder.id) {
      const settledOffline = await settleOfflinePayment(state.currentOrder, tendered, method);
      state.currentOrder = settledOffline;
      if (paymentModal) paymentModal.classList.remove('active');
      showToast(`⚡ Payment settled offline! Change: ${formatCurrency(settledOffline.change_returned)}`);
      openReceiptModal(settledOffline);
      resetOrderForm();
      return;
    }

    const payRes = await apiFetch(`/api/orders/${state.currentOrder.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cash_tendered: tendered, payment_method: method })
    });
    let payData = null;
    try {
      payData = await payRes.json();
    } catch (e) {
      // Non-JSON response
    }
    if (!payRes.ok || !payData) {
      throw new Error(payData?.message || `Payment execution failed (Server status: ${payRes.status}).`);
    }

    if (paymentModal) paymentModal.classList.remove('active');
    showToast(`✓ Payment settled! Change: ${formatCurrency(payData.order.change_returned)}`);

    await markOrderSettledInOfflineDB(payData.order.id, state.currentOrder.offline_uuid);

    openReceiptModal(payData.order);
    resetOrderForm();
    await fetchActiveTables();
    await fetchDispatcherTables();
    await loadInventory();
  } catch (err) {
    console.warn('Payment settlement error, checking offline fallback:', err);
    const isNetworkError = !navigator.onLine ||
      (err.name === 'TypeError' && String(err.message).toLowerCase().includes('fetch')) ||
      String(err.message).toLowerCase().includes('failed to fetch') ||
      String(err.message).toLowerCase().includes('network');

    if (isNetworkError) {
      const settledOffline = await settleOfflinePayment(state.currentOrder, tendered, method);
      state.currentOrder = settledOffline;
      if (paymentModal) paymentModal.classList.remove('active');
      showToast(`⚡ Server unreachable: Payment recorded offline. Change: ${formatCurrency(settledOffline.change_returned)}`);
      openReceiptModal(settledOffline);
      resetOrderForm();
      return;
    }
    alert(err.message || 'Payment failed. Please retry.');
  }
}

// ================= READ-ONLY RECEIPT MODAL =================
export function initReceiptModal() {
  const btnCloseReceiptModal = document.getElementById('btn-close-receipt-modal');
  const btnCloseReceipt = document.getElementById('btn-close-receipt');
  const btnReprintReceipt = document.getElementById('btn-reprint-receipt');
  const receiptModal = document.getElementById('receipt-modal');

  if (btnCloseReceiptModal && receiptModal) {
    btnCloseReceiptModal.addEventListener('click', () => receiptModal.classList.remove('active'));
  }
  if (btnCloseReceipt && receiptModal) {
    btnCloseReceipt.addEventListener('click', () => receiptModal.classList.remove('active'));
  }
  if (btnReprintReceipt) {
    btnReprintReceipt.addEventListener('click', () => window.print());
  }
}

export function openReceiptModal(order) {
  const modalReceiptContent = document.getElementById('modal-receipt-content');
  const receiptModal = document.getElementById('receipt-modal');
  if (!modalReceiptContent || !receiptModal) return;

  state.currentViewingReceipt = order;
  let unliHtml = '';
  if (order.unli_plan_name) {
    unliHtml = `
      <div class="slip-section">
        <div class="slip-section-heading">UNLIMITED PLAN</div>
        <div class="slip-unli-item">
          <div class="slip-unli-main">
            <span>${escapeHtml(order.unli_plan_name)}</span>
            <span>${formatCurrency(order.unli_subtotal)}</span>
          </div>
          <div class="slip-unli-detail">
            <span>${order.pax} PAX × ${formatCurrency(order.unli_plan_price)}</span>
          </div>
        </div>
      </div>
    `;
  }

  let itemsHtml = '';
  if (order.items && order.items.length > 0) {
    itemsHtml = `
      <div class="slip-section">
        <div class="slip-section-heading">ADD-ONS & CHARGES</div>
        ${order.items.map(i => `
          <div class="slip-addon-row">
            <div class="addon-info">
              <span class="addon-name">${escapeHtml(i.item_name)}</span>
              <span class="addon-unit-price">${formatCurrency(i.unit_price)} × ${i.quantity}</span>
            </div>
            <span class="addon-total-price">${formatCurrency(i.subtotal)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  modalReceiptContent.innerHTML = `
    <div class="slip-header">
      <div class="slip-brand">
        <span class="slip-pig">🐷</span>
        <div class="slip-brand-title">DOÑA ROMANTIKA</div>
        <div class="slip-brand-sub">UNLIMITED SAMGYEOPSAL</div>
      </div>
      <div class="slip-title-row">
        <span class="slip-title">OFFICIAL RECEIPT</span>
        <span class="slip-no">${escapeHtml(order.receipt_number || '')}</span>
      </div>
      <div class="slip-meta-grid">
        <div><strong>Table No.:</strong> ${escapeHtml(order.table_number)}</div>
        <div><strong>Order No.:</strong> ${escapeHtml(order.order_number || '-')}</div>
        <div><strong>Date:</strong> ${escapeHtml(order.created_at ? order.created_at.split(' ')[0] : '')}</div>
        <div><strong>Waiter:</strong> ${escapeHtml(order.waiter)}</div>
        <div><strong>Receipt No.:</strong> ${escapeHtml(order.receipt_number || '-')}</div>
        <div><strong>Paid At:</strong> ${escapeHtml(order.receipt_issued_at || order.paid_at || '-')}</div>
      </div>
    </div>
    <div class="slip-body">
      ${unliHtml}
      ${itemsHtml}
    </div>
    <div class="slip-footer">
      <div class="slip-calc-row">
        <span>Gross Total</span>
        <span>${formatCurrency(order.gross_total)}</span>
      </div>
      <div class="slip-calc-row total-row">
        <span>TOTAL PAID:</span>
        <span class="slip-total-amount">${formatCurrency(order.amount_paid || order.gross_total)}</span>
      </div>
      <div class="slip-calc-row" style="margin-top:0.4rem; font-size:0.8rem; color:#64748b;">
        <span>Payment Method:</span>
        <strong>${escapeHtml(order.payment_method || 'Cash')}</strong>
      </div>
      <div class="order-status-tag" style="background:#ecfdf5; color:#047857; font-weight:800;">
        STATUS: PAID & COMPLETED ✓
      </div>
    </div>
  `;
  receiptModal.classList.add('active');
}

