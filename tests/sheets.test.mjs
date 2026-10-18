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
