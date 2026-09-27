/**
 * DOÑA ROMANTIKA - Authentication, Roles & Accounts Management
 */

import { state, getCurrentWaiter, isAdmin } from './state.js';
import { apiFetch, escapeHtml, showToast } from './utils.js';
import { switchToTab } from './navigation.js';

let _pinUnlockCallback = null;

export async function initializeAuthentication() {
  const loginForm  = document.getElementById('login-form');
  const btnLogout  = document.getElementById('btn-logout');
  const loginRetry = document.getElementById('login-retry');

  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);
  if (loginRetry) loginRetry.addEventListener('click', retryAuthentication);

  // --- DEV BYPASS: skips real login while the backend is being rebuilt ---
  applyAuthenticatedUser({ username: 'dev', full_name: 'Dev User', role: 'admin' });
}

// export async function initializeAuthentication() {
//   const loginForm = document.getElementById('login-form');
//   const btnLogout = document.getElementById('btn-logout');
//   const loginRetry = document.getElementById('login-retry');
//   const loginScreen = document.getElementById('login-screen');
//   const loginError = document.getElementById('login-error');

//   if (loginForm) loginForm.addEventListener('submit', handleLogin);
//   if (btnLogout) btnLogout.addEventListener('click', handleLogout);
//   if (loginRetry) loginRetry.addEventListener('click', retryAuthentication);

//   try {
//     const response = await apiFetch('/api/auth/me');
//     if (response.ok) {
//       const data = await response.json();
//       if (data.user) {
//         applyAuthenticatedUser(data.user);
//         return;
//       }
//     }
//   } catch (error) {
//     if (loginError) {
//       loginError.textContent = 'POS server is unavailable. Keep the server window open and retry.';
//     }
//   }

//   if (loginScreen) loginScreen.classList.add('visible');
// }

export async function retryAuthentication() {
  const loginError = document.getElementById('login-error');
  if (loginError) loginError.textContent = 'Checking POS server...';
  try {
    const response = await apiFetch('/api/auth/me');
    if (response.ok) {
      window.location.reload();
      return;
    }
    if (loginError) loginError.textContent = 'Server is reachable. Please sign in.';
  } catch (error) {
    if (loginError) {
      loginError.textContent = 'POS server is still unavailable. Keep the server window open and retry.';
    }
  }
}

export async function handleLogin(event) {
  event.preventDefault();
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginScreen = document.getElementById('login-screen');

  if (loginError) loginError.textContent = '';
  if (loginPassword.value.length < 8) {
    if (loginError) loginError.textContent = 'Warning: Password must be at least 8 characters.';
    loginPassword.focus();
    return;
  }
  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUsername.value, password: loginPassword.value })
    });
    const data = await response.json();
    if (!response.ok) {
      if (loginError) loginError.textContent = data.message || 'Invalid username or password.';
      return;
    }
    applyAuthenticatedUser(data.user);
    if (loginScreen) loginScreen.classList.remove('visible');
  } catch (error) {
    if (loginError) {
      loginError.textContent = 'POS server is unavailable. Keep the server window open and retry.';
    }
  }
}

export function applyAuthenticatedUser(user) {
  state.currentUser = user;
  const admin = user.role === 'admin';
  const loginScreen = document.getElementById('login-screen');
  const loggedInUser = document.getElementById('logged-in-user');
  const modeBadge = document.getElementById('mode-badge');
  const btnAdminAuth = document.getElementById('btn-admin-auth');
  const btnLogout = document.getElementById('btn-logout');
  const waiterInput = document.getElementById('waiter-input');
  const slipWaiterVal = document.getElementById('slip-waiter-val');

  if (loginScreen) loginScreen.classList.remove('visible');
  if (loggedInUser) loggedInUser.textContent = user.full_name || user.username;

  if (modeBadge) {
    modeBadge.textContent = admin ? '🔓 Admin Mode' : '👷 Staff Mode';
    modeBadge.className = `mode-badge ${admin ? 'admin-badge' : 'staff-badge'}`;
  }
  if (btnAdminAuth) {
    btnAdminAuth.textContent = admin ? '🔒 Lock Admin' : '🔒 Unlock Admin';
    btnAdminAuth.classList.toggle('is-admin', admin);
  }

  const accountCard = document.querySelector('.account-admin-card');
  if (accountCard) accountCard.hidden = !admin;
  if (btnLogout) btnLogout.hidden = false;

  const currentWaiter = getCurrentWaiter();
  if (waiterInput) waiterInput.value = currentWaiter;
  state.currentOrder.waiter = currentWaiter;
  if (slipWaiterVal) slipWaiterVal.textContent = escapeHtml(currentWaiter);

  // Notify main.js that a user is now authenticated so it can load live data.
  document.dispatchEvent(new CustomEvent('app:authenticated', { detail: { user } }));
}

