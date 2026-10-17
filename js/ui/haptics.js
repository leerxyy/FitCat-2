import { state } from '../core/store.js';

let bridge;
let lastPulse = -Infinity;

function appleSwitch() {
  const nav = globalThis.navigator;
  const appleTouchDevice = /iPhone|iPad|iPod/.test(nav?.userAgent || '') || (nav?.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  if (!appleTouchDevice) return null;
  if (!bridge) {
    const input = document.createElement('input');
    input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
    if (!('switch' in input)) return null;
    const label = document.createElement('label');
    label.className = 'haptic-bridge'; label.setAttribute('aria-hidden', 'true');
    label.append(input); bridge = label;
  }
  // A modal makes the rest of the document inert. Keep the helper in its active layer.
  const layer = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  if (bridge.parentElement !== layer) layer.append(bridge);
  return bridge;
}

export function haptic() {
  if (!state.preferences.hapticsEnabled || document.hidden) return false;
  const now = performance.now();
  if (now - lastPulse < 45) return true;
  if (typeof navigator.vibrate === 'function') {
    try { if (navigator.vibrate(8) !== false) { lastPulse = now; return true; } } catch { /* Try the native switch fallback. */ }
  }
  try {
    const label = appleSwitch();
    if (!label) return false;
    lastPulse = now;
    // Best effort on iOS 18+: activate the associated switch through its label.
    // Never cover app controls with a switch, which would interfere with scrolling.
    label.click(); return true;
  } catch { return false; }
}

export function initHaptics() {
  appleSwitch();
  document.addEventListener('click', event => {
    if (!event.isTrusted || event.target.closest?.('.haptic-bridge')) return;
    const control = event.target.closest?.('button, summary, input[type="checkbox"], a');
    if (!control || control.disabled || control.closest('[inert]')) return;
    haptic();
  }, { capture: true });
  document.addEventListener('submit', event => { if (event.isTrusted) haptic(); }, { capture: true });
}
