import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';
import { initSheetGestures } from '../js/ui/sheets.js';

let env, dispose, closed, frames, reduce;
const $ = id => document.getElementById(id);
function pointer(target, name, x, y, at, extra = {}) {
  const event = new Event(name, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, timeStamp: at, ...extra })) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event); return event;
}
function frame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(performance.now()); }
function touch(target, name, y, at, { x = 100, cancelable = true, fingers = 1 } = {}) {
  const point = { identifier: 7, clientX: x, clientY: y };
  const list = items => Object.assign({ length: items.length, item: index => items[index] || null }, items);
  const event = new Event(name, { bubbles: true, cancelable });
  Object.defineProperties(event, {
    touches: { value: list(name === 'touchend' || name === 'touchcancel' ? [] : Array.from({ length: fingers }, (_, i) => ({ ...point, identifier: 7 + i }))) },
    changedTouches: { value: list([point]) }, timeStamp: { value: at },
  });
  target.dispatchEvent(event); return event;
}
function open(id) {
  const dialog = $(id); dialog.showModal();
  document.dispatchEvent(new CustomEvent('fitcat:dialogopen', { detail: { id } }));
  dialog.getBoundingClientRect = () => ({ height: 600 }); dialog.animations = [];
  dialog.animate = (keyframes, options) => {
    let resolve, reject;
    const animation = { keyframes, options, cancelled: false, finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
      finish() { resolve(); }, cancel() { this.cancelled = true; reject(new DOMException('Cancelled', 'AbortError')); } };
    dialog.animations.push(animation); return animation;
  };
  return { dialog, handle: dialog.querySelector('[data-sheet-handle]') };
}
beforeEach(() => {
  env = setupDOM({ waterAmount: '750' }); closed = []; frames = new Map(); let sequence = 0; reduce = false;
  globalThis.matchMedia = () => ({ matches: reduce });
  globalThis.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  dispose = initSheetGestures((id, options) => closed.push({ id, options }));
});
afterEach(() => { dispose(); env.restoreTimers(); });

