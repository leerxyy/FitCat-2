import { createSubscription, formatPromo, SUBSCRIPTION_KEY, PROMO_DAYS } from '../core/subscription.js';
import { t, locale } from '../core/i18n.js';
import { $, onAction, openDialog } from '../ui/components.js';
import { enter } from '../ui/motion.js';

let subscription;
let expiryTimer;
let chosenTerm = '1';
let panel = 'overview';
let errorKey = '';
let revealPending = false;

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
  const status = subscription.status();
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
  $('subscriptionTerms').hidden = status.active;
  $('subscriptionPurchase').textContent = t(status.active ? 'subscription_extend' : 'subscription_get');
  $('subscriptionExpired').hidden = status.active || !status.redeemed;
  $('subscriptionSuccessUntil').textContent = `${t('subscription_until')} ${expiryLabel(status.expiresAt)}`;
  $('subscriptionSuccessDays').textContent = `${PROMO_DAYS} ${t('days')}`;
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
  const status = subscription.status();
  if (status.active) expiryTimer = setTimeout(refresh, Math.max(1, status.expiresAt - Date.now()));
}

function refresh() {
  subscription.reload();
  if (!subscription.status().active) revealPending = false;
  renderSubscription();
  if (panel === 'success' && !subscription.status().active) setPanel('overview', false);
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
  onAction('chooseSubscriptionTerm', button => { chosenTerm = button.dataset.subscriptionTerm; renderSubscription(); });
  onAction('subscriptionPurchase', () => {
    refresh(); showError(); $('promoCode').value = ''; setPanel('promo');
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
      revealPending = true;
      $('promoCode').blur?.();
      showError(); renderSubscription(); scheduleExpiry(); setPanel('success');
      document.dispatchEvent(new CustomEvent('fitcat:subscription', { detail: subscription.status() }));
    } catch (error) {
      showError(['promo_format', 'promo_invalid', 'promo_used'].includes(error.message) ? error.message : 'save_error');
    } finally { button.disabled = false; }
  });
  $('subscriptionDialog').addEventListener('close', () => {
    revealPending = false;
    renderSubscription();
  });
  document.addEventListener('fitcat:language', renderSubscription);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => { if (event.key === SUBSCRIPTION_KEY || event.key === null) refresh(); });
  document.addEventListener('fitcat:screen', () => renderSubscription());
  renderSubscription(); scheduleExpiry();
}
