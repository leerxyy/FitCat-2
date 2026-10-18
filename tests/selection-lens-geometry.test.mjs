import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initSelectionLens } from '../js/ui/selection-lens.js';

test('the shared lens interpolates unequal real buttons and gaps even inside a scaled card', () => {
  const env = setupDOM(); window.PointerEvent = class {};
  const track = document.createElement('div'); document.body.append(track);
  track.offsetWidth = 400; track.offsetHeight = 80;
  track.getBoundingClientRect = () => ({ left: 10, top: 200, width: 200, height: 40 });
  for (const [left, width] of [[0, 100], [110, 180], [300, 100]]) {
    const button = document.createElement('button');
    Object.assign(button, { offsetLeft: left, offsetTop: 2, offsetWidth: width, offsetHeight: 76 }); track.append(button);
  }
  let chosen = 0, commits = 0;
  const controller = initSelectionLens(track, { getIndex: () => chosen, onSelect: value => { chosen = value; commits++; } });
  const pointer = (type, x) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 220 })) Object.defineProperty(event, key, { value });
    (type === 'pointerdown' ? track : document).dispatchEvent(event);
  };
  try {
    pointer('pointerdown', 35); pointer('pointermove', 72.5);
    assert.equal(track.style['--lens-index'], '0.5'); assert.equal(track.style['--lens-x'], '55px'); assert.equal(track.style['--lens-width'], '140px');
    assert.equal(chosen, 0); assert.equal(commits, 0);
    pointer('pointermove', 110); assert.equal(track.style['--lens-index'], '1'); assert.equal(track.style['--lens-width'], '180px');
    pointer('pointerup', 110); assert.equal(chosen, 1); assert.equal(commits, 1);
    pointer('pointerdown', 110); pointer('pointermove', 185); window.dispatchEvent(new Event('resize')); pointer('pointerup', 185);
    assert.equal(chosen, 1); assert.equal(commits, 1); assert.equal(track.style['--lens-index'], '1');
  } finally { controller.dispose(); env.restoreTimers(); }
});
