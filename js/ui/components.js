import { persist } from '../core/store.js';
import { t, number } from '../core/i18n.js';
import { tweenValue, enter, exitDialog, cancelDialogExit } from './motion.js';
export { reducedMotion } from './motion.js';

export const $ = id => document.getElementById(id);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const icon = (name, className = '') => `<svg class="icon ${className}" aria-hidden="true"><use href="assets/icons/sprite.svg#${name}"></use></svg>`;
const actions = new Map();
let toastTimer;

export function onAction(name, handler) { actions.set(name, handler); }

export function initActions() {
  document.addEventListener('click', async event => {
    const close = event.target.closest('[data-close]');
    if (close) { closeDialog(close.dataset.close); return; }
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled || !actions.has(trigger.dataset.action)) return;
    if (trigger.tagName === 'A') event.preventDefault();
    try { await actions.get(trigger.dataset.action)(trigger, event); }
    catch (error) { console.error(error); toast(t(error.message === 'invalid_backup' ? 'invalid_backup' : 'network_error')); }
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(dialog.id); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog.id); });
    dialog.addEventListener('close', () => { document.body.classList.toggle('dialog-open', Boolean(document.querySelector('dialog[open]'))); });
  });
}

export function changed({ nutrition = false } = {}) {
  try { persist({ nutrition }); }
  catch (error) { console.error(error); toast(t('save_error')); }
  document.dispatchEvent(new CustomEvent('fitcat:change'));
}

export function openDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  cancelDialogExit(dialog);
  if (dialog.open) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  document.body.classList.add('dialog-open');
  enter(dialog, { y: 24, duration: 340 });
}

export function closeDialog(id) {
  const dialog = $(id);
  if (!dialog?.open) return;
  exitDialog(dialog, () => {
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); }
  });
}

export function toast(message, action) {
  const region = $('toast');
  clearTimeout(toastTimer);
  region.replaceChildren();
  const text = document.createElement('span'); text.textContent = message;
  region.append(text);
  if (action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label;
    button.addEventListener('click', () => { action.run(); region.classList.remove('visible'); }, { once: true });
    region.append(button);
  }
  region.classList.add('visible');
  toastTimer = setTimeout(() => region.classList.remove('visible'), action ? 6500 : 3300);
}

export function animateNumber(element, value, digits = 0) {
  if (!element) return;
  element.dataset.value = String(value);
  tweenValue(element, value, current => { element.textContent = number(current, digits); });
}

export function confirmAction(message) {
  return new Promise(resolve => {
    const dialog = $('confirmDialog');
    $('confirmMessage').textContent = message;
    let accepted = false;
    const accept = () => { accepted = true; closeDialog(dialog.id); };
    $('confirmAccept').addEventListener('click', accept, { once: true });
    dialog.addEventListener('close', () => { $('confirmAccept').removeEventListener('click', accept); resolve(accepted); }, { once: true });
    openDialog(dialog.id);
  });
}

export function promptValue(title, value = '', type = 'text') {
  return new Promise(resolve => {
    const dialog = $('promptDialog'); const form = $('promptForm'); const input = $('promptInput');
    $('promptTitle').textContent = title;
    input.type = type; input.value = value; input.min = type === 'number' ? '30' : ''; input.max = type === 'number' ? '500' : '';
    input.step = type === 'number' ? '0.1' : ''; input.required = true;
    let result = null;
    const submit = event => { event.preventDefault(); result = input.value.trim(); closeDialog(dialog.id); };
    form.addEventListener('submit', submit);
    dialog.addEventListener('close', () => { form.removeEventListener('submit', submit); resolve(result); }, { once: true });
    openDialog(dialog.id); input.select();
  });
}

export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : (words[0]?.slice(0, 2).toUpperCase() || 'FC');
}

export function safeImage(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /(^|\.)openfoodfacts\.org$/.test(parsed.hostname) ? parsed.href : '';
  } catch { return ''; }
}
