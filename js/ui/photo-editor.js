import { cropFrame, cropLayout, cropRectangle, zoomCrop } from '../core/photo-crop.js';
import { t, number } from '../core/i18n.js';
import { $, onAction, openDialog, closeDialog, toast } from './components.js';

// This editor owns temporary images only. The profile commits a photo explicitly
// through onSave; closing the sheet never changes the stored avatar.
export function initPhotoEditor({ onSave, onChoose }) {
  const dialog = $('photoCropModal'), stage = $('photoCropStage'), range = $('photoCropZoom');
  const images = [...dialog.querySelectorAll('[data-crop-image]')];
  const pointers = new Map();
  let session = null, gesture = null;

  function releasePointers() {
    for (const id of pointers.keys()) {
      try { if (stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id); } catch { /* The OS may have cancelled the pointer. */ }
    }
    pointers.clear(); gesture = null; stage.classList.remove('is-dragging');
  }
  function dispose() {
    releasePointers();
    const previous = session; session = null;
    for (const image of images) image.removeAttribute('src');
    previous?.release?.();
  }
  function render() {
    if (!session) return;
    const { image, frame } = session;
    const layout = cropLayout(image.naturalWidth, image.naturalHeight, frame);
    for (const thumbnail of images) {
      thumbnail.style.width = `${layout.width * 100}%`; thumbnail.style.height = `${layout.height * 100}%`;
      thumbnail.style.left = `${layout.left * 100}%`; thumbnail.style.top = `${layout.top * 100}%`;
    }
    range.value = frame.zoom;
    range.style.setProperty('--range-fill', `${(frame.zoom - 1) / 3 * 100}%`);
    range.setAttribute('aria-valuetext', `${number(frame.zoom * 100)}%`);
    $('photoCropZoomValue').textContent = `${number(frame.zoom * 100)}%`;
  }
  function update(frame) {
    if (!session) return;
    session.frame = cropFrame(session.image.naturalWidth, session.image.naturalHeight, frame); render();
  }
  function zoom(value) {
    if (!session) return;
    const { image, frame } = session;
    update(zoomCrop(image.naturalWidth, image.naturalHeight, frame, value));
  }
  function position(event) {
    const rect = stage.getBoundingClientRect();
    const edge = rect.width;
    if (!(edge > 0)) return null;
    return { x: (event.clientX - rect.left) / edge - .5, y: (event.clientY - rect.top) / edge - .5 };
  }
  function startGesture() {
    if (!session || !pointers.size) { gesture = null; return; }
    const [first, second] = [...pointers.values()];
    gesture = { frame: { ...session.frame }, start: first };
    if (second) {
      gesture.mid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      gesture.distance = Math.hypot(first.x - second.x, first.y - second.y);
    }
  }
  stage.addEventListener('pointerdown', event => {
    if (!session || !dialog.open || (event.pointerType === 'mouse' && event.button !== 0) || pointers.size >= 2) return;
    const point = position(event); if (!point) return;
    event.preventDefault(); pointers.set(event.pointerId, point);
    try { stage.setPointerCapture?.(event.pointerId); } catch { /* A cancelled pointer cannot be captured. */ }
    stage.classList.add('is-dragging'); startGesture();
  });
  stage.addEventListener('pointermove', event => {
    if (!session || !gesture || !pointers.has(event.pointerId)) return;
    const point = position(event); if (!point) return;
    event.preventDefault(); pointers.set(event.pointerId, point);
    const [first, second] = [...pointers.values()];
    if (second && gesture.distance > 0) {
      const mid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      update(zoomCrop(session.image.naturalWidth, session.image.naturalHeight, gesture.frame,
        gesture.frame.zoom * Math.hypot(first.x - second.x, first.y - second.y) / gesture.distance, gesture.mid, mid));
    } else update({ ...gesture.frame, x: gesture.frame.x + first.x - gesture.start.x, y: gesture.frame.y + first.y - gesture.start.y });
  });
  const endPointer = event => {
    if (!pointers.delete(event.pointerId)) return;
    try { if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
    if (!pointers.size) stage.classList.remove('is-dragging');
    startGesture();
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('lostpointercapture', endPointer);
  stage.addEventListener('keydown', event => {
    if (!session) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault(); const step = event.shiftKey ? .08 : .02;
      update({ ...session.frame, x: session.frame.x + direction[0] * step, y: session.frame.y + direction[1] * step });
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(session.frame.zoom + .1); }
    else if (event.key === '-') { event.preventDefault(); zoom(session.frame.zoom - .1); }
  });
  range.addEventListener('input', () => { releasePointers(); zoom(Number(range.value)); });
  onAction('resetPhotoCrop', () => { releasePointers(); update({ zoom: 1, x: 0, y: 0 }); });
  onAction('chooseCropPhoto', onChoose);
  onAction('savePhotoCrop', () => {
    if (!session) return;
    try {
      releasePointers();
      const { image, frame, source, valid } = session;
      if (!valid()) { closeDialog(dialog.id); return; }
      const rect = cropRectangle(image.naturalWidth, image.naturalHeight, frame);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d'); if (!context) throw new Error('canvas_unavailable');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, 512, 512);
      context.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, 512, 512);
      const photo = canvas.toDataURL('image/jpeg', .88);
      let editableSource = source;
      if (!editableSource) {
        const original = document.createElement('canvas');
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
        original.width = Math.max(1, Math.round(image.naturalWidth * scale)); original.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const originalContext = original.getContext('2d'); if (!originalContext) throw new Error('canvas_unavailable');
        originalContext.fillStyle = '#ffffff'; originalContext.fillRect(0, 0, original.width, original.height);
        originalContext.drawImage(image, 0, 0, original.width, original.height);
        editableSource = original.toDataURL('image/jpeg', .86);
      }
      if (!valid()) return;
      onSave(photo, { source: editableSource, frame: { ...frame } });
      $('photoCropSave').disabled = true; closeDialog(dialog.id);
    } catch (error) { console.error(error); toast(t('save_error')); }
  });
  dialog.addEventListener('close', dispose);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releasePointers(); });
  document.addEventListener('fitcat:viewport', releasePointers);
  window.visualViewport?.addEventListener('resize', releasePointers);
  window.addEventListener('resize', releasePointers);
  window.addEventListener('pagehide', dispose);
  document.addEventListener('fitcat:language', render);

  return {
    open({ image, source = '', frame, valid, release }) {
      dispose();
      $('photoCropSave').disabled = false;
      session = { image, source, frame: cropFrame(image.naturalWidth, image.naturalHeight, frame), valid, release };
      for (const thumbnail of images) thumbnail.setAttribute('src', image.src);
      render(); openDialog(dialog.id);
    },
    discard() { dispose(); closeDialog(dialog.id); },
  };
}
