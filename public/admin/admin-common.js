// admin-common.js — Fonctions partagées par les pages admin
async function requireAuth() {
  try {
    const res = await fetch(API_BASE_URL + '/api/admin/me', { credentials: 'include' });
    const data = await res.json();
    if (!data.isAdmin) { window.location.href = 'login.html'; return new Promise(() => {}); }
  } catch (err) {
    window.location.href = 'login.html';
    return new Promise(() => {});
  }
}
async function logout() {
  await fetch(API_BASE_URL + '/api/admin/logout', { method: 'POST', credentials: 'include' });
  window.location.href = 'login.html';
}
function statusClass(status) {
  return { 'Payé':'paid', 'À confirmer':'pending', 'En attente de paiement':'waiting', 'Échec paiement':'failed' }[status] || 'pending';
}
function debounce(fn, delay) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}
function fcfa(n) { return Math.round(n).toLocaleString('fr-FR') + ' FCFA'; }
