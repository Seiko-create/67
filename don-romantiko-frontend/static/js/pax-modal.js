/**
 * DOÑA ROMANTIKA - PAX & Unlimited Package Setup Modal
 */

import { state } from './state.js';
import { formatCurrency, showToast } from './utils.js';
import { renderLiveSlip, renderMenu, clientRecalculatePreview } from './cashier.js';

export function initPaxModal() {
  const paxInput = document.getElementById('pax-input');
  const paxMinus = document.getElementById('pax-minus');
  const paxPlus = document.getElementById('pax-plus');
  const modalCalcMath = document.getElementById('modal-calc-math');
  const modalCalcTotal = document.getElementById('modal-calc-total');
  const paxChips = document.querySelectorAll('.pax-chip');
  const btnConfirmPax = document.getElementById('btn-confirm-pax');
  const btnCancelPax = document.getElementById('btn-cancel-pax');
  const btnClosePaxModal = document.getElementById('btn-close-pax-modal');
  const unliPaxModal = document.getElementById('unli-pax-modal');

  const updateModalCalc = () => {
    let pax = parseInt(paxInput.value) || 1;
    if (pax < 1) pax = 1;
    paxInput.value = pax;
    if (state.tempSelectedPlan) {
      const total = state.tempSelectedPlan.price * pax;
      if (modalCalcMath) modalCalcMath.textContent = `${pax} PAX × ${formatCurrency(state.tempSelectedPlan.price)}`;
      if (modalCalcTotal) modalCalcTotal.textContent = formatCurrency(total);
    }
  };

  if (paxMinus) {
    paxMinus.addEventListener('click', () => {
      let v = parseInt(paxInput.value) || 1;
      if (v > 1) {
        paxInput.value = v - 1;
        updateModalCalc();
      }
    });
  }

  if (paxPlus) {
    paxPlus.addEventListener('click', () => {
      let v = parseInt(paxInput.value) || 1;
      paxInput.value = v + 1;
      updateModalCalc();
    });
  }

  if (paxInput) paxInput.addEventListener('input', updateModalCalc);

  paxChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (paxInput) {
        paxInput.value = chip.getAttribute('data-pax');
        updateModalCalc();
      }
    });
  });

  if (btnConfirmPax) {
    btnConfirmPax.addEventListener('click', () => {
      if (!state.tempSelectedPlan) return;
      const pax = parseInt(paxInput.value) || 1;

      state.currentOrder.unli_plan = {
        id: state.tempSelectedPlan.id,
        name: state.tempSelectedPlan.name,
        price: state.tempSelectedPlan.price,
        pax: pax,
        subtotal: state.tempSelectedPlan.price * pax
      };
      state.currentOrder.pax = pax;

      if (!state.currentOrder.start_time || !state.currentOrder.end_time) {
        const now = new Date();
        const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        state.currentOrder.start_time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        state.currentOrder.end_time = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      clientRecalculatePreview();
      renderLiveSlip();
      renderMenu();
      if (unliPaxModal) unliPaxModal.classList.remove('active');
      showToast(`Set "${state.tempSelectedPlan.name}" for ${pax} PAX!`);
    });
  }

  if (btnCancelPax && unliPaxModal) {
    btnCancelPax.addEventListener('click', () => unliPaxModal.classList.remove('active'));
  }
  if (btnClosePaxModal && unliPaxModal) {
    btnClosePaxModal.addEventListener('click', () => unliPaxModal.classList.remove('active'));
  }
}

export function openPaxModal(plan) {
  const unliPaxModal = document.getElementById('unli-pax-modal');
  const modalPlanName = document.getElementById('modal-plan-name');
  const modalPlanRate = document.getElementById('modal-plan-rate');
  const paxInput = document.getElementById('pax-input');
  const modalCalcMath = document.getElementById('modal-calc-math');
  const modalCalcTotal = document.getElementById('modal-calc-total');

  state.tempSelectedPlan = plan;
  if (modalPlanName) modalPlanName.textContent = plan.name;
  if (modalPlanRate) modalPlanRate.textContent = `${formatCurrency(plan.price)} / person`;
  if (paxInput) {
    paxInput.value = state.currentOrder.unli_plan?.name === plan.name ? (state.currentOrder.unli_plan.pax || 4) : 4;
  }
  const pax = paxInput ? (parseInt(paxInput.value) || 4) : 4;
  if (modalCalcMath) modalCalcMath.textContent = `${pax} PAX × ${formatCurrency(plan.price)}`;
  if (modalCalcTotal) modalCalcTotal.textContent = formatCurrency(plan.price * pax);
  if (unliPaxModal) unliPaxModal.classList.add('active');
}

