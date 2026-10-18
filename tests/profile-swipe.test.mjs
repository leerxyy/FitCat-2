import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initProfileSwipe } from '../js/ui/profile-swipe.js';

let env, profile, content, count, dispose;
const touch = (target, type, x, y, { id = 7, fingers = 1, changedId = id, cancelable = true, remaining = 0 } = {}) => {
  const point = { identifier: id, clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable });
  const ended = type === 'touchend' || type === 'touchcancel';
  Object.defineProperties(event, {
    touches: { value: Array.from({ length: ended ? remaining : fingers }, (_, i) => ({ ...point, identifier: id + i })) },
    changedTouches: { value: [{ ...point, identifier: changedId }] },
  });
  target.dispatchEvent(event); return event;
};
const swipe = (target = content, dx = 150, dy = 6) => {
  touch(target, 'touchstart', 45, 200); const move = touch(target, 'touchmove', 45 + dx, 200 + dy);
  const end = touch(target, 'touchend', 45 + dx, 200 + dy); return { move, end };
};
beforeEach(() => {
  env = setupDOM(); profile = document.getElementById('profilePage'); content = document.getElementById('profileDataTitle');
  profile.hidden = false; document.body.dataset.screen = 'profilePage'; count = 0;
  profile.getBoundingClientRect = () => ({ width: 390 });
  dispose = initProfileSwipe(profile, () => { count++; });
});
afterEach(() => { dispose(); env.restoreTimers(); });

test('a horizontal right swipe returns once and consumes the compatibility tap', () => {
  const { move, end } = swipe(); assert.equal(count, 1); assert.equal(move.defaultPrevented, true); assert.equal(end.defaultPrevented, true);
  touch(content, 'touchend', 230, 205); assert.equal(count, 1);
});
test('a short, leftward, vertical or diagonal gesture never navigates', () => {
  for (const [dx, dy] of [[40, 0], [-160, 2], [3, 180], [120, 120]]) { swipe(content, dx, dy); assert.equal(count, 0); }
  touch(content, 'touchstart', 45, 200); touch(content, 'touchmove', 47, 245); touch(content, 'touchend', 240, 247); assert.equal(count, 0);
});
test('inputs, labels, buttons and an active text editor keep their native gesture', () => {
  for (const id of ['profileName', 'profilePhoto', 'profilePhotoEdit', 'profilePhotoDelete', 'profileBackButton']) {
    const result = swipe(document.getElementById(id)); assert.equal(result.move.defaultPrevented, false); assert.equal(count, 0);
  }
  swipe(document.querySelector('label[for="profileAge"]')); assert.equal(count, 0);
  document.getElementById('profileName').focus(); swipe(); assert.equal(count, 0);
  document.getElementById('profileTitle').focus(); swipe(); assert.equal(count, 1);
});
test('text selection before or during a gesture prevents navigation', () => {
  let selected = true; window.getSelection = () => ({ isCollapsed: !selected });
  swipe(); assert.equal(count, 0);
  selected = false; touch(content, 'touchstart', 45, 200); selected = true;
  touch(content, 'touchmove', 200, 206); touch(content, 'touchend', 230, 210); assert.equal(count, 0);
});
test('a second finger, cancellation, mismatched touch or remaining finger cancels the whole gesture', () => {
  touch(content, 'touchstart', 45, 200, { fingers: 2 }); touch(content, 'touchend', 240, 205); assert.equal(count, 0);
  touch(content, 'touchstart', 45, 200); touch(content, 'touchstart', 50, 200, { fingers: 2 }); touch(content, 'touchend', 240, 205); assert.equal(count, 0);
  touch(content, 'touchstart', 45, 200); touch(content, 'touchmove', 200, 206); touch(content, 'touchcancel', 200, 206); touch(content, 'touchend', 240, 206); assert.equal(count, 0);
  touch(content, 'touchstart', 45, 200); touch(content, 'touchend', 240, 205, { changedId: 8 }); assert.equal(count, 0);
  touch(content, 'touchstart', 45, 200); touch(content, 'touchend', 240, 205, { remaining: 1 }); assert.equal(count, 0);
  swipe(); assert.equal(count, 1);
});
test('an open or newly opened dialog owns the gesture', () => {
  const dialog = document.getElementById('confirmDialog'); dialog.showModal(); swipe(); assert.equal(count, 0); dialog.close();
  touch(content, 'touchstart', 45, 200); touch(content, 'touchmove', 180, 205); dialog.showModal();
  document.dispatchEvent(new CustomEvent('fitcat:dialogopen', { detail: { id: dialog.id } })); dialog.close();
  touch(content, 'touchend', 240, 205); assert.equal(count, 0);
});
test('a screen or viewport change, backgrounding or pagehide invalidates a pending gesture', () => {
  for (const event of ['fitcat:screen', 'fitcat:viewport', 'visibilitychange']) {
    touch(content, 'touchstart', 45, 200); touch(content, 'touchmove', 180, 205); document.dispatchEvent(new Event(event));
    touch(content, 'touchend', 240, 205); assert.equal(count, 0);
  }
  touch(content, 'touchstart', 45, 200); window.dispatchEvent(new Event('pagehide')); touch(content, 'touchend', 240, 205); assert.equal(count, 0);
  profile.hidden = true; swipe(); assert.equal(count, 0); profile.hidden = false;
  document.body.dataset.screen = 'mainPage'; swipe(); assert.equal(count, 0);
});
test('a browser-owned pan cannot turn into a profile exit', () => {
  touch(content, 'touchstart', 45, 200); touch(content, 'touchmove', 200, 205, { cancelable: false });
  touch(content, 'touchend', 240, 205); assert.equal(count, 0);
});
test('initialization is idempotent and disposal removes every gesture listener', () => {
  const again = initProfileSwipe(profile, () => { count += 100; }); assert.equal(again, dispose);
  swipe(); assert.equal(count, 1); dispose(); swipe(); assert.equal(count, 1);
  dispose = initProfileSwipe(profile, () => { count += 10; }); swipe(); assert.equal(count, 11);
});
