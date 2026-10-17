import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tweenValue, animateProgress, finishValueMotion, switchViews, exitDialog, cancelDialogExit, revealRegion } from '../js/ui/motion.js';
import { initAmbient } from '../js/ui/ambient.js';

let clock, frames, sequence, reduce, originals;
const tick = () => new Promise(resolve => setImmediate(resolve));
function step(time) { clock = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(clock)); }
function element() {
  const classes = new Set(); const attributes = new Map();
  const node = {
    hidden: false, inert: false, dataset: {}, animations: [],
    style: { setProperty(key, value) { this[key] = String(value); } },
    classList: { contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key), toggle(key, value) { const on = value ?? !classes.has(key); if (on) classes.add(key); else classes.delete(key); } },
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key),
    getAttribute: key => attributes.get(key),
    animate(keyframes, options) {
      let resolve, reject;
      const animation = { keyframes, options, cancelled: false, finished: new Promise((yes, no) => { resolve = yes; reject = no; }), finish() { resolve(); }, cancel() { this.cancelled = true; reject(new DOMException('Cancelled', 'AbortError')); } };
      this.animations.push(animation); return animation;
    },
  };
  return node;
}
beforeEach(() => {
  originals = Object.fromEntries(['matchMedia', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'document', 'window'].map(key => [key, globalThis[key]]));
  clock = 0; frames = new Map(); sequence = 0; reduce = false;
  globalThis.performance = { now: () => clock };
  globalThis.matchMedia = () => ({ matches: reduce });
  globalThis.requestAnimationFrame = callback => { const id = ++sequence; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
});
afterEach(() => {
  finishValueMotion();
  for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
});

test('values interpolate and retarget from the value currently on screen', () => {
  const node = element(); let value;
  tweenValue(node, 100, current => { value = current; }, { initial: 0 });
  assert.equal(value, 0); step(380); assert.ok(value > 0 && value < 100);
  const halfway = value; tweenValue(node, 200, current => { value = current; }); assert.equal(value, halfway);
  assert.equal(frames.size, 1); step(760); assert.ok(value > halfway && value < 200);
  step(1140); assert.equal(value, 200); assert.equal(frames.size, 0);
});
test('unrelated renders do not restart a number or progress animation', () => {
  const node = element(); let value; tweenValue(node, 80, current => { value = current; }, { initial: 0 });
  step(200); const current = value; const frame = [...frames.keys()][0];
  tweenValue(node, 80, current => { value = current; }); assert.equal(value, current); assert.equal([...frames.keys()][0], frame);
  step(760); assert.equal(value, 80);
});
test('ring and bar progress share a smooth update and stop at valid limits', () => {
  const ring = element(); const bar = element(); animateProgress(ring, .5, 'ring'); animateProgress(bar, .5);
  assert.equal(ring.style.strokeDashoffset, '100'); step(380);
  assert.ok(Number(ring.style.strokeDashoffset) < 100 && Number(ring.style.strokeDashoffset) > 50);
  assert.ok(Number(bar.style['--fraction']) > 0 && Number(bar.style['--fraction']) < .5);
  finishValueMotion(); assert.equal(ring.style.strokeDashoffset, '50'); assert.equal(bar.style['--fraction'], '0.5');
  reduce = true; animateProgress(ring, 5, 'ring'); animateProgress(bar, -1);
  assert.equal(ring.style.strokeDashoffset, '0'); assert.equal(bar.style['--fraction'], '0'); assert.equal(frames.size, 0);
});
test('reduced motion applies the final values without an animation loop', () => {
  reduce = true; const node = element(); let value;
  tweenValue(node, 1250, current => { value = current; }, { initial: 0 }); assert.equal(value, 1250); assert.equal(frames.size, 0);
  const region = element(); region.hidden = true; revealRegion(region, true); assert.equal(region.hidden, false);
  revealRegion(region, false); assert.equal(region.hidden, true); assert.equal(region.animations.length, 0);
});
test('rapid tab changes settle on the final selected page and keep outgoing pages inert', async () => {
  const views = [element(), element(), element()]; views[0].classList.add('active'); views[1].hidden = true; views[2].hidden = true;
  switchViews(views, 1); assert.equal(views[0].inert, true); assert.equal(views[1].inert, false);
  switchViews(views, 2); switchViews(views, 0, -1);
  for (const view of views) for (const animation of view.animations) animation.finish(); await tick();
  assert.deepEqual(views.map(view => view.hidden), [false, true, true]);
  assert.deepEqual(views.map(view => view.classList.contains('active')), [true, false, false]);
  assert.equal(views[0].getAttribute('aria-hidden'), undefined); assert.equal(views[1].getAttribute('aria-hidden'), 'true');
});
test('reopening a closing dialog cancels the stale close operation', async () => {
  const dialog = element(); let closed = 0;
  exitDialog(dialog, () => ++closed); assert.equal(dialog.classList.contains('is-closing'), true);
  cancelDialogExit(dialog); dialog.animations[0].finish(); await tick(); assert.equal(closed, 0);
  assert.equal(dialog.classList.contains('is-closing'), false);
  exitDialog(dialog, () => ++closed); dialog.animations.at(-1).finish(); await tick(); assert.equal(closed, 1);
});
test('scroll parallax stays bounded and pauses while the page is hidden', () => {
  const layer = element(); const root = element(); const preference = new EventTarget(); Object.defineProperty(preference, 'matches', { get: () => reduce });
  globalThis.matchMedia = query => query.includes('prefers-reduced-motion') ? preference : { matches: true };
  const scroller = new EventTarget(); scroller.scrollTop = 0;
  const document = new EventTarget(); Object.assign(document, { hidden: false, documentElement: root, getElementById: id => id === 'ambientLight' ? layer : id === 'appScroller' ? scroller : null });
  const window = new EventTarget(); Object.assign(window, { scrollY: 0, innerWidth: 1000, innerHeight: 800 });
  Object.assign(globalThis, { document, window }); initAmbient(); step(16);
  scroller.scrollTop = 2000; scroller.dispatchEvent(new Event('scroll')); assert.equal(window.scrollY, 0);
  for (let time = 32; time <= 2000; time += 16) step(time);
  const y = parseFloat(layer.style['--parallax-y']); assert.ok(y < -30 && y > -43);
  assert.equal(frames.size, 0);
  window.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'mouse', clientX: 1000, clientY: 0 })); step(2016);
  assert.ok(parseFloat(layer.style['--parallax-x']) > 0);
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 0); assert.equal(root.classList.contains('motion-paused'), true);
  reduce = true; document.hidden = false; preference.dispatchEvent(new Event('change'));
  assert.equal(layer.style['--parallax-x'], '0px'); assert.equal(layer.style['--parallax-y'], '0px'); assert.equal(frames.size, 0);
});