export async function handleLogout() {
  const loginScreen = document.getElementById('login-screen');
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    // ignore network hiccup — still send them to login
  }
  state.currentUser = null;
  if (loginScreen) loginScreen.classList.add('visible');
}

// ================= ADMIN PIN MODAL =================
export function initAdminPinModal() {
  const btnAdminAuth = document.getElementById('btn-admin-auth');
  const adminPinInput = document.getElementById('admin-pin-input');
  const keypadClear = document.getElementById('keypad-clear');
  const keypadEnter = document.getElementById('keypad-enter');
  const btnConfirmPin = document.getElementById('btn-confirm-pin');
  const btnCancelPinModal = document.getElementById('btn-cancel-pin-modal');
  const btnClosePinModal = document.getElementById('btn-close-pin-modal');

  if (btnAdminAuth) {
    btnAdminAuth.addEventListener('click', () => {
      if (isAdmin()) {
        apiFetch('/api/auth/lock-admin', { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            applyAuthenticatedUser(data.user || { username: 'staff', full_name: 'Staff', role: 'staff' });
            showToast('Admin mode locked. Back to Staff mode.');
            const accountAdminCard = document.querySelector('.account-admin-card');
            if (accountAdminCard) {
              accountAdminCard.hidden = true;
            }
            // If on manage-menu-tab, return to active tables
            const activeTab = document.querySelector('.nav-tab.active');
            if (activeTab && activeTab.dataset.tab === 'manage-menu-tab') {
              switchToTab('active-tables-tab');
            }
          });
      } else {
        openAdminPinModal(null);
      }
    });
  }

  document.querySelectorAll('.keypad-btn[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (adminPinInput) {
        adminPinInput.value += btn.dataset.digit;
        adminPinInput.focus();
      }
    });
  });

  if (keypadClear && adminPinInput) {
    keypadClear.addEventListener('click', () => {
      adminPinInput.value = adminPinInput.value.slice(0, -1);
    });
  }
  if (keypadEnter) keypadEnter.addEventListener('click', doUnlockAdmin);
  if (btnConfirmPin) btnConfirmPin.addEventListener('click', doUnlockAdmin);
  if (btnCancelPinModal) btnCancelPinModal.addEventListener('click', closeAdminPinModal);
  if (btnClosePinModal) btnClosePinModal.addEventListener('click', closeAdminPinModal);

  if (adminPinInput) {
    adminPinInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doUnlockAdmin();
    });
  }
}

export function openAdminPinModal(callback) {
  const adminPinModal = document.getElementById('admin-pin-modal');
  const adminPinInput = document.getElementById('admin-pin-input');
  const pinModalError = document.getElementById('pin-modal-error');

  _pinUnlockCallback = callback;
  if (adminPinInput) adminPinInput.value = '';
  if (pinModalError) pinModalError.textContent = '';
  if (adminPinModal) adminPinModal.classList.add('active');
  setTimeout(() => adminPinInput && adminPinInput.focus(), 80);
}

export function closeAdminPinModal() {
  const adminPinModal = document.getElementById('admin-pin-modal');
  if (adminPinModal) adminPinModal.classList.remove('active');
  _pinUnlockCallback = null;
}

export async function doUnlockAdmin() {
  const adminPinInput = document.getElementById('admin-pin-input');
  const pinModalError = document.getElementById('pin-modal-error');
  const pin = adminPinInput ? adminPinInput.value.trim() : '';

  if (!pin) {
    if (pinModalError) pinModalError.textContent = 'Please enter an Admin password or PIN.';
    return;
  }
  if (pinModalError) pinModalError.textContent = '';
  try {
    const res = await apiFetch('/api/auth/unlock-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (!res.ok) {
      if (pinModalError) pinModalError.textContent = data.message || 'Invalid PIN or password.';
      if (adminPinInput) {
        adminPinInput.value = '';
        adminPinInput.focus();
      }
      return;
    }
    applyAuthenticatedUser(data.user);
    closeAdminPinModal();
    showToast(`🔓 Admin authority unlocked! Welcome, ${data.user.full_name}.`);
    if (typeof _pinUnlockCallback === 'function') {
      _pinUnlockCallback();
      _pinUnlockCallback = null;
    }
  } catch (err) {
    if (pinModalError) pinModalError.textContent = 'Server error. Make sure the POS server is running.';
  }
}

