import { cancelEntrance, play, MOTION } from './motion.js';

const owners = new WeakMap();

// Only the explicit handle participates. Content, fields and scroll gestures keep
// their native behaviour; no document/body scroll positions are written here.
export function initSheetGestures(onClose, doc = document, win = window) {
  if (owners.has(doc)) return owners.get(doc);
  let drag;
  let frame;
  const returns = new WeakMap();
  const returning = new Set();
  const suppressed = new WeakMap();
  const opened = [];
  const handlers = [];
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
    if (previous) {
      previous.dialog.classList.remove('is-dragging');
      previous.dialog.style.setProperty('--sheet-drag', '0px');
      try { previous.handle.releasePointerCapture?.(previous.id); } catch { /* Capture may already be lost. */ }
    }
    return previous;
  };
  const restore = (dialog, offset) => {
    stopReturn(dialog);
    if (!dialog.open || !offset) return;
    const animation = play(dialog, [
      { transform: `translate3d(0, ${offset}px, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ], { duration: MOTION.close + 40 });
    if (!animation) return;
    const job = { animation, offset }; returns.set(dialog, job); returning.add(dialog);
    const done = () => { if (returns.get(dialog) === job) { returns.delete(dialog); returning.delete(dialog); } };
    animation.finished.then(done, done);
  };
  const cancel = () => {
    const previous = clear();
    if (previous) restore(previous.dialog, previous.offset);
  };
  const reset = () => {
    clear();
    for (const dialog of returning) stopReturn(dialog);
  };

  listen(doc, 'pointerdown', event => {
    if (drag && event.pointerId !== drag.id) { cancel(); return; }
    const handle = event.target.closest?.('[data-sheet-handle]');
    if (!handle || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    const dialog = handle.closest('dialog');
    if (!dialog?.open || dialog !== top() || dialog.hasAttribute('data-static-dialog') || dialog.classList.contains('is-closing')) return;
    const offset = readY(dialog); stopReturn(dialog); cancelEntrance(dialog);
    drag = { dialog, handle, id: event.pointerId, x: event.clientX, y: event.clientY - offset,
      started: time(event), offset, moved: offset > 5 };
    dialog.classList.add('is-dragging'); dialog.style.setProperty('--sheet-drag', `${offset}px`);
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* Keyboard-only fallback remains available. */ }
  });
  listen(doc, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.dialog !== top()) { cancel(); return; }
    const dy = event.clientY - drag.y; const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) { suppressed.set(drag.handle, Date.now() + 500); cancel(); return; }
    drag.offset = Math.max(0, Math.min(dy, (drag.dialog.getBoundingClientRect?.().height || 600) * .85));
    drag.moved ||= Math.abs(dy) > 5;
    if (drag.moved) { event.preventDefault(); suppressed.set(drag.handle, Date.now() + 500); }
    if (frame != null) return;
    frame = requestAnimationFrame(() => { frame = undefined; if (drag) drag.dialog.style.setProperty('--sheet-drag', `${drag.offset}px`); });
  }, { passive: false });
  listen(doc, 'pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const previous = clear();
    if (!previous.moved) return;
    suppressed.set(previous.handle, Date.now() + 500);
    const elapsed = Math.max(1, time(event) - previous.started);
    const threshold = Math.min(148, Math.max(76, (previous.dialog.getBoundingClientRect?.().height || 600) * .22));
    const close = previous.offset >= threshold || (previous.offset > 36 && previous.offset / elapsed > .65);
    if (close && previous.dialog === top()) onClose(previous.dialog.id, { fromY: previous.offset });
    else restore(previous.dialog, previous.offset);
  });
  listen(doc, 'pointercancel', event => { if (event.pointerId === drag?.id) cancel(); });
  listen(doc, 'lostpointercapture', event => { if (event.pointerId === drag?.id) cancel(); });
  listen(doc, 'click', event => {
    const handle = event.target.closest?.('[data-sheet-handle]');
    if (!handle) return;
    if (event.detail !== 0 && (suppressed.get(handle) || 0) > Date.now()) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const dialog = handle.closest('dialog');
    if (dialog?.open && dialog === top()) onClose(dialog.id);
  }, true);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });
  listen(doc, 'fitcat:screen', reset);
  listen(doc, 'fitcat:dialogopen', event => {
    const dialog = doc.getElementById(event.detail?.id);
    if (!dialog?.open) return;
    const index = opened.indexOf(dialog); if (index !== -1) opened.splice(index, 1);
    opened.push(dialog);
    if (drag && drag.dialog !== dialog) cancel();
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
