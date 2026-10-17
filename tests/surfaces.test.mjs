import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initSurfaces } from '../js/ui/surfaces.js';

function fixture() {
  const env = setupDOM({ keep: 'unchanged' });
  const original = Object.fromEntries(['matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'performance'].map(key => [key, globalThis[key]]));
  const preference = new EventTarget(); preference.matches = false;
  const frames = new Map(); const timers = new Map(); let sequence = 0; let clock = 0;
  globalThis.matchMedia = query => query.includes('prefers-reduced-motion') ? preference : { matches: true };
  globalThis.performance = { now: () => clock };
  globalThis.requestAnimationFrame = run => { const id = ++sequence; frames.set(id, run); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.setTimeout = (run, delay) => { const id = ++sequence; timers.set(id, { run, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const makeCard = (parent = document.body) => {
    const card = document.createElement('section'); card.className = 'card';
    card.getBoundingClientRect = () => ({ left: 20, top: 100, width: 320, height: 300 });
    parent.append(card); return card;
  };
  const card = makeCard(); const text = document.createElement('p'); text.textContent = 'Card'; card.append(text);
  const clean = initSurfaces();
  const fire = (target, type, fields = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 40, clientY: 150, relatedTarget: null, ...fields });
    target.dispatchEvent(event); assert.equal(event.defaultPrevented, false); return event;
  };
  const tap = target => { fire(target, 'pointerdown'); fire(target, 'pointerup'); };
  return { env, card, text, makeCard, fire, tap, frames, timers, preference,
    step() { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(run => run(clock)); },
    flush() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(job => job.run()); },
    time(value) { clock = value; },
    dispose() { clean(); },
    restore() { clean(); Object.assign(globalThis, original); env.restoreTimers(); },
  };
}

test('a confirmed touch tap gives a short visual response without an action or stored-data change', () => {
  const f = fixture();
  try {
    let clicks = 0; f.card.addEventListener('click', () => clicks++);
    f.fire(f.text, 'pointerdown'); assert.equal(f.card.classList.contains('surface-pressed'), false);
    f.fire(f.text, 'pointerup'); assert.equal(f.card.classList.contains('surface-pressed'), true);
    const light = f.card.querySelector('.surface-light'); assert.ok(light); assert.equal(light.getAttribute('aria-hidden'), 'true');
    assert.equal(f.card.style.getPropertyValue('--surface-x'), '0.0px'); assert.equal(f.card.style.getPropertyValue('--surface-y'), '50.0px');
    assert.equal(f.card.hasAttribute('role'), false); assert.equal(f.card.hasAttribute('tabindex'), false);
    assert.equal(clicks, 0); assert.deepEqual([...f.env.map], [['keep', 'unchanged']]);
    f.tap(f.text); assert.equal(f.card.querySelectorAll('.surface-light').length, 1);
    f.flush(); assert.equal(f.card.classList.contains('surface-pressed'), false); assert.equal(f.card.style.getPropertyValue('--surface-light'), '0');
  } finally { f.restore(); }
});

test('scroll, drag, cancellation, a second finger and long holds never leave a pressed card', () => {
  const f = fixture();
  try {
    f.fire(f.text, 'pointerdown'); f.fire(f.text, 'pointermove', { clientY: 180 }); f.fire(f.text, 'pointerup', { clientY: 180 });
    assert.equal(f.card.classList.contains('surface-pressed'), false); assert.equal(f.card.querySelector('.surface-light'), null);
    f.fire(f.text, 'pointerdown', { pointerType: 'mouse' }); assert.equal(f.card.classList.contains('surface-pressed'), true);
    f.fire(f.text, 'pointercancel'); assert.equal(f.card.classList.contains('surface-pressed'), false);
    f.tap(f.text); document.dispatchEvent(new Event('scroll')); assert.equal(f.card.style.getPropertyValue('--surface-light'), '0'); assert.equal(f.timers.size, 0);
    f.fire(f.text, 'pointerdown'); f.fire(f.text, 'pointerdown', { pointerId: 2, isPrimary: false }); f.fire(f.text, 'pointerup');
    assert.equal(f.card.classList.contains('surface-pressed'), false);
    f.fire(f.text, 'pointerdown'); f.time(900); f.fire(f.text, 'pointerup'); assert.equal(f.card.classList.contains('surface-pressed'), false);
  } finally { f.restore(); }
});

test('buttons, editable controls and labels retain their own click and input behaviour', () => {
  const f = fixture();
  try {
    let clicks = 0;
    for (const tag of ['button', 'input', 'select', 'textarea', 'label', 'summary', 'a']) {
      const control = document.createElement(tag); f.card.append(control);
      if (tag === 'button') control.addEventListener('click', () => clicks++);
      f.tap(control); assert.equal(f.card.classList.contains('surface-pressed'), false);
      if (tag === 'button') control.click();
    }
    assert.equal(clicks, 1); assert.equal(f.card.querySelector('.surface-light'), null);
  } finally { f.restore(); }
});

test('delegation finds new nested cards and ignores hidden or modal-blocked content', () => {
  const f = fixture();
  try {
    const child = f.makeCard(f.card); f.tap(child);
    assert.equal(child.classList.contains('surface-pressed'), true); assert.equal(f.card.classList.contains('surface-feedback'), false);
    document.dispatchEvent(new Event('fitcat:tab')); assert.equal(child.classList.contains('surface-pressed'), false);
    child.hidden = true; f.tap(child); assert.equal(child.classList.contains('surface-pressed'), false); child.hidden = false;
    const modal = document.getElementById('smartWaterModal'); modal.showModal(); f.tap(f.card);
    assert.equal(f.card.classList.contains('surface-pressed'), false);
    const inner = f.makeCard(modal); f.tap(inner); assert.equal(inner.classList.contains('surface-pressed'), true);
    modal.close(); document.dispatchEvent(new Event('fitcat:dialogclose')); assert.equal(inner.classList.contains('surface-pressed'), false);
  } finally { f.restore(); }
});

test('mouse edge light updates at most once per frame and fades on leaving the surface', () => {
  const f = fixture();
  try {
    f.fire(f.text, 'pointermove', { pointerType: 'mouse' });
    f.fire(f.text, 'pointermove', { pointerType: 'mouse', clientX: 335, clientY: 270 });
    assert.equal(f.frames.size, 1); f.step();
    assert.equal(f.card.style.getPropertyValue('--surface-x'), '320.0px'); assert.equal(f.card.style.getPropertyValue('--surface-y'), '170.0px');
    assert.equal(f.frames.size, 0); assert.equal(f.card.classList.contains('surface-pressed'), false);
    f.fire(f.text, 'pointerout', { pointerType: 'mouse', relatedTarget: f.card }); assert.equal(f.card.style.getPropertyValue('--surface-light'), '0.52');
    f.fire(f.text, 'pointerout', { pointerType: 'mouse', relatedTarget: document.body }); assert.equal(f.card.style.getPropertyValue('--surface-light'), '0');
  } finally { f.restore(); }
});

test('reduced motion, hidden pages and disposal stop all feedback and pending work', () => {
  const f = fixture();
  try {
    f.preference.matches = true; f.tap(f.text); assert.equal(f.card.querySelector('.surface-light'), null); assert.equal(f.timers.size, 0);
    f.preference.matches = false; f.tap(f.text); assert.equal(f.card.classList.contains('surface-pressed'), true);
    f.preference.matches = true; f.preference.dispatchEvent(new Event('change')); assert.equal(f.card.classList.contains('surface-pressed'), false); assert.equal(f.timers.size, 0);
    f.preference.matches = false; f.tap(f.text); document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(f.card.style.getPropertyValue('--surface-light'), '0'); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
    document.hidden = false; f.dispose(); f.tap(f.text); assert.equal(f.card.classList.contains('surface-pressed'), false);
  } finally { f.restore(); }
});
