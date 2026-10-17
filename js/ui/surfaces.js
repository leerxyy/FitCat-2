import { reducedMotion } from './motion.js';

// Decorative feedback only. Native clicks, focus, selection and scrolling keep
// their normal behaviour; no card gains a fake button role or a new action.
const SURFACES = '.card, .smart-water-hero, .smart-water-control, .smart-water-breakdown, .smart-water-switch-row, .subscription-offer, .subscription-active, .checkout-summary';
const CONTROLS = 'button, a, input, select, textarea, label, summary, [contenteditable], [role="button"], [data-action], [data-no-surface-feedback]';

function edgePoint(surface, clientX, clientY) {
  const rect = surface.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  let x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  let y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const distances = [x, rect.width - x, y, rect.height - y];
  const edge = distances.indexOf(Math.min(...distances));
  if (edge === 0) x = 0;
  else if (edge === 1) x = rect.width;
  else if (edge === 2) y = 0;
  else y = rect.height;
  return { x, y };
}

export function initSurfaces() {
  const prepared = new WeakSet();
  const finePointer = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
  const preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let active = null;
  let lit = null;
  let hover = null;
  let move = null;
  let frame = 0;
  let pressTimer;
  let lightTimer;
  let disposed = false;
  const listeners = [];

  const pick = target => {
    const surface = target?.closest?.(SURFACES);
    if (!surface || surface.closest('[hidden], [inert], .is-closing, .view-leaving')) return null;
    if (document.querySelector('dialog[open]') && !surface.closest('dialog[open]')) return null;
    return surface;
  };

  function clearTimers() { clearTimeout(pressTimer); clearTimeout(lightTimer); }
  function clearFrame() { if (frame) cancelAnimationFrame(frame); frame = 0; move = null; }
  function fade() {
    if (lit) { lit.classList.remove('surface-pressed'); lit.style.setProperty('--surface-light', '0'); }
    lit = null;
  }
  function reset() { active = null; hover = null; clearTimers(); clearFrame(); fade(); }
  function illuminate(surface, clientX, clientY, strength) {
    if (disposed || document.hidden || reducedMotion() || surface.isConnected === false) return false;
    const point = edgePoint(surface, clientX, clientY);
    if (!point) return false;
    if (!prepared.has(surface)) {
      const light = document.createElement('span');
      light.className = 'surface-light'; light.setAttribute('aria-hidden', 'true');
      surface.append(light); surface.classList.add('surface-feedback'); prepared.add(surface);
    }
    if (lit !== surface) { fade(); lit = surface; }
    surface.style.setProperty('--surface-x', `${point.x.toFixed(1)}px`);
    surface.style.setProperty('--surface-y', `${point.y.toFixed(1)}px`);
    surface.style.setProperty('--surface-light', String(strength));
    return true;
  }

  function down(event) {
    if (document.hidden || reducedMotion()) return;
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) { reset(); return; }
    if (active && active.id !== event.pointerId) { reset(); return; }
    const surface = pick(event.target);
    if (!surface || event.target.closest?.(CONTROLS)) return;
    clearTimers(); clearFrame(); fade();
    active = { id: event.pointerId, surface, x: event.clientX, y: event.clientY, time: performance.now(), touch: event.pointerType === 'touch' };
    // Wait for a confirmed tap on touch screens so the first frame of a scroll
    // never compresses a card. A mouse gets immediate press feedback.
    if (!active.touch && illuminate(surface, event.clientX, event.clientY, .9)) surface.classList.add('surface-pressed');
  }
  function moved(event) {
    if (active?.id === event.pointerId) {
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 9) reset();
      return;
    }
    if (event.pointerType === 'touch' || !finePointer?.matches || reducedMotion() || document.hidden) return;
    const surface = pick(event.target); hover = surface;
    if (!surface) { clearFrame(); fade(); return; }
    move = { surface, x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0; const next = move; move = null;
      if (next && hover === next.surface) illuminate(next.surface, next.x, next.y, .52);
    });
  }
  function up(event) {
    if (!active || active.id !== event.pointerId) return;
    const tap = active; active = null;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 9 || performance.now() - tap.time > 700
      || pick(event.target) !== tap.surface || event.target.closest?.(CONTROLS)) { reset(); return; }
    clearTimers();
    if (!illuminate(tap.surface, event.clientX, event.clientY, .95)) return;
    tap.surface.classList.add('surface-pressed');
    pressTimer = setTimeout(() => tap.surface.classList.remove('surface-pressed'), 120);
    lightTimer = setTimeout(() => {
      if (lit !== tap.surface) return;
      if (!tap.touch && hover === tap.surface && finePointer?.matches) tap.surface.style.setProperty('--surface-light', '.52');
      else fade();
    }, 300);
  }
  function out(event) {
    if (event.pointerType === 'touch') return;
    const from = pick(event.target); const to = pick(event.relatedTarget);
    if (from === to) return;
    hover = to;
    if (active?.surface === from) { reset(); return; }
    if (lit === from) { clearFrame(); fade(); }
  }
  function listen(target, name, handler, options) {
    target?.addEventListener?.(name, handler, options);
    listeners.push(() => target?.removeEventListener?.(name, handler, options));
  }
  listen(document, 'pointerdown', down, { passive: true });
  listen(document, 'pointermove', moved, { passive: true });
  listen(document, 'pointerup', up, { passive: true });
  listen(document, 'pointerout', out, { passive: true });
  listen(document, 'pointercancel', reset, { passive: true });
  listen(document, 'scroll', reset, { passive: true, capture: true });
  listen(document, 'fitcat:tab', reset);
  listen(document, 'fitcat:dialogclose', reset);
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  listen(window, 'blur', reset);
  listen(window, 'pagehide', reset);
  listen(preference, 'change', reset);
  return () => { reset(); disposed = true; listeners.forEach(remove => remove()); };
}
