import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initNavLens } from '../js/ui/nav-lens.js';

function harness({ touchFallback = false } = {}) {
  const env = setupDOM(), nav = document.getElementById('bottomNav');
  nav.hidden = false; document.getElementById('navDock').hidden = false; document.body.dataset.screen = 'mainPage';
  if (!touchFallback) window.PointerEvent = class {};
  nav.getBoundingClientRect = () => ({ left: 14, top: 700, width: 372, height: 70, bottom: 770 });
  const captured = new Set(); nav.hasPointerCapture = id => captured.has(id); nav.setPointerCapture = id => captured.add(id);
  nav.releasePointerCapture = id => { captured.delete(id); const event = new Event('lostpointercapture'); Object.defineProperty(event, 'pointerId', { value: id }); nav.dispatchEvent(event); };
  const originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let timerId = 0, index = 0; const selected = [];
  globalThis.setTimeout = (run, delay) => { timers.set(++timerId, { run, delay }); return timerId; };
  globalThis.clearTimeout = id => timers.delete(id);
  const options = { getIndex: () => index, onSelect: value => { index = value; selected.push(value); document.dispatchEvent(new CustomEvent('fitcat:tab', { detail: value })); } };
  const controller = initNavLens(nav, options);
  const pointer = (type, x, y = 735, extra = {}, target = type === 'pointerdown' ? nav : document) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...extra })) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event); return event;
  };
  const touch = (type, x, extra = {}) => {
    const point = { identifier: 7, clientX: x, clientY: 735 };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [point] }, changedTouches: { value: [point] }, ...Object.fromEntries(Object.entries(extra).map(([key,value]) => [key,{value}])) });
    nav.dispatchEvent(event); return event;
  };
  const click = (detail = 1) => { const event = new Event('click', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'detail', { value: detail }); nav.querySelector('[data-tab="friends"]').dispatchEvent(event); return event; };
  const hold = () => { for (const [id, timer] of [...timers]) if (timer.delay === 200 && timers.delete(id)) timer.run(); };
  return { env, nav, pointer, touch, click, hold, selected, controller, captured, options, get index() { return index; },
    close() { controller.dispose(); globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; env.restoreTimers(); } };
}

