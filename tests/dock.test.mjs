import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initDock } from '../js/ui/dock.js';

test('the dock stays outside the scrolling views and is hidden until the keyboard closes', () => {
  const env = setupDOM(); const originalRAF = requestAnimationFrame; const originalCancel = cancelAnimationFrame;
  let callback; globalThis.requestAnimationFrame = value => { callback = value; return 1; }; globalThis.cancelAnimationFrame = () => { callback = null; };
  const flush = () => { const run = callback; callback = null; run?.(); };
  const viewport = new EventTarget(); Object.assign(viewport, { height: 800, width: 390, scale: 1 });
  Object.assign(window, { innerHeight: 800, innerWidth: 390, visualViewport: viewport });
  try {
    const dock = document.getElementById('navDock'); assert.equal(dock.parentElement, document.body);
    assert.equal(document.getElementById('bottomNav').parentElement, dock); assert.equal(dock.closest('#appScroller'), null);
    initDock(); assert.equal(dock.classList.contains('keyboard-open'), false);
    document.activeElement = document.getElementById('friendUidInput'); document.dispatchEvent(new Event('focusin')); flush();
    viewport.height = 450; viewport.dispatchEvent(new Event('resize')); flush(); assert.equal(dock.classList.contains('keyboard-open'), true);
    document.activeElement = document.body; document.dispatchEvent(new Event('focusout')); flush(); assert.equal(dock.classList.contains('keyboard-open'), true);
    viewport.height = 800; viewport.dispatchEvent(new Event('resize')); flush(); assert.equal(dock.classList.contains('keyboard-open'), false);
    assert.equal(dock.style.bottom, undefined); assert.equal(dock.style.transform, undefined);
  } finally { globalThis.requestAnimationFrame = originalRAF; globalThis.cancelAnimationFrame = originalCancel; env.restoreTimers(); }
});