// ================= CHANGE PASSWORD MODAL =================
export function initChangePasswordModal() {
  const btnOpenChangePwdModal = document.getElementById('btn-open-change-pwd-modal');
  const changePwdModal = document.getElementById('change-pwd-modal');
  const btnClosePwdModal = document.getElementById('btn-close-pwd-modal');
  const btnCancelPwd = document.getElementById('btn-cancel-pwd');
  const btnSavePwd = document.getElementById('btn-save-pwd');
  const pwdOldInput = document.getElementById('pwd-old-input');
  const pwdNewInput = document.getElementById('pwd-new-input');
  const pwdConfirmInput = document.getElementById('pwd-confirm-input');
  const pwdModalError = document.getElementById('pwd-modal-error');
  const pwdOldGroup = document.getElementById('pwd-old-group');

  if (btnOpenChangePwdModal && changePwdModal) {
    btnOpenChangePwdModal.addEventListener('click', () => {
      if (pwdOldInput) pwdOldInput.value = '';
      if (pwdNewInput) pwdNewInput.value = '';
      if (pwdConfirmInput) pwdConfirmInput.value = '';
      if (pwdModalError) pwdModalError.textContent = '';
      if (pwdOldGroup) pwdOldGroup.style.display = isAdmin() ? 'none' : 'block';
      changePwdModal.classList.add('active');
      setTimeout(() => (isAdmin() ? (pwdNewInput && pwdNewInput.focus()) : (pwdOldInput && pwdOldInput.focus())), 80);
    });
  }

  if (btnClosePwdModal && changePwdModal) {
    btnClosePwdModal.addEventListener('click', () => changePwdModal.classList.remove('active'));
  }
  if (btnCancelPwd && changePwdModal) {
    btnCancelPwd.addEventListener('click', () => changePwdModal.classList.remove('active'));
  }

  if (btnSavePwd) {
    btnSavePwd.addEventListener('click', async () => {
      const old_password = pwdOldInput ? pwdOldInput.value : '';
      const new_password = pwdNewInput ? pwdNewInput.value.trim() : '';
      const confirm_pwd = pwdConfirmInput ? pwdConfirmInput.value.trim() : '';

      if (!isAdmin() && !old_password) {
        if (pwdModalError) pwdModalError.textContent = 'Please enter your current password.';
        return;
      }
      if (new_password.length < 8) {
        if (pwdModalError) pwdModalError.textContent = 'New password must be at least 8 characters long.';
        return;
      }
      if (new_password !== confirm_pwd) {
        if (pwdModalError) pwdModalError.textContent = 'New passwords do not match.';
        return;
      }

      if (pwdModalError) pwdModalError.textContent = '';
      try {
        const res = await apiFetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: state.currentUser?.username,
            old_password: old_password,
            new_password: new_password
          })
        });
        const data = await res.json();
        if (!res.ok) {
          if (pwdModalError) pwdModalError.textContent = data.message || 'Failed to update password.';
          return;
        }
        if (changePwdModal) changePwdModal.classList.remove('active');
        showToast('🔑 Password updated successfully!');
      } catch (err) {
        if (pwdModalError) pwdModalError.textContent = 'Server error while changing password.';
      }
    });
  }
}

// ================= ADMIN ACCOUNTS MANAGEMENT =================
export function initAdminAccounts() {
  const accountForm = document.getElementById('account-form');
  const accountFullName = document.getElementById('account-full-name');
  const accountUsername = document.getElementById('account-username');
  const accountPassword = document.getElementById('account-password');
  const accountType = document.getElementById('account-type');

  if (accountForm) {
    accountForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!isAdmin()) {
        openAdminPinModal(() => {});
        return;
      }
      if (accountPassword.value.length < 8) {
        alert('Password must be at least 8 characters.');
        accountPassword.focus();
        return;
      }
      const res = await apiFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: accountFullName.value.trim(),
          username: accountUsername.value.trim(),
          password: accountPassword.value,
          account_type: accountType.value
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Unable to create account.');
        return;
      }
      accountForm.reset();
      showToast('Account created successfully.');
      loadAccounts();
    });
  }
}

export async function loadAccounts() {
  const accountsTableBody = document.getElementById('accounts-table-body');
  if (!accountsTableBody) return;
  const res = await apiFetch('/api/accounts');
  if (!res.ok) return;
  const data = await res.json();
  accountsTableBody.innerHTML = data.accounts.map(account => `
    <tr>
      <td>${escapeHtml(account.full_name || '-')}</td>
      <td>${escapeHtml(account.username)}</td>
      <td>${account.account_type === 'higher_up' ? 'Higher Up / Admin' : 'Employee / Staff'}</td>
      <td>${account.is_active ? 'Active' : 'Inactive'}</td>
      <td><button class="btn btn-outline-danger btn-sm btn-delete-account" data-id="${account.id}" data-type="${account.account_type}">Delete</button></td>
    </tr>
  `).join('');
  accountsTableBody.querySelectorAll('.btn-delete-account').forEach(button => {
    button.addEventListener('click', () => deleteAccount(button.dataset.type, button.dataset.id));
  });
}

export async function deleteAccount(accountTypeValue, accountId) {
  if (!confirm('Delete this account? This cannot be undone.')) return;
  const res = await apiFetch(`/api/accounts/${accountTypeValue}/${accountId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) {
    alert(data.message || 'Unable to delete account.');
    return;
  }
  showToast('Account deleted successfully.');
  loadAccounts();
}

