import { createSubscription, formatPromo, SUBSCRIPTION_KEY, PROMO_DAYS } from '../core/subscription.js';
import { t, locale, number } from '../core/i18n.js';
import { $, onAction, openDialog } from '../ui/components.js';
import { enter } from '../ui/motion.js';
import { SUBSCRIPTION_PRICES } from '../core/wallet.js';
import { getWallet, purchaseWithCoins, walletError, openWallet } from './wallet.js';

let subscription;
let expiryTimer;
let chosenTerm = '1';
let panel = 'overview';
let errorKey = '';
let revealPending = false;
let checkoutPeriod = '1';
let checkoutId;
let successPeriod = null;

function currentStatus() {
  try { return getWallet()?.status() || subscription.status(); }
  catch { return subscription.status(); }
}
function balance() { try { return getWallet().snapshot().balance; } catch { return null; } }

function expiryLabel(value) {
  return value ? new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';
}

function setPanel(name, animate = true) {
  panel = name;
  for (const node of document.querySelectorAll('[data-subscription-panel]')) node.hidden = node.dataset.subscriptionPanel !== name;
  const destination = $('subscriptionDialog').querySelector(`[data-subscription-panel="${name}"]`);
  if (animate) enter(destination, { y: 9, duration: 400 });
  $('subscriptionDialog').scrollTop = 0;
  const heading = destination?.querySelector('h2');
  if (heading) { $('subscriptionDialog').setAttribute('aria-labelledby', heading.id); heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}

function showError(key = '') {
  errorKey = key;
  $('promoError').textContent = key ? t(key) : '';
  $('promoError').hidden = !key;
  if (key) $('promoCode').setAttribute('aria-invalid', 'true');
  else $('promoCode').removeAttribute('aria-invalid');
}

export function renderSubscription() {
  if (!subscription) return;
  const status = currentStatus();
  const badge = $('subscriptionBadge');
  // Reveal the new header status after the congratulations window closes.
  badge.classList.toggle('is-pro', status.active && !revealPending);
  badge.setAttribute('aria-label', `${t('subscription')}: ${status.active ? 'PRO+' : 'Basic'}`);
  $('subscriptionCurrentPlanValue').textContent = status.active ? 'PRO+' : 'Basic';
  $('subscriptionCurrentPlan').classList.toggle('is-pro', status.active);
  $('subscriptionCurrentDetail').textContent = status.active ? `${t('subscription_until')} ${expiryLabel(status.expiresAt)}` : t('subscription_free');
  $('subscriptionActiveDetails').hidden = !status.active;
  $('subscriptionActiveDays').textContent = `${t('subscription_remaining')} ${status.remainingDays} ${t('days')}`;
  $('subscriptionActiveUntil').textContent = `${t('subscription_until')} ${expiryLabel(status.expiresAt)}`;
  $('subscriptionTerms').hidden = false;
  $('subscriptionPurchase').textContent = t(status.active ? 'subscription_extend' : 'subscription_get');
  $('subscriptionExpired').hidden = status.active || !status.redeemed;
  $('subscriptionSuccessUntil').textContent = `${t('subscription_until')} ${expiryLabel(status.expiresAt)}`;
  $('subscriptionSuccessDays').textContent = successPeriod ? t('subscription_term_' + successPeriod) : `${PROMO_DAYS} ${t('days')}`;
  const coins = balance();
  $('subscriptionCoinBalance').textContent = coins == null ? '—' : number(coins);
  $('subscriptionDebit').textContent = `${t('subscription_debit')} ${number(SUBSCRIPTION_PRICES[chosenTerm].price)} ${t('wallet_coins_unit')}`;
  const term = SUBSCRIPTION_PRICES[checkoutPeriod];
  $('checkoutPeriod').textContent = t('subscription_term_' + checkoutPeriod);
  $('checkoutPrice').textContent = `${number(term.price)} ${t('wallet_coins_unit')}`;
  $('checkoutAfter').textContent = coins == null ? '—' : `${number(Math.max(0, coins - term.price))} ${t('wallet_coins_unit')}`;
  for (const button of document.querySelectorAll('[data-subscription-term]')) {
    const selected = button.dataset.subscriptionTerm === chosenTerm;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('promoTermDetail').textContent = t('promo_offer_detail');
  if (errorKey) $('promoError').textContent = t(errorKey);
}

function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const status = currentStatus();
  if (status.active) expiryTimer = setTimeout(refresh, Math.min(2147483647, Math.max(1, status.expiresAt - Date.now())));
}

function refresh() {
  subscription.reload();
  if (!currentStatus().active) revealPending = false;
  renderSubscription();
  if (panel === 'success' && !currentStatus().active) setPanel('overview', false);
  scheduleExpiry();
}

function openSubscription() {
  refresh(); showError(); setPanel('overview', false); openDialog('subscriptionDialog');
}

export function initSubscription() {
  // Browser storage may be blocked. Reading stays harmless; activation then shows a save error.
  let storage;
  try { storage = globalThis.localStorage; } catch { storage = null; }
  subscription = createSubscription(storage);
  onAction('openSubscription', openSubscription);
  onAction('subscriptionOverview', () => { refresh(); setPanel('overview'); });
  onAction('subscriptionTerms', () => setPanel('terms'));
  onAction('chooseSubscriptionTerm', button => {
    if (!Object.hasOwn(SUBSCRIPTION_PRICES, button.dataset.subscriptionTerm)) return;
    chosenTerm = button.dataset.subscriptionTerm; $('subscriptionPurchaseError').hidden = true; renderSubscription();
  });
  onAction('subscriptionPromo', () => {
    refresh(); showError(); $('promoCode').value = ''; setPanel('promo');
  });
  onAction('subscriptionWallet', () => openWallet('promo'));
  onAction('subscriptionPurchase', () => {
    refresh();
    checkoutPeriod = chosenTerm; checkoutId = crypto.randomUUID();
    $('checkoutError').hidden = true;
    const coins = balance();
    if (coins == null || coins < SUBSCRIPTION_PRICES[chosenTerm].price) {
      $('subscriptionPurchaseError').textContent = t(coins == null ? 'wallet_corrupt' : 'wallet_insufficient');
      $('subscriptionPurchaseError').hidden = false; $('subscriptionWalletAction').hidden = false; return;
    }
    $('subscriptionPurchaseError').hidden = true; $('subscriptionWalletAction').hidden = true;
    renderSubscription(); setPanel('checkout');
  });
  onAction('confirmSubscriptionPurchase', async button => {
    if (button.disabled) return;
    button.disabled = true; revealPending = !currentStatus().active;
    try {
      await purchaseWithCoins(checkoutPeriod, { operationId: checkoutId });
      successPeriod = checkoutPeriod;
      renderSubscription(); scheduleExpiry(); setPanel('success');
      document.dispatchEvent(new CustomEvent('fitcat:subscription', { detail: currentStatus() }));
    } catch (error) {
      revealPending = false; renderSubscription();
      $('checkoutError').textContent = walletError(error); $('checkoutError').hidden = false;
    } finally { button.disabled = false; }
  });
  $('promoCode').addEventListener('input', event => {
    const input = event.target;
    if (input.selectionStart == null || input.selectionStart === input.value.length) input.value = formatPromo(input.value);
    showError();
  });
  $('promoCode').addEventListener('blur', () => { $('promoCode').value = formatPromo($('promoCode').value); });
  $('promoForm').addEventListener('submit', event => {
    event.preventDefault();
    const button = $('activatePromo');
    if (button.disabled) return;
    button.disabled = true;
    try {
      subscription.redeem($('promoCode').value);
      successPeriod = null;
      revealPending = true;
      $('promoCode').blur?.();
      showError(); renderSubscription(); scheduleExpiry(); setPanel('success');
      document.dispatchEvent(new CustomEvent('fitcat:subscription', { detail: currentStatus() }));
    } catch (error) {
      showError(['promo_format', 'promo_invalid', 'promo_used'].includes(error.message) ? error.message : 'save_error');
    } finally { button.disabled = false; }
  });
  $('subscriptionDialog').addEventListener('close', () => {
    revealPending = false;
    renderSubscription();
  });
  document.addEventListener('fitcat:language', renderSubscription);
  document.addEventListener('fitcat:wallet', () => { renderSubscription(); scheduleExpiry(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => { if (event.key === SUBSCRIPTION_KEY || event.key === null) refresh(); });
  document.addEventListener('fitcat:screen', () => renderSubscription());
  renderSubscription(); scheduleExpiry();
}
