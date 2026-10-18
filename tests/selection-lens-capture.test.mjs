import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initSelectionLens } from '../js/ui/selection-lens.js';

// Model the browser's implicit capture on the touched button/label, including
// deferred, bubbling capture-transfer events. This is event QA, not a browser.
function capturedTrack(id) {
  const env = setupDOM(); window.PointerEvent = class {};
  const track = document.getElementById(id), buttons = track.querySelectorAll('button');
  for (let node = track; node; node = node.parentElement) { node.hidden = false; node.removeAttribute('inert'); }
  document.body.dataset.screen = 'mainPage';
  const width = buttons.length * 90, left = 20, top = 300;
  track.getBoundingClientRect = () => ({ left, top, width, height: 60 });
  track.offsetWidth = width; track.offsetHeight = 60;
  buttons.forEach((button, index) => Object.assign(button, { offsetLeft: index * 90, offsetTop: 0, offsetWidth: 90, offsetHeight: 60 }));
  let chosen = 0, capture = null, pending = null; const commits = [];
  const captureEvent = (target, type) => {
    const event = new Event(type, { bubbles: true }); Object.defineProperty(event, 'pointerId', { value: 1 }); target.dispatchEvent(event);
  };
  const flushCapture = () => {
    const previous = capture;
    if (previous !== pending && previous) captureEvent(previous, 'lostpointercapture');
    if (pending !== previous && pending) captureEvent(pending, 'gotpointercapture');
    capture = pending;
  };
  track.setPointerCapture = () => { pending = track; };
  track.hasPointerCapture = () => pending === track;
  track.releasePointerCapture = () => { if (pending === track) pending = null; };
  const controller = initSelectionLens(track, { getIndex: () => chosen, onSelect: index => { chosen = index; commits.push(index); } });
  const pointer = (type, index, { cancelable = true, target } = {}) => {
    if (type !== 'pointerdown') flushCapture();
    target ||= capture || track;
    if (type === 'pointerdown') { capture = target; pending = target; }
    const event = new Event(type, { bubbles: true, cancelable });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: left + 45 + index * 90, clientY: top + 30 })) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
    if (type === 'pointerup' || type === 'pointercancel') { pending = null; flushCapture(); }
    return event;
  };
  return { track, buttons, controller, commits, pointer, captureEvent, lose() { pending = null; flushCapture(); },
    get chosen() { return chosen; }, close() { controller.dispose(); env.restoreTimers(); } };
}

for (const id of ['bottomNav', 'profileGenderControl', 'profileGoalControl', 'settingsLanguageControl', 'statisticsSwitch']) {
  test(`a swipe starting on a real ${id} button survives the implicit-to-explicit capture transfer`, () => {
    const h = capturedTrack(id);
    try {
      const button = h.buttons[0], label = button.querySelector('span') || button;
      h.pointer('pointerdown', 0, { target: label });
      h.pointer('pointermove', .55); // Requests capture on the track.
      h.pointer('pointermove', .85); // Browser first bubbles lostcapture from label.
      assert.equal(h.track.classList.contains('is-scrubbing'), true);
      assert.ok(Number(h.track.style['--lens-index']) > .8);
      assert.deepEqual(h.commits, []);
      h.pointer('pointerup', 1); assert.deepEqual(h.commits, [1]); assert.equal(h.chosen, 1);
      assert.equal(h.track.classList.contains('is-lens-held'), false);
    } finally { h.close(); }
  });
}

test('non-cancelable pointermove still previews and completes a swipe instead of resetting it', () => {
  const h = capturedTrack('bottomNav');
  try {
    h.pointer('pointerdown', 0, { target: h.buttons[0] });
    const first = h.pointer('pointermove', .4, { cancelable: false });
    assert.equal(first.defaultPrevented, false); assert.equal(h.track.classList.contains('is-scrubbing'), true);
    h.pointer('pointermove', 1.8, { cancelable: false });
    assert.equal(h.track.classList.contains('is-scrubbing'), true); assert.equal(h.chosen, 0);
    h.pointer('pointerup', 2, { cancelable: false }); assert.deepEqual(h.commits, [2]);
  } finally { h.close(); }
});

test('actual loss of the track capture still cancels without selecting the preview', () => {
  const h = capturedTrack('bottomNav');
  try {
    h.pointer('pointerdown', 0, { target: h.buttons[0] }); h.pointer('pointermove', .5); h.pointer('pointermove', 1.5);
    h.lose(); h.pointer('pointerup', 2);
    assert.deepEqual(h.commits, []); assert.equal(h.track.classList.contains('is-scrubbing'), false);
    assert.equal(h.track.style['--lens-index'], '0');
  } finally { h.close(); }
});
