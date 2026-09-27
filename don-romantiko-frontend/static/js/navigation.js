/**
 * DOÑA ROMANTIKA - Navigation, Side Drawer & Real-Time Clock
 */

import { isAdmin } from './state.js';
import { openAdminPinModal, closeAdminPinModal } from './auth.js';

const tabHandlers = {};

export function onTabChange(tabId, handler) {
  tabHandlers[tabId] = handler;
}

export function initClock() {
  const liveClockEl = document.getElementById('live-clock');
  if (!liveClockEl) return;
  const update = () => {
    const now = new Date();
    liveClockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

export function toggleSideMenu() {
  const sideMenu = document.getElementById('side-menu');
  const menuOverlay = document.getElementById('menu-overlay');
  const menuToggle = document.getElementById('menu-toggle');
  if (!sideMenu || !menuOverlay || !menuToggle) return;

  const isOpen = sideMenu.classList.toggle('open');
  menuOverlay.classList.toggle('visible', isOpen);
  menuToggle.classList.toggle('open', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
}

export function closeSideMenu() {
  const sideMenu = document.getElementById('side-menu');
  const menuOverlay = document.getElementById('menu-overlay');
  const menuToggle = document.getElementById('menu-toggle');
  if (!sideMenu || !menuOverlay || !menuToggle) return;

  sideMenu.classList.remove('open');
  menuOverlay.classList.remove('visible');
  menuToggle.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

export function switchToTab(tabId) {
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabViews = document.querySelectorAll('.tab-view');

  navTabs.forEach(t => t.classList.remove('active'));
  tabViews.forEach(v => v.classList.remove('active'));

  const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  const tabView = document.getElementById(tabId);
  if (tabBtn) tabBtn.classList.add('active');
  if (tabView) tabView.classList.add('active');
}

export function initNavigation() {
  const menuToggle = document.getElementById('menu-toggle');
  const menuOverlay = document.getElementById('menu-overlay');
  const navTabs = document.querySelectorAll('.nav-tab');

  if (menuToggle) menuToggle.addEventListener('click', toggleSideMenu);
  if (menuOverlay) menuOverlay.addEventListener('click', closeSideMenu);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSideMenu();
      closeAdminPinModal();
      const changePwdModal = document.getElementById('change-pwd-modal');
      const adjustStockModal = document.getElementById('adjust-stock-modal');
      if (changePwdModal) changePwdModal.classList.remove('active');
      if (adjustStockModal) adjustStockModal.classList.remove('active');
    }
  });

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTabId = tab.getAttribute('data-tab');

      // ADMIN-ONLY PROTECTION FOR MENU & INVENTORY TAB
      if (targetTabId === 'manage-menu-tab' && !isAdmin()) {
        openAdminPinModal(() => {
          switchToTab('manage-menu-tab');
          if (tabHandlers['manage-menu-tab']) tabHandlers['manage-menu-tab']();
        });
        closeSideMenu();
        return;
      }

      switchToTab(targetTabId);

      if (tabHandlers[targetTabId]) {
        tabHandlers[targetTabId]();
      }
      closeSideMenu();
    });
  });
}

