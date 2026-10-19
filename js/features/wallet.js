import { createWallet, WALLET_KEY } from '../core/wallet.js';
import { formatPromo } from '../core/subscription.js';
import { state, proAccess } from '../core/store.js';
import { t, number, locale } from '../core/i18n.js';
import { $, onAction, openDialog, closeDialog, escapeHTML, icon, animateNumber, toast } from '../ui/components.js';
import { enter } from '../ui/motion.js';
import { requirePro } from '../ui/premium.js';

let wallet;
let filter = 'all';
let currentPanel = 'overview';
let errorKey = '';
const knownErrors = new Set(['promo_format', 'promo_unavailable', 'wallet_insufficient', 'wallet_corrupt', 'wallet_invalid_purchase']);
export const walletError = error => t(knownErrors.has(error?.message) ? error.message : 'save_error');
export const getWallet = () => wallet;

function showError(key = '') {
  errorKey = key;
  $('walletPromoError').textContent = key ? t(key) : '';
  $('walletPromoError').hidden = !key;
  if (key) $('walletPromoCode').setAttribute('aria-invalid', 'true'); else $('walletPromoCode').removeAttribute('aria-invalid');
}
function panel(name, animate = true) {
  if (name === 'transfer' && !requirePro('transfers')) return false;
  currentPanel = name;
  for (const section of document.querySelectorAll('[data-wallet-panel]')) section.hidden = section.dataset.walletPanel !== name;
  const section = $('walletDialog').querySelector(`[data-wallet-panel="${name}"]`);
  if (animate) enter(section, { y: 9 });
  $('walletDialog').scrollTop = 0;
  const heading = section.querySelector('h2');
  $('walletDialog').setAttribute('aria-labelledby', heading.id);
  heading.setAttribute('tabindex', '-1'); if ($('walletDialog').open) heading.focus({ preventScroll: true });
  return true;
}
export function openWallet(name = 'overview') {
  if (name === 'transfer' && !requirePro('transfers')) return;
  const show = () => { showError(); if (name === 'promo') $('walletPromoCode').value = ''; renderWallet(); if (panel(name, false)) openDialog('walletDialog'); };
  const previous = $('subscriptionDialog');
  if (previous.open) { previous.addEventListener('close', show, { once: true }); closeDialog(previous.id); }
  else show();
}
function announce() {
  document.dispatchEvent(new CustomEvent('fitcat:wallet'));
}
export async function purchaseWithCoins(period, options) {
  const result = await wallet.purchase(period, options); announce(); return result;
}
export async function purchaseCoverWithCoins(cover, options) {
  const result = await wallet.purchaseCover(cover, options); announce(); return result;
}
export function renderWallet() {
  if (!wallet) return;
  if (currentPanel === 'transfer' && !proAccess()) panel('overview', false);
  let value;
  try { value = wallet.snapshot(); }
  catch {
    $('headerCoinBalance').textContent = '—'; $('walletBalance').textContent = '—';
    $('walletHistoryList').textContent = t('wallet_corrupt'); return;
  }
  animateNumber($('headerCoinBalance'), value.balance); animateNumber($('walletBalance'), value.balance);
  $('walletBadge').setAttribute('aria-label', `${t('wallet_title')}: ${number(value.balance)} FitCat Coins`);
  const rows = value.entries.filter(entry => filter === 'all' || (filter === 'in' ? entry.amount > 0 : entry.amount < 0)).slice().reverse();
  $('walletHistoryList').innerHTML = rows.length ? rows.map(entry => {
    const incoming = entry.amount > 0;
    const title = incoming ? t('promo_label') : entry.kind === 'profile-cover'
      ? `${t('profile_city_receipt')} · ${t('profile_cover_' + entry.cover)}` : `PRO+ · ${t('subscription_term_' + entry.months)}`;
    const date = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.at));
    return `<div class="wallet-transaction"><span class="wallet-transaction-icon">${icon(incoming ? 'gift' : 'check')}</span><div><strong>${escapeHTML(title)}</strong><small>${t(incoming ? 'wallet_income' : 'wallet_expense')} · ${escapeHTML(date)}</small></div><span class="wallet-amount ${incoming ? 'is-income' : ''}"><img src="assets/icons/coin.svg" alt="" width="20" height="20">${incoming ? '+' : '−'}${number(Math.abs(entry.amount))}</span></div>`;
  }).join('') : `<p class="wallet-empty">${t('wallet_history_empty')}</p>`;
  for (const button of document.querySelectorAll('[data-wallet-filter]')) {
    const selected = button.dataset.walletFilter === filter;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  $('walletOwnId').textContent = state.uid;
  if (errorKey) $('walletPromoError').textContent = t(errorKey);
}
export function initWallet(options = {}) {
  let storage; try { storage = globalThis.localStorage; } catch { storage = null; }
  wallet = createWallet(storage, options);
  onAction('openWallet', () => openWallet());
  onAction('walletOverview', () => { showError(); panel('overview'); });
  onAction('walletPromo', () => { showError(); $('walletPromoCode').value = ''; panel('promo'); });
  onAction('walletTransfer', () => { $('walletTransferResult').hidden = true; panel('transfer'); });
  onAction('walletFilter', button => { filter = button.dataset.walletFilter; renderWallet(); });
  onAction('walletHistory', () => { filter = 'all'; renderWallet(); $('walletHistoryHeading').focus({ preventScroll: false }); });
  $('walletPromoCode').addEventListener('input', event => {
    const input = event.target;
    if (input.selectionStart == null || input.selectionStart === input.value.length) input.value = formatPromo(input.value);
    showError();
  });
  $('walletPromoCode').addEventListener('blur', () => { $('walletPromoCode').value = formatPromo($('walletPromoCode').value); });
  $('walletPromoForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('walletPromoActivate'); if (button.disabled) return;
    button.disabled = true;
    try {
      const before = wallet.snapshot().balance;
      const result = await wallet.redeem($('walletPromoCode').value);
      $('walletPromoCode').value = ''; $('walletPromoCode').blur?.(); showError(); announce();
      $('walletSuccessAmount').textContent = `+${number(result.balance - before)}`; panel('success');
    } catch (error) { showError(knownErrors.has(error.message) ? error.message : 'save_error'); }
    finally { button.disabled = false; }
  });
  $('walletTransferForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!requirePro('transfers')) return;
    if (!$('walletTransferForm').reportValidity()) return;
    const recipient = $('walletRecipient').value.trim(); const amount = Number($('walletTransferAmount').value);
    const message = recipient === state.uid ? 'own_id' : !/^\d{11}$/.test(recipient) ? 'invalid_id'
      : !Number.isSafeInteger(amount) || amount <= 0 ? 'wallet_invalid_amount' : 'wallet_transfer_unavailable';
    $('walletTransferResult').textContent = t(message); $('walletTransferResult').hidden = false;
    // A local prototype never subtracts funds or invents a completed transfer.
  });
  $('walletDialog').addEventListener('close', () => { $('walletPromoCode').value = ''; showError(); });
  onAction('walletCopyId', async () => {
    try { await navigator.clipboard.writeText(state.uid); toast(t('copied')); } catch { toast(t('wallet_copy_id_hint')); }
  });
  document.addEventListener('fitcat:wallet', renderWallet);
  document.addEventListener('fitcat:subscription', renderWallet);
  document.addEventListener('fitcat:language', renderWallet);
  document.addEventListener('fitcat:change', renderWallet);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) announce(); });
  window.addEventListener('storage', event => { if (event.key === WALLET_KEY || event.key === null) announce(); });
  renderWallet();
}
