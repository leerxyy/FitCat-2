const owners = new WeakMap();
const CONTROLS = 'button, input, select, textarea, a, label, summary, video, canvas, [contenteditable], [role="slider"], [role="button"], [data-no-profile-swipe]';

// A rightward gesture on the profile's non-interactive content goes back.
// Vertical scroll, text editing, selection, multiple fingers and open sheets keep ownership.
export function initProfileSwipe(profile, onBack, doc = document, win = window) {
  if (owners.has(profile)) return owners.get(profile);
  let start;
  const handlers = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    handlers.push(() => target.removeEventListener(type, handler, options));
  };
  const clear = () => { start = null; };
  const selection = () => win.getSelection?.()?.isCollapsed === false;
  const enabled = () => !profile.hidden && doc.body.dataset.screen === 'profilePage' && !doc.hidden && !doc.querySelector('dialog[open]');
  const point = (list, id) => Array.from(list || []).find(touch => (touch.identifier ?? 0) === id);
  listen(profile, 'touchstart', event => {
    clear();
    if (!enabled() || event.touches?.length !== 1 || event.target.closest?.(CONTROLS) || doc.activeElement?.matches?.('input, select, textarea, [contenteditable]') || selection()) return;
    const touch = event.touches[0];
    start = { id: touch.identifier ?? 0, x: touch.clientX, y: touch.clientY, horizontal: false };
  }, { passive: true });
  listen(profile, 'touchmove', event => {
    if (!start) return;
    const touch = point(event.touches, start.id);
    if (!enabled() || event.touches?.length !== 1 || !touch || selection()) { clear(); return; }
    const dx = touch.clientX - start.x; const dy = Math.abs(touch.clientY - start.y);
    if (dx < -12 || (dy > 12 && dy > Math.abs(dx) * .7)) { clear(); return; }
    if (dx > 12 && dx > dy * 1.6) start.horizontal = true;
    if (start.horizontal) {
      if (!event.cancelable) { clear(); return; }
      event.preventDefault();
    }
  }, { passive: false });
  listen(profile, 'touchend', event => {
    const gesture = start; clear();
    if (!gesture || !enabled() || event.touches?.length || selection()) return;
    const touch = point(event.changedTouches, gesture.id);
    if (!touch) return;
    const dx = touch.clientX - gesture.x; const dy = Math.abs(touch.clientY - gesture.y);
    const threshold = Math.min(110, Math.max(64, (profile.getBoundingClientRect?.().width || 390) * .2));
    if (dx < threshold || dx < dy * 1.6) return;
    if (event.cancelable) event.preventDefault();
    onBack();
  }, { passive: false });
  listen(profile, 'touchcancel', clear, { passive: true });
  listen(doc, 'fitcat:dialogopen', clear);
  listen(doc, 'fitcat:screen', clear);
  listen(doc, 'fitcat:viewport', clear);
  listen(doc, 'visibilitychange', clear);
  listen(win, 'pagehide', clear);
  const dispose = () => { clear(); handlers.forEach(remove => remove()); owners.delete(profile); };
  owners.set(profile, dispose); return dispose;
}
