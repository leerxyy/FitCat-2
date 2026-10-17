import { state, proAccess, templateSlotAvailable } from '../core/store.js';
import { BASIC_TEMPLATE_LIMIT } from '../core/access.js';
import { t, number } from '../core/i18n.js';
import { $, icon } from './components.js';

export function requirePro(feature) {
  if (proAccess()) return true;
  document.dispatchEvent(new CustomEvent('fitcat:pro-request', { detail: feature }));
  return false;
}
export function requireTemplateSlot() {
  return templateSlotAvailable() || requirePro('templates');
}
export function renderPremium() {
  const active = proAccess();
  for (const button of document.querySelectorAll('[data-pro-feature]')) {
    const limited = button.dataset.proFeature === 'templates';
    const show = !limited || active || state.templates.length >= BASIC_TEMPLATE_LIMIT;
    let badge = button.querySelector('.pro-feature-badge');
    if (!badge) {
      badge = document.createElement('span'); badge.className = 'pro-feature-badge'; badge.setAttribute('aria-hidden', 'true');
      badge.innerHTML = `<span class="rgb-rim"></span><span class="pro-feature-lock">${icon('lock')}</span><span class="pro-feature-text">PRO+</span>`;
      button.append(badge);
    }
    button.classList.add('pro-entry'); button.classList.toggle('is-pro-locked', show && !active);
    badge.hidden = !show; badge.classList.toggle('is-unlocked', active);
    const label = t(button.dataset.proLabel || 'pro_feature_' + button.dataset.proFeature);
    button.setAttribute('aria-label', show ? `${label}. ${t(active ? 'pro_included' : 'pro_required')}` : label);
  }
  if ($('templateAllowance')) $('templateAllowance').textContent = active
    ? t('pro_templates_unlimited') : `${t('pro_templates_basic')}: ${number(Math.min(state.templates.length, BASIC_TEMPLATE_LIMIT))} / ${BASIC_TEMPLATE_LIMIT}`
      + (state.templates.length > BASIC_TEMPLATE_LIMIT ? ` · ${number(state.templates.length)} ${t('pro_templates_saved')}` : '');
}
