import { createSubscription, SUBSCRIPTION_KEY, LEGACY_SUBSCRIPTION_KEY, LEGACY_WALLET_KEY } from '../core/subscription.js';
import { t, locale } from '../core/i18n.js';
import { $, onAction, openDialog, closeDialog } from '../ui/components.js';
import { enter } from '../ui/motion.js';
import { renderPremium } from '../ui/premium.js';

const details = Object.freeze({ 'smart-water': 'pro_water_detail', 'macro-history': 'pro_macros_detail', templates: 'pro_templates_detail',
  gestures: 'pro_gestures_detail', appearance: 'pro_appearance_detail', sounds: 'pro_sounds_detail', 'profile-style': 'pro_profile_style_detail' });
let subscription, expiryTimer, requestedFeature = '', panel = 'overview', openRequest = 0;
const expiryLabel = value => value ? new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';

function setPanel(name, animate = true) {
  panel = name;
  for (const node of document.querySelectorAll('[data-subscription-panel]')) node.hidden = node.dataset.subscriptionPanel !== name;
  const destination = $('subscriptionDialog').querySelector(`[data-subscription-panel="${name}"]`), heading = destination.querySelector('h2');
  $('subscriptionDialog').scrollTop = 0;
  $('subscriptionDialog').setAttribute('aria-labelledby', heading.id);
  if (animate) enter(destination, { y: 8 });
  if ($('subscriptionDialog').open) heading.focus({ preventScroll: true });
}

export function renderSubscription() {
  if (!subscription) return;
  const status = subscription.reload();
  renderPremium();
  $('proFeatureNotice').hidden = !requestedFeature || status.active;
  if (requestedFeature) {
    $('proFeatureTitle').textContent = t('pro_feature_' + requestedFeature);
    $('proFeatureDescription').textContent = t(details[requestedFeature]);
  }
  for (const id of ['subscriptionBadge', 'subscriptionCurrentPlan']) $(id).classList.toggle('is-plus', status.active);
  $('subscriptionBadge').setAttribute('aria-label', `${t('subscription')}: ${status.active ? 'Plus' : 'Basic'}`);
  $('subscriptionCurrentPlanValue').textContent = status.active ? 'Plus' : 'Basic';
  $('subscriptionCurrentDetail').textContent = status.active ? `${t('subscription_until')} ${expiryLabel(status.expiresAt)}` : t('subscription_free');
  $('subscriptionExpired').hidden = status.active || !status.redeemed;
  $('subscriptionActiveDetails').hidden = !status.active;
  $('subscriptionActiveDays').textContent = `${t('subscription_remaining')} ${status.remainingDays} ${t('days')}`;
  $('subscriptionActiveUntil').textContent = `${t('subscription_until')} ${expiryLabel(status.expiresAt)}`;
}

function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const status = subscription.status();
  if (status.active) expiryTimer = setTimeout(refresh, Math.min(2147483647, Math.max(1, status.expiresAt - Date.now())));
}
function refresh() {
  subscription.reload(); renderSubscription(); scheduleExpiry();
  document.dispatchEvent(new CustomEvent('fitcat:subscription', { detail: subscription.status() }));
}
function openSubscription(feature = '') {
  const token = ++openRequest;
  requestedFeature = Object.hasOwn(details, feature) ? feature : '';
  refresh(); setPanel('overview', false);
  const show = () => { if (token === openRequest) openDialog('subscriptionDialog'); };
  const previous = [...document.querySelectorAll('dialog[open]')].reverse().find(dialog => dialog.id !== 'subscriptionDialog');
  if (previous && !previous.hasAttribute('data-static-dialog')) { previous.addEventListener('close', show, { once: true }); closeDialog(previous.id); }
  else if (!previous) show();
}
export function initSubscription() {
  let storage; try { storage = globalThis.localStorage; } catch { storage = null; }
  subscription = createSubscription(storage);
  onAction('openSubscription', () => openSubscription());
  onAction('subscriptionOverview', () => { refresh(); setPanel('overview'); });
  onAction('subscriptionTerms', () => setPanel('terms'));
  document.addEventListener('fitcat:pro-request', event => openSubscription(event.detail));
  document.addEventListener('fitcat:entitlement', refresh);
  document.addEventListener('fitcat:language', renderSubscription);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.addEventListener('fitcat:screen', renderSubscription);
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => { if ([SUBSCRIPTION_KEY, LEGACY_SUBSCRIPTION_KEY, LEGACY_WALLET_KEY, null].includes(event.key)) refresh(); });
  renderSubscription(); scheduleExpiry();
}
