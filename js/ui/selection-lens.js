const owners = new WeakMap();
const hubs = new WeakMap();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const softEdge = (distance, limit) => distance * limit / (limit + Math.abs(distance));

// One document owner serves every track. Previewing never writes data or changes
// a page: native taps/keys or a single drag release commit the choice.
function getHub(doc, win) {
  if (hubs.has(doc)) return hubs.get(doc);
  const clients = new Set(), handlers = [];
  const listen = (target, name, run, options) => {
    target.addEventListener(name, run, options);
    handlers.push(() => target.removeEventListener(name, run, options));
  };
  const hub = { clients, active: null,
    reset() { clients.forEach(client => client.reset()); },
    dispose() { handlers.forEach(remove => remove()); hubs.delete(doc); },
  };
  listen(doc, 'pointerdown', event => {
    if (hub.active && !hub.active.owns(event.pointerId, 'pointer')) hub.active.reset();
  }, { passive: true });
  listen(doc, 'pointermove', event => hub.active?.move(event.pointerId, event.clientX, event.clientY, event, 'pointer'), { passive: false });
  listen(doc, 'pointerup', event => hub.active?.end(event.pointerId, event.clientX, event.clientY, event, 'pointer'));
  listen(doc, 'pointercancel', () => hub.active?.reset());
  if (!win.PointerEvent) {
    const find = (list, owner) => Array.from(list || []).find(point => owner.owns(point.identifier, 'touch'));
    listen(doc, 'touchstart', event => { if (hub.active && event.touches.length !== 1) hub.active.reset(); }, { passive: true });
    listen(doc, 'touchmove', event => {
      const owner = hub.active;
      if (!owner) return;
      const point = find(event.touches, owner);
      if (event.touches.length !== 1 || !point) { owner.reset(); return; }
      owner.move(point.identifier, point.clientX, point.clientY, event, 'touch');
    }, { passive: false });
    listen(doc, 'touchend', event => {
      const owner = hub.active;
      if (!owner) return;
      const point = find(event.changedTouches, owner);
      if (event.touches.length || !point) { owner.reset(); return; }
      owner.end(point.identifier, point.clientX, point.clientY, event, 'touch');
    }, { passive: false });
    listen(doc, 'touchcancel', () => hub.active?.reset());
  }
  for (const name of ['fitcat:tab', 'fitcat:screen', 'fitcat:viewport', 'fitcat:dialogopen']) listen(doc, name, () => hub.reset());
  listen(win, 'blur', () => hub.reset());
  listen(win, 'resize', () => hub.reset());
  hubs.set(doc, hub); return hub;
}

export function resetSelectionLenses(doc = document) { hubs.get(doc)?.reset(); }
export function syncSelectionLens(track) { owners.get(track)?.sync(); }