test('scrolling sheet content does not start a drag or change storage and page scroll', () => {
  const { dialog } = open('foodEntryModal'); const field = $('foodName');
  $('appScroller').scrollTop = 640; dialog.scrollTop = 95;
  const before = [...env.map];
  pointer(field, 'pointerdown', 100, 100, 0); const move = pointer(field, 'pointermove', 100, 320, 80); pointer(field, 'pointerup', 100, 320, 100); frame();
  assert.equal(move.defaultPrevented, false); assert.equal(dialog.classList.contains('is-dragging'), false);
  assert.equal(dialog.scrollTop, 95); assert.equal($('appScroller').scrollTop, 640);
  assert.deepEqual([...env.map], before); assert.equal(closed.length, 0); assert.equal(dialog.animations.length, 0);
});
test('a short handle drag returns smoothly and suppresses its synthetic click', async () => {
  const { dialog, handle } = open('walletDialog');
  pointer(handle.children[0], 'pointerdown', 100, 40, 0);
  const move = pointer(handle, 'pointermove', 100, 90, 300); frame();
  assert.equal(move.defaultPrevented, true); assert.equal(dialog.style.getPropertyValue('--sheet-drag'), '50px');
  pointer(handle, 'pointerup', 100, 90, 400);
  assert.equal(closed.length, 0); assert.equal(dialog.classList.contains('is-dragging'), false);
  assert.match(dialog.animations[0].keyframes[0].transform, /50px/);
  const click = new Event('click', { bubbles: true, cancelable: true }); Object.defineProperty(click, 'detail', { value: 1 }); handle.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true); assert.equal(closed.length, 0);
  dialog.animations[0].finish(); await tick(); assert.equal(dialog.style.getPropertyValue('--sheet-drag'), '0px');
});
test('a long pull and a quick downward flick close from their actual offsets', () => {
  const { dialog, handle } = open('walletDialog');
  pointer(handle, 'pointerdown', 80, 30, 0); pointer(handle, 'pointermove', 82, 200, 400); frame(); pointer(handle, 'pointerup', 82, 200, 500);
  assert.deepEqual(closed[0], { id: dialog.id, options: { fromY: 170 } });
  pointer(handle, 'pointerdown', 80, 30, 600); pointer(handle, 'pointermove', 80, 82, 630); pointer(handle, 'pointerup', 80, 82, 650);
  assert.deepEqual(closed[1], { id: dialog.id, options: { fromY: 52 } }); assert.equal(frames.size, 0);
});
test('horizontal movement, a second finger and pointer cancellation never dismiss a sheet', () => {
  const { dialog, handle } = open('smartWaterModal');
  pointer(handle, 'pointerdown', 80, 30, 0); pointer(handle, 'pointermove', 180, 50, 50); pointer(handle, 'pointerup', 180, 50, 80);
  assert.equal(dialog.classList.contains('is-dragging'), false);
  pointer(handle, 'pointerdown', 80, 30, 100); pointer(handle, 'pointermove', 80, 230, 200); frame();
  pointer(handle, 'pointerdown', 80, 230, 210, { pointerId: 2, isPrimary: false }); pointer(handle, 'pointerup', 80, 230, 220);
  pointer(handle, 'pointerdown', 80, 30, 300); pointer(handle, 'pointermove', 80, 230, 400); pointer(handle, 'pointercancel', 80, 230, 410);
  assert.equal(closed.length, 0); assert.equal(dialog.classList.contains('is-dragging'), false);
});
test('only the most recently opened sheet responds, including reverse DOM order and a static guard', () => {
  const wallet = open('walletDialog'); const food = open('foodEntryModal');
  pointer(wallet.handle, 'pointerdown', 80, 30, 0); pointer(wallet.handle, 'pointermove', 80, 230, 100); pointer(wallet.handle, 'pointerup', 80, 230, 200);
  assert.equal(closed.length, 0);
  pointer(food.handle, 'pointerdown', 80, 30, 300); pointer(food.handle, 'pointermove', 80, 200, 400); pointer(food.handle, 'pointerup', 80, 200, 500);
  assert.equal(closed[0].id, 'foodEntryModal');
  $('orientationGuard').showModal();
  pointer(food.handle, 'pointerdown', 80, 30, 600); pointer(food.handle, 'pointermove', 80, 230, 700); pointer(food.handle, 'pointerup', 80, 230, 800);
  assert.equal(closed.length, 1); assert.equal($('orientationGuard').querySelector('[data-sheet-handle]'), null);
});
test('resize cancels a gesture; keyboard activation works with reduced motion and no duplicate listeners', () => {
  const { dialog, handle } = open('subscriptionDialog');
  pointer(handle, 'pointerdown', 80, 30, 0); pointer(handle, 'pointermove', 80, 230, 100); frame(); window.dispatchEvent(new Event('resize'));
  pointer(handle, 'pointerup', 80, 230, 200); assert.equal(closed.length, 0); assert.equal(dialog.style.getPropertyValue('--sheet-drag'), '0px');
  reduce = true;
  pointer(handle, 'pointerdown', 80, 30, 300); pointer(handle, 'pointermove', 80, 50, 400); pointer(handle, 'pointerup', 80, 50, 500);
  assert.equal(dialog.animations.length, 0);
  assert.equal(initSheetGestures(() => assert.fail('duplicate listener')), dispose);
  const click = new Event('click', { bubbles: true }); Object.defineProperty(click, 'detail', { value: 0 }); handle.dispatchEvent(click);
  assert.deepEqual(closed, [{ id: 'subscriptionDialog', options: undefined }]);
});
test('a touch pull on a title closes once without requiring a touch on the handle', () => {
  const { dialog } = open('foodEntryModal'); const title = $('foodDialogTitle');
  pointer(title, 'pointerdown', 100, 100, 0, { pointerType: 'touch' });
  touch(title, 'touchstart', 100, 0);
  pointer(title, 'pointercancel', 100, 100, 10, { pointerType: 'touch' });
  const move = touch(title, 'touchmove', 270, 400); frame(); touch(title, 'touchend', 270, 500);
  pointer(title, 'pointerup', 100, 270, 500, { pointerType: 'touch' });
  assert.equal(move.defaultPrevented, true);
  assert.deepEqual(closed, [{ id: dialog.id, options: { fromY: 170 } }]);
});
test('content keeps scrolling until the top, then a continuing pull uses only travel beyond that boundary', () => {
  const { dialog } = open('aboutModal'); const content = $('aboutContent'); dialog.scrollTop = 130;
  touch(content, 'touchstart', 100, 0);
  const scrolling = touch(content, 'touchmove', 220, 300); frame();
  assert.equal(scrolling.defaultPrevented, false); assert.equal(dialog.classList.contains('is-dragging'), false);
  dialog.scrollTop = 0; const pulling = touch(content, 'touchmove', 300, 600); frame();
  assert.equal(pulling.defaultPrevented, true); assert.equal(dialog.style.getPropertyValue('--sheet-drag'), '80px');
  touch(content, 'touchmove', 420, 800); frame(); touch(content, 'touchend', 420, 900);
  assert.deepEqual(closed, [{ id: 'aboutModal', options: { fromY: 200 } }]);
});
test('a nested scroller, an upward movement and editable controls keep native touch behaviour', () => {
  const { dialog } = open('aboutModal'); const content = $('aboutContent'); content.scrollTop = 70;
  touch(content, 'touchstart', 100, 0); const nested = touch(content, 'touchmove', 300, 200); touch(content, 'touchend', 300, 300);
  assert.equal(nested.defaultPrevented, false); assert.equal(dialog.classList.contains('is-dragging'), false);
  content.scrollTop = 0; touch(content, 'touchstart', 300, 400); const up = touch(content, 'touchmove', 100, 500); touch(content, 'touchend', 100, 600);
  assert.equal(up.defaultPrevented, false); assert.equal(closed.length, 0);
  open('foodEntryModal');
  touch($('foodName'), 'touchstart', 100, 700); const field = touch($('foodName'), 'touchmove', 320, 800); touch($('foodName'), 'touchend', 320, 900);
  assert.equal(field.defaultPrevented, false); assert.equal(closed.length, 0);
});
test('browser-owned pans, selected text and multitouch cannot accidentally close the window', () => {
  const { dialog } = open('aboutModal'); const content = $('aboutContent');
  touch(content, 'touchstart', 100, 0); touch(content, 'touchmove', 280, 200, { cancelable: false }); touch(content, 'touchend', 280, 300);
  assert.equal(closed.length, 0); assert.equal(dialog.classList.contains('is-dragging'), false);
  window.getSelection = () => ({ isCollapsed: false });
  touch(content, 'touchstart', 100, 400); touch(content, 'touchmove', 280, 500); touch(content, 'touchend', 280, 600);
  assert.equal(closed.length, 0); delete window.getSelection;
  touch(content, 'touchstart', 100, 700); touch(content, 'touchmove', 280, 800); frame();
  touch(content, 'touchstart', 280, 810, { fingers: 2 }); touch(content, 'touchend', 280, 850);
  assert.equal(closed.length, 0); assert.equal(dialog.classList.contains('is-dragging'), false);
});
test('a short content pull returns and does not swallow an independent button click', () => {
  const { dialog } = open('foodEntryModal'); const title = $('foodDialogTitle');
  touch(title, 'touchstart', 100, 0); touch(title, 'touchmove', 150, 300); frame(); touch(title, 'touchend', 150, 400);
  assert.equal(closed.length, 0); assert.equal(dialog.animations.length, 1);
  const button = $('foodForm').querySelector('button'); let clicks = 0; button.addEventListener('click', () => ++clicks);
  const click = new Event('click', { bubbles: true, cancelable: true }); Object.defineProperty(click, 'detail', { value: 1 }); button.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false); assert.equal(clicks, 1);
});
