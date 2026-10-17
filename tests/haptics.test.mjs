import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { state } from '../js/core/store.js';

let sequence = 0;
async function fixture({ apple = false, nativeSwitch = false } = {}) {
  const env = setupDOM(); let clock = 100;
  const originalPerformance = globalThis.performance; globalThis.performance = { now: () => clock };
  state.preferences.hapticsEnabled = true;
  navigator.userAgent = apple ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' : 'Android';
  if (nativeSwitch) {
    const create = document.createElement.bind(document);
    document.createElement = tag => { const node = create(tag); if (tag === 'input') node.switch = false; return node; };
  }
  const module = await import(`../js/ui/haptics.js?test=${++sequence}`);
  return { ...module, env, advance(ms = 60) { clock += ms; }, restore() { env.restoreTimers(); globalThis.performance = originalPerformance; } };
}

test('supported vibration gets one short click instead of duplicate pulses', async () => {
  const f = await fixture(); const pulses = []; navigator.vibrate = value => { pulses.push(value); return true; };
  try { assert.equal(f.haptic(), true); assert.equal(f.haptic(), true); assert.deepEqual(pulses, [8]); f.advance(); f.haptic(); assert.deepEqual(pulses, [8, 8]); }
  finally { f.restore(); }
});
test('turning haptics off or hiding the page prevents feedback', async () => {
  const f = await fixture(); let pulses = 0; navigator.vibrate = () => { ++pulses; return true; };
  try { state.preferences.hapticsEnabled = false; assert.equal(f.haptic(), false); state.preferences.hapticsEnabled = true; document.hidden = true; assert.equal(f.haptic(), false); assert.equal(pulses, 0); }
  finally { f.restore(); }
});
test('the iPhone bridge is reused and stays in the current modal layer', async () => {
  const f = await fixture({ apple: true, nativeSwitch: true });
  try {
    f.initHaptics(); const bridge = document.querySelector('.haptic-bridge'); assert.ok(bridge);
    let clicks = 0; bridge.click = () => ++clicks;
    assert.equal(f.haptic(), true); assert.equal(clicks, 1); assert.equal(bridge.parentElement, document.body);
    const dialog = document.getElementById('foodEntryModal'); dialog.showModal(); f.advance(); f.haptic();
    assert.equal(bridge.parentElement, dialog); assert.equal(document.querySelectorAll('.haptic-bridge').length, 1);
    dialog.close(); f.advance(); f.haptic(); assert.equal(bridge.parentElement, document.body);
    assert.equal(bridge.closest('button'), null); assert.equal(bridge.getAttribute('aria-hidden'), 'true');
  } finally { f.restore(); }
});
test('unsupported or rejected vibration never throws or creates control overlays', async () => {
  const f = await fixture({ apple: true });
  try { navigator.vibrate = () => { throw new Error('Unavailable'); }; f.initHaptics(); assert.equal(f.haptic(), false); assert.equal(document.querySelector('.haptic-bridge'), null); }
  finally { f.restore(); }
});
test('only genuine enabled control clicks trigger the delegated feedback', async () => {
  const f = await fixture(); let pulses = 0; navigator.vibrate = () => { ++pulses; return true; };
  const handlers = {}; const add = document.addEventListener.bind(document);
  document.addEventListener = (name, handler, options) => { handlers[name] = handler; add(name, handler, options); };
  try {
    f.initHaptics(); const button = document.createElement('button'); document.body.append(button);
    handlers.click({ isTrusted: false, target: button }); assert.equal(pulses, 0);
    handlers.click({ isTrusted: true, target: button }); assert.equal(pulses, 1);
    f.advance(); button.disabled = true; handlers.click({ isTrusted: true, target: button }); assert.equal(pulses, 1);
    handlers.click({ isTrusted: true, target: document.body }); assert.equal(pulses, 1);
    handlers.submit({ isTrusted: true }); assert.equal(pulses, 2);
  } finally { f.restore(); }
});
