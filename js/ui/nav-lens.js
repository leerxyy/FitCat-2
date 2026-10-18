const owners = new WeakMap();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Native buttons still own taps and keyboard activation. Dragging only previews
// a destination; one real navigation happens when the user releases the lens.
export function initNavLens(nav, { getIndex, onSelect }, doc = document, win = window) {
  if (owners.has(nav)) return owners.get(nav);
  const buttons = [...nav.querySelectorAll('[data-tab]')], handlers = [];
  let gesture = null, holdTimer, suppressUntil = 0;
  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    handlers.push(() => target.removeEventListener(name, handler, options));
  };
  const enabled = () => !doc.hidden && doc.body.dataset.screen === 'mainPage' && !nav.hidden
    && !nav.closest('[hidden], .keyboard-open') && !doc.querySelector('dialog[open]');
  function paint(position = getIndex(), preview = -1) {
    nav.style.setProperty('--lens-index', String(position));
    buttons.forEach((button, i) => button.classList.toggle('is-preview', i === preview));
  }
  function reset(suppress = false) {
    const previous = gesture; gesture = null; clearTimeout(holdTimer);
    if (suppress && previous) suppressUntil = Date.now() + 500;
    nav.classList.remove('is-scrubbing', 'is-lens-pressed');
    if (previous?.source === 'pointer') {
      try { if (nav.hasPointerCapture?.(previous.id)) nav.releasePointerCapture(previous.id); } catch { /* The OS may already have cancelled the pointer. */ }
    }
    paint();
  }
  const position = (x, bounds) => clamp((x - bounds.left - bounds.padding) / bounds.step - .5, 0, buttons.length - 1);
  function start(target, id, x, y, source) {
    if (gesture) { reset(true); return; }
    if (!enabled()) return;
    const rect = nav.getBoundingClientRect?.();
    if (!rect?.width || !rect.height) return;
    const style = win.getComputedStyle?.(nav);
    const padding = Number.parseFloat(style?.paddingLeft) || 6;
    const paddingRight = Number.parseFloat(style?.paddingRight) || padding;
    const borderLeft = Number.parseFloat(style?.borderLeftWidth) || 0, borderRight = Number.parseFloat(style?.borderRightWidth) || 0;
    const bounds = { left: rect.left + borderLeft, top: rect.top, bottom: rect.bottom ?? rect.top + rect.height, padding,
      step: (rect.width - borderLeft - borderRight - padding - paddingRight) / buttons.length };
    if (!(bounds.step > 0)) return;
    suppressUntil = 0;
    gesture = { id, x, y, latestX: x, latestY: y, bounds, source, active: false };
    nav.classList.add('is-lens-pressed');
    const initial = position(x, bounds); paint(initial, Math.round(initial));
    holdTimer = setTimeout(() => {
      if (gesture && gesture.id === id && gesture.source === source && enabled()) activate();
    }, 200);
  }
  function activate() {
    if (!gesture) return;
    clearTimeout(holdTimer); gesture.active = true; nav.classList.add('is-scrubbing');
    if (gesture.source === 'pointer') try { nav.setPointerCapture?.(gesture.id); } catch { /* Document listeners retain ownership outside the nav. */ }
    const value = position(gesture.latestX, gesture.bounds); paint(value, Math.round(value));
  }
  function move(id, x, y, event, source) {
    if (!gesture || gesture.id !== id || gesture.source !== source) return;
    if (!enabled()) { reset(true); return; }
    const dx = Math.abs(x - gesture.x), dy = Math.abs(y - gesture.y);
    if ((!gesture.active && dy > 14 && dy > dx * 1.2)
      || y < gesture.bounds.top - 48 || y > gesture.bounds.bottom + 48) { reset(true); return; }
    gesture.latestX = x; gesture.latestY = y;
    if (!gesture.active && dx > 7 && dx > dy * 1.2) activate();
    if (!gesture?.active) return;
    if (!event.cancelable) { reset(true); return; }
    event.preventDefault();
    const value = position(x, gesture.bounds); paint(value, Math.round(value));
  }
  function end(id, x, y, event, source) {
    if (!gesture || gesture.id !== id || gesture.source !== source) return;
    const previous = gesture;
    const commit = previous.active && enabled() && y >= previous.bounds.top - 48 && y <= previous.bounds.bottom + 48;
    const destination = Math.round(position(x, previous.bounds));
    reset(previous.active);
    if (!commit) return;
    if (event.cancelable) event.preventDefault();
    if (destination !== getIndex()) onSelect(destination);
    paint();
  }
  listen(nav, 'pointerdown', event => {
    if (event.isPrimary === false) { reset(true); return; }
    if (event.button != null && event.button !== 0) return;
    start(event.target, event.pointerId, event.clientX, event.clientY, 'pointer');
  });
  listen(doc, 'pointerdown', event => {
    if (gesture?.source === 'pointer' && event.pointerId !== gesture.id) reset(true);
  }, { passive: true });
  listen(doc, 'pointermove', event => move(event.pointerId, event.clientX, event.clientY, event, 'pointer'), { passive: false });
  listen(doc, 'pointerup', event => end(event.pointerId, event.clientX, event.clientY, event, 'pointer'));
  listen(doc, 'pointercancel', () => reset(true));
  listen(nav, 'lostpointercapture', event => { if (gesture?.source === 'pointer' && gesture.id === event.pointerId) reset(true); });
  if (!win.PointerEvent) {
    const find = (list, id) => Array.from(list || []).find(touch => touch.identifier === id);
    listen(nav, 'touchstart', event => {
      if (event.touches.length !== 1) { reset(true); return; }
      const touch = event.touches[0]; start(event.target, touch.identifier, touch.clientX, touch.clientY, 'touch');
    }, { passive: true });
    listen(doc, 'touchstart', event => { if (gesture?.source === 'touch' && event.touches.length !== 1) reset(true); }, { passive: true });
    listen(doc, 'touchmove', event => {
      if (!gesture || gesture.source !== 'touch') return;
      const touch = find(event.touches, gesture.id);
      if (event.touches.length !== 1 || !touch) { reset(true); return; }
      move(touch.identifier, touch.clientX, touch.clientY, event, 'touch');
    }, { passive: false });
    listen(doc, 'touchend', event => {
      if (!gesture || gesture.source !== 'touch') return;
      const touch = find(event.changedTouches, gesture.id);
      if (event.touches.length || !touch) { reset(true); return; }
      end(touch.identifier, touch.clientX, touch.clientY, event, 'touch');
    }, { passive: false });
    listen(doc, 'touchcancel', () => reset(true));
  }
  listen(nav, 'click', event => {
    if (event.detail === 0 || Date.now() >= suppressUntil) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, { capture: true });
  for (const name of ['fitcat:tab', 'fitcat:screen', 'fitcat:viewport', 'fitcat:dialogopen']) listen(doc, name, () => reset(true));
  listen(win, 'blur', () => reset(true));
  const controller = { reset: () => reset(true), dispose() { reset(); handlers.forEach(remove => remove()); owners.delete(nav); } };
  owners.set(nav, controller); paint(); return controller;
}