test('a short press previews the lens but leaves a normal click and keyboard activation native', () => {
  const h = harness(); try {
    h.pointer('pointerdown', 335); assert.equal(h.nav.style['--lens-index'], '3');
    h.pointer('pointerup', 335); assert.equal(h.index, 0); assert.deepEqual(h.selected, []); assert.equal(h.click().defaultPrevented, false);
    assert.equal(h.click(0).defaultPrevented, false); assert.equal(h.nav.classList.contains('is-scrubbing'), false);
  } finally { h.close(); }
});
test('dragging previews fractional positions and commits exactly once on release', () => {
  const h = harness(); try {
    h.pointer('pointerdown', 65); const move = h.pointer('pointermove', 220);
    assert.equal(move.defaultPrevented, true); assert.equal(h.nav.classList.contains('is-scrubbing'), true);
    assert.ok(Number(h.nav.style['--lens-index']) > 1 && Number(h.nav.style['--lens-index']) < 2);
    assert.equal(h.nav.querySelector('[data-tab="analytics"]').classList.contains('is-preview'), true);
    assert.deepEqual(h.selected, []); assert.equal(h.index, 0);
    h.pointer('pointerup', 335); assert.deepEqual(h.selected, [3]); assert.equal(h.nav.style['--lens-index'], '3');
    assert.equal(h.nav.classList.contains('is-scrubbing'), false); assert.equal(h.captured.size, 0);
    assert.equal(h.click().defaultPrevented, true); assert.equal(h.click(0).defaultPrevented, false);
    h.pointer('pointerdown', 155); h.pointer('pointerup', 155);
    assert.equal(h.click().defaultPrevented, false, 'a fresh physical tap is not a compatibility click from the previous drag');
  } finally { h.close(); }
});
test('a hold can start dragging without an initial swipe and returning to the same tab does not navigate', () => {
  const h = harness(); try {
    h.pointer('pointerdown', 65); h.hold(); assert.equal(h.nav.classList.contains('is-scrubbing'), true);
    h.pointer('pointermove', 245); h.pointer('pointermove', 65); h.pointer('pointerup', 65);
    assert.deepEqual(h.selected, []); assert.equal(h.nav.style['--lens-index'], '0');
    h.pointer('pointerdown', 245); h.hold(); h.pointer('pointerup', 245); assert.deepEqual(h.selected, [2]);
  } finally { h.close(); }
});
test('horizontal boundaries clamp the lens while a vertical escape cancels navigation', () => {
  const h = harness(); try {
    h.pointer('pointerdown', 65); h.pointer('pointermove', 1000); assert.equal(h.nav.style['--lens-index'], '3');
    h.pointer('pointermove', -100); assert.equal(h.nav.style['--lens-index'], '0'); h.pointer('pointerup', -100); assert.deepEqual(h.selected, []);
    h.pointer('pointerdown', 65); h.pointer('pointermove', 155, 900); h.pointer('pointerup', 245); assert.deepEqual(h.selected, []);
    h.pointer('pointerdown', 65); h.pointer('pointermove', 67, 760); h.pointer('pointerup', 245); assert.deepEqual(h.selected, []);
  } finally { h.close(); }
});
test('a second finger, OS cancellation and lost pointer capture restore the actual selected tab', () => {
  const h = harness(); try {
    for (const cancel of [() => h.pointer('pointerdown', 200, 735, { pointerId: 2, isPrimary: false }),
      () => h.pointer('pointerdown', 200, 300, { pointerId: 2, isPrimary: false }, document),
      () => h.pointer('pointercancel', 200), () => h.nav.releasePointerCapture(1)]) {
      h.pointer('pointerdown', 65); h.pointer('pointermove', 245); cancel(); h.pointer('pointerup', 335);
      assert.deepEqual(h.selected, []); assert.equal(h.nav.style['--lens-index'], '0'); assert.equal(h.nav.querySelectorAll('.is-preview').length, 0);
    }
  } finally { h.close(); }
});
test('screen, viewport, modal, external tab changes and explicit lifecycle resets cancel pending gestures', () => {
  const h = harness(); try {
    for (const type of ['fitcat:screen', 'fitcat:viewport', 'fitcat:dialogopen', 'fitcat:tab']) {
      h.pointer('pointerdown', 65); h.pointer('pointermove', 245); document.dispatchEvent(new Event(type)); h.pointer('pointerup', 335);
      assert.deepEqual(h.selected, []); assert.equal(h.nav.classList.contains('is-scrubbing'), false);
    }
    h.pointer('pointerdown', 65); h.hold(); h.controller.reset(); h.pointer('pointerup', 335); assert.deepEqual(h.selected, []);
    h.pointer('pointerdown', 65); h.pointer('pointermove', 245); window.dispatchEvent(new Event('blur')); h.pointer('pointerup', 335); assert.deepEqual(h.selected, []);
  } finally { h.close(); }
});
test('hidden docks, keyboard mode, open sheets and nonprimary mouse buttons cannot start a preview', () => {
  const h = harness(); try {
    const dock = document.getElementById('navDock'), dialog = document.getElementById('walletDialog');
    for (const [block, unblock] of [[() => { dock.hidden = true; }, () => { dock.hidden = false; }],
      [() => dock.classList.add('keyboard-open'), () => dock.classList.remove('keyboard-open')],
      [() => dialog.showModal(), () => dialog.close()], [() => { document.hidden = true; }, () => { document.hidden = false; }]]) {
      block(); h.pointer('pointerdown', 65); h.pointer('pointermove', 245); h.pointer('pointerup', 245); unblock();
      assert.deepEqual(h.selected, []); assert.equal(h.nav.querySelectorAll('.is-preview').length, 0);
    }
    h.pointer('pointerdown', 65, 735, { button: 2, pointerType: 'mouse' }); h.hold(); assert.deepEqual(h.selected, []);
  } finally { h.close(); }
});
test('legacy touch events provide the same single-commit drag and reject multiple fingers', () => {
  const h = harness({ touchFallback: true }); try {
    h.touch('touchstart', 65); assert.equal(h.touch('touchmove', 245).defaultPrevented, true); h.touch('touchend', 245); assert.deepEqual(h.selected, [2]);
    h.touch('touchstart', 245); h.touch('touchmove', 65, { touches: [{ identifier: 7, clientX: 65, clientY: 735 }, { identifier: 8, clientX: 90, clientY: 735 }] });
    h.touch('touchend', 65); assert.deepEqual(h.selected, [2]);
  } finally { h.close(); }
});
test('initialization is idempotent and disposal clears captures, timers and event handlers', () => {
  const h = harness(); try {
    assert.equal(initNavLens(h.nav, h.options), h.controller);
    h.pointer('pointerdown', 65); h.hold(); h.controller.dispose(); h.pointer('pointermove', 245); h.pointer('pointerup', 245); h.hold();
    assert.deepEqual(h.selected, []); assert.equal(h.captured.size, 0);
  } finally { h.close(); }
});
