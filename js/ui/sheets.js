import { cancelEntrance, play, MOTION } from './motion.js';

const owners = new WeakMap();
const CONTROLS = 'input, select, textarea, button, a, label, summary, video, canvas, [contenteditable], [role="slider"], [role="button"], [data-no-sheet-drag]';

// Mouse/pen use pointer events. Cancelable touch moves let iOS hand a downward
// pull at the scroll boundary to the sheet while retaining native scrolling.
export function initSheetGestures(onClose, doc = document, win = window) {
  if (owners.has(doc)) return owners.get(doc);
  let drag, frame;
  const returns = new WeakMap(); const returning = new Set();
  const suppressed = new WeakMap(); const opened = []; const handlers = [];
  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    handlers.push(() => target.removeEventListener(name, handler, options));
  };
  const top = () => {
    const dialogs = [...doc.querySelectorAll('dialog[open]')];
    return dialogs.findLast(dialog => dialog.hasAttribute('data-static-dialog'))
      || opened.findLast(dialog => dialog.open) || dialogs.at(-1);
  };
  const time = event => Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
  const atTop = (target, dialog) => {
    for (let node = target; node; node = node.parentElement) {
      if ((node.scrollTop || 0) > 1) return false;
      if (node === dialog) break;
    }
    return true;
  };
  const readY = dialog => {
    if (typeof globalThis.getComputedStyle === 'function') {
      const value = getComputedStyle(dialog).transform;
      const matrix = value?.match(/^matrix(3d)?\(([^)]+)\)$/);
      if (matrix) return Number(matrix[2].split(',')[matrix[1] ? 13 : 5]) || 0;
      if (!value || value === 'none') return 0;
    }
    return returns.get(dialog)?.offset || 0;
  };
  const stopReturn = dialog => {
    const job = returns.get(dialog);
    returns.delete(dialog); returning.delete(dialog); job?.animation?.cancel();
  };
  const clear = () => {
    cancelAnimationFrame(frame); frame = undefined;
    const previous = drag; drag = null;
    if (previous?.active) {
      previous.dialog.classList.remove('is-dragging'); previous.dialog.style.setProperty('--sheet-drag', '0px');
      if (previous.source === 'pointer') try { previous.capture.releasePointerCapture?.(previous.id); } catch { /* Capture may already be lost. */ }
    }
    return previous;
  };
  const restore = (dialog, offset) => {
    stopReturn(dialog);
    if (!dialog.open || !offset) return;
    const animation = play(dialog, [
      { transform: `translate3d(0, ${offset}px, 0)` }, { transform: 'translate3d(0, 0, 0)' },
    ], { duration: MOTION.close + 40 });
    if (!animation) return;
    const job = { animation, offset }; returns.set(dialog, job); returning.add(dialog);
    const done = () => { if (returns.get(dialog) === job) { returns.delete(dialog); returning.delete(dialog); } };
    animation.finished.then(done, done);
  };
  const cancel = () => { const previous = clear(); if (previous?.active) restore(previous.dialog, previous.offset); };
  const reset = () => { clear(); for (const dialog of returning) stopReturn(dialog); };
  const suppress = current => suppressed.set(current.dialog, { target: current.target, until: Date.now() + 500 });
  const activate = current => {
    const offset = readY(current.dialog); stopReturn(current.dialog); cancelEntrance(current.dialog);
    current.y -= offset; current.offset = offset; current.active = true;
    current.dialog.classList.add('is-dragging'); current.dialog.style.setProperty('--sheet-drag', `${offset}px`);
    if (current.source === 'pointer') try { current.capture.setPointerCapture?.(current.id); } catch { /* Global pointer listeners remain available. */ }
  };
  const start = (target, id, x, y, at, source) => {
    const handle = target.closest?.('[data-sheet-handle]');
    if (!handle && (target.closest?.(CONTROLS) || win.getSelection?.()?.isCollapsed === false)) return;
    const dialog = target.closest?.('dialog.sheet');
    if (!dialog?.open || dialog !== top() || dialog.hasAttribute('data-static-dialog') || dialog.classList.contains('is-closing')) return;
    if (target === dialog) {
      const rect = dialog.getBoundingClientRect?.();
      if (rect?.width && (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)) return;
    }
    drag = { dialog, handle, target, capture: handle || dialog, id, source, x, y, started: at, offset: 0, active: false, moved: false };
    if (handle) activate(drag);
  };
  const move = (x, y, at, event) => {
    if (!drag) return;
    if (drag.dialog !== top()) { cancel(); return; }
    let dy = y - drag.y; const dx = x - drag.x;
    if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (drag.active) suppress(drag); cancel(); return; }
    if (!drag.active) {
      if (win.getSelection?.()?.isCollapsed === false) { cancel(); return; }
      if (!atTop(drag.target, drag.dialog) || dy < 0) { drag.y = y; drag.started = at; return; }
      if (dy <= 8) return;
      if (drag.source === 'touch' && !event.cancelable) { cancel(); return; }
      activate(drag); dy = y - drag.y;
    }
    drag.offset = Math.max(0, Math.min(dy, (drag.dialog.getBoundingClientRect?.().height || 600) * .85));
    drag.moved ||= Math.abs(dy) > 5;
    if (drag.moved) { if (event.cancelable) event.preventDefault(); suppress(drag); }
    if (frame != null) return;
    frame = requestAnimationFrame(() => { frame = undefined; if (drag?.active) drag.dialog.style.setProperty('--sheet-drag', `${drag.offset}px`); });
  };
  const end = (at, event) => {
    const previous = clear();
    if (!previous?.active || !previous.moved) return;
    suppress(previous); if (event.cancelable) event.preventDefault();
    const elapsed = Math.max(1, at - previous.started);
    const threshold = Math.min(148, Math.max(76, (previous.dialog.getBoundingClientRect?.().height || 600) * .22));
    const close = previous.offset >= threshold || (previous.offset > 36 && previous.offset / elapsed > .65);
    if (close && previous.dialog === top()) onClose(previous.dialog.id, { fromY: previous.offset });
    else restore(previous.dialog, previous.offset);
  };

  listen(doc, 'keydown', event => { if (event.key === 'Tab') doc.documentElement.classList.add('keyboard-navigation'); });
  listen(doc, 'pointerdown', event => {
    doc.documentElement.classList.remove('keyboard-navigation');
    if (event.pointerType === 'touch') return;
    if (drag && event.pointerId !== drag.id) { cancel(); return; }
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    start(event.target, event.pointerId, event.clientX, event.clientY, time(event), 'pointer');
  });
  listen(doc, 'pointermove', event => { if (drag?.source === 'pointer' && event.pointerId === drag.id) move(event.clientX, event.clientY, time(event), event); }, { passive: false });
  listen(doc, 'pointerup', event => { if (drag?.source === 'pointer' && event.pointerId === drag.id) end(time(event), event); });
  for (const name of ['pointercancel', 'lostpointercapture']) listen(doc, name, event => { if (drag?.source === 'pointer' && event.pointerId === drag.id) cancel(); });
  listen(doc, 'touchstart', event => {
    doc.documentElement.classList.remove('keyboard-navigation');
    if (event.touches.length !== 1) { cancel(); return; }
    const touch = event.touches[0];
    start(event.target, touch.identifier, touch.clientX, touch.clientY, time(event), 'touch');
  }, { passive: true });
  listen(doc, 'touchmove', event => {
    if (drag?.source !== 'touch') return;
    if (event.touches.length !== 1) { cancel(); return; }
    const touch = Array.from(event.touches).find(item => item.identifier === drag.id);
    if (touch) move(touch.clientX, touch.clientY, time(event), event);
  }, { passive: false });
  listen(doc, 'touchend', event => {
    if (drag?.source === 'touch' && Array.from(event.changedTouches).some(item => item.identifier === drag.id)) end(time(event), event);
  }, { passive: false });
  listen(doc, 'touchcancel', () => { if (drag?.source === 'touch') cancel(); });
  listen(doc, 'click', event => {
    const dialog = event.target.closest?.('dialog.sheet'); const ignored = suppressed.get(dialog);
    if (event.detail !== 0 && ignored?.until > Date.now()) {
      for (let node = ignored.target; node; node = node.parentElement) {
        if (node === event.target) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (node === dialog) break;
      }
    }
    const handle = event.target.closest?.('[data-sheet-handle]');
    if (handle && dialog?.open && dialog === top()) onClose(dialog.id);
  }, true);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });
  listen(doc, 'fitcat:screen', reset); listen(doc, 'fitcat:viewport', reset);
  listen(doc, 'fitcat:dialogopen', event => {
    const dialog = doc.getElementById(event.detail?.id);
    if (!dialog?.open) return;
    const index = opened.indexOf(dialog); if (index !== -1) opened.splice(index, 1);
    opened.push(dialog); if (drag && drag.dialog !== dialog) cancel();
  });
  listen(doc, 'fitcat:dialogclose', () => {
    for (let index = opened.length - 1; index >= 0; index--) if (!opened[index].open) opened.splice(index, 1);
    if (drag && !drag.dialog.open) clear();
    for (const dialog of returning) if (!dialog.open) stopReturn(dialog);
  });
  listen(win, 'resize', reset); listen(win, 'pagehide', reset); listen(win, 'blur', cancel);
  const dispose = () => { reset(); for (const remove of handlers) remove(); owners.delete(doc); };
  owners.set(doc, dispose); return dispose;
}