export function initSelectionLens(track, { getIndex, onSelect, selector = 'button', padding = 0, gap = 0, isEnabled = () => true }, doc = document, win = window) {
  if (owners.has(track)) return owners.get(track);
  const buttons = [...track.querySelectorAll(selector)], hub = getHub(doc, win), handlers = [];
  if (!buttons.length) throw new Error('A selection lens needs native choice buttons.');
  let gesture = null, holdTimer, suppressUntil = 0;
  track.classList.add('has-selection-lens');
  track.setAttribute('data-no-profile-swipe', ''); track.setAttribute('data-no-main-swipe', ''); track.setAttribute('data-no-surface-feedback', '');
  const listen = (name, handler, options) => {
    track.addEventListener(name, handler, options);
    handlers.push(() => track.removeEventListener(name, handler, options));
  };
  const enabled = () => !doc.hidden && !track.closest('[hidden], [inert], .keyboard-open')
    && !doc.querySelector('dialog[open]') && isEnabled();
  const selectedIndex = () => clamp(Number(getIndex()) || 0, 0, buttons.length - 1);

  function measure() {
    const rect = track.getBoundingClientRect?.();
    if (!rect?.width || !rect.height) return null;
    const style = win.getComputedStyle?.(track);
    const width = track.offsetWidth || rect.width, height = track.offsetHeight || rect.height;
    const scale = rect.width / width;
    const border = Number.parseFloat(style?.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(style?.borderRightWidth) || 0;
    const borderTop = Number.parseFloat(style?.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(style?.borderBottomWidth) || 0;
    const left = Number.parseFloat(style?.paddingLeft) || padding, right = Number.parseFloat(style?.paddingRight) || padding;
    const top = Number.parseFloat(style?.paddingTop) || padding, bottom = Number.parseFloat(style?.paddingBottom) || padding;
    const space = Number.parseFloat(style?.columnGap) || gap;
    const step = (width - border - borderRight - left - right - space * (buttons.length - 1)) / buttons.length;
    if (!(step > 0)) return null;
    const boxes = buttons.map((button, index) => {
      // Layout offsets ignore magnification and the finger's press animation.
      if (button.offsetWidth > 0 && button.offsetHeight > 0) return { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight };
      const box = button.getBoundingClientRect?.();
      if (box?.width && box.height) return { x: (box.left - rect.left) / scale - border, y: (box.top - rect.top) / scale - borderTop, width: box.width / scale, height: box.height / scale };
      return { x: left + index * (step + space), y: top, width: step, height: height - top - bottom - borderTop - borderBottom };
    });
    return { left: rect.left, scale, border, boxes, centers: boxes.map(box => box.x + box.width / 2) };
  }
  function paint(index = selectedIndex(), preview = -1, layout = measure(), edge = 0, drift = 0) {
    track.style.setProperty('--lens-index', String(index));
    if (layout) {
      const first = layout.boxes[Math.floor(index)], last = layout.boxes[Math.ceil(index)], fraction = index % 1;
      for (const [variable, key, offset] of [['x', 'x', edge], ['y', 'y', drift], ['width', 'width', 0], ['height', 'height', 0]]) {
        track.style.setProperty('--lens-' + variable, `${first[key] + (last[key] - first[key]) * fraction + offset}px`);
      }
    }
    buttons.forEach((button, i) => {
      const focus = Math.max(0, 1 - Math.abs(index - i));
      button.classList.toggle('is-preview', i === preview);
      button.style.setProperty('--choice-scale', String(1 + focus * .08));
      button.style.setProperty('--choice-label-scale', String(1 + focus * .025));
      button.style.setProperty('--choice-lift', `${-focus}px`);
    });
  }
  function reset(suppress = false) {
    const previous = gesture; gesture = null; clearTimeout(holdTimer);
    if (hub.active === controller) hub.active = null;
    if (suppress && previous) suppressUntil = Date.now() + 500;
    track.classList.remove('is-scrubbing', 'is-lens-pressed', 'is-lens-held');
    if (previous?.source === 'pointer') {
      try { if (track.hasPointerCapture?.(previous.id)) track.releasePointerCapture(previous.id); } catch { /* The OS may already have released it. */ }
    }
    paint();
  }
  function position(x) {
    const { layout, grab } = gesture, centers = layout.centers;
    const local = (x - layout.left) / layout.scale - layout.border - grab;
    if (local < centers[0]) return { index: 0, edge: softEdge(local - centers[0], Math.min(18, layout.boxes[0].width * .18)) };
    const final = centers.length - 1;
    if (local > centers[final]) return { index: final, edge: softEdge(local - centers[final], Math.min(18, layout.boxes[final].width * .18)) };
    let index = 0;
    while (index < final && local > centers[index + 1]) index++;
    return { index: index === final ? final : index + (local - centers[index]) / (centers[index + 1] - centers[index]), edge: 0 };
  }
  function follow(x, y) {
    const value = position(x);
    paint(value.index, Math.round(value.index), gesture.layout, value.edge, softEdge((y - gesture.y) / gesture.layout.scale, 8));
  }
  function start(id, x, y, source, target) {
    if (hub.active) { hub.active.reset(); return; }
    if (!enabled() || target.closest?.('button')?.disabled) return;
    const layout = measure(); if (!layout) return;
    const chosen = layout.boxes[selectedIndex()], local = (x - layout.left) / layout.scale - layout.border;
    // Grabbing the current lens at its edge must not jump its center to the finger.
    const grab = local >= chosen.x && local <= chosen.x + chosen.width ? local - chosen.x - chosen.width / 2 : 0;
    suppressUntil = 0;
    gesture = { id, x, y, layout, grab, source, active: false };
    hub.active = controller; track.classList.add('is-lens-pressed'); follow(x, y);
    // Holding only enlarges the glass. It never starts or commits navigation.
    holdTimer = setTimeout(() => { if (gesture && enabled()) track.classList.add('is-lens-held'); }, 200);
  }
  function activate() {
    clearTimeout(holdTimer); gesture.active = true; track.classList.add('is-scrubbing');
    if (gesture.source === 'pointer') try { track.setPointerCapture?.(gesture.id); } catch { /* Document events still own the gesture. */ }
  }
  function move(id, x, y, event, source) {
    if (!gesture || gesture.id !== id || gesture.source !== source) return;
    if (!enabled()) { reset(true); return; }
    if (!gesture.active && (x !== gesture.x || y !== gesture.y)) activate();
    if (!gesture.active) return;
    if (!event.cancelable) { reset(true); return; }
    event.preventDefault(); follow(x, y);
  }
  function end(id, x, y, event, source) {
    if (!gesture || gesture.id !== id || gesture.source !== source) return;
    // A very quick swipe may end between two frames without a move event.
    // Release coordinates still complete it, independently of the hold timer.
    const dragged = gesture.active || x !== gesture.x || y !== gesture.y;
    const commit = dragged && enabled();
    const destination = Math.round(position(x).index);
    reset(dragged);
    if (!commit) return;
    if (event.cancelable) event.preventDefault();
    if (!buttons[destination].disabled && destination !== selectedIndex()) onSelect(destination);
    paint();
  }
  listen('pointerdown', event => {
    if (event.isPrimary === false) { hub.active?.reset(); return; }
    if (event.button != null && event.button !== 0) return;
    start(event.pointerId, event.clientX, event.clientY, 'pointer', event.target);
  });
  listen('lostpointercapture', event => { if (gesture?.source === 'pointer' && gesture.id === event.pointerId) reset(true); });
  if (!win.PointerEvent) listen('touchstart', event => {
    if (event.touches.length !== 1) { hub.active?.reset(); return; }
    const point = event.touches[0]; start(point.identifier, point.clientX, point.clientY, 'touch', event.target);
  }, { passive: true });
  listen('click', event => {
    if (event.detail === 0 || Date.now() >= suppressUntil) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, { capture: true });
  const observer = win.ResizeObserver ? new win.ResizeObserver(() => reset(true)) : null;
  const controller = { reset: () => reset(true), sync: () => reset(true), move, end,
    owns: (id, source) => gesture?.id === id && gesture?.source === source,
    dispose() {
      reset(); observer?.disconnect(); handlers.forEach(remove => remove());
      owners.delete(track); hub.clients.delete(controller);
      if (!hub.clients.size) hub.dispose();
    },
  };
  owners.set(track, controller); hub.clients.add(controller); observer?.observe(track); paint(); return controller;
}
