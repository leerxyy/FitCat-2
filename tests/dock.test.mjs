import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initDock } from '../js/ui/dock.js';

function harness({ visualViewport = true, configure } = {}) {
  const env = setupDOM();
  const originals = { requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout };
  let frame; let id = 0; const timers = new Map(); const scrolls = [];
  globalThis.requestAnimationFrame = callback => { frame = callback; return ++id; };
  globalThis.cancelAnimationFrame = () => { frame = null; };
  globalThis.setTimeout = (callback, delay) => { const key = ++id; timers.set(key,{callback,delay}); return key; };
  globalThis.clearTimeout = key => timers.delete(key);
  const viewport = new EventTarget(); Object.assign(viewport, { height: 800, width: 390, scale: 1, offsetTop: 0 });
  Object.assign(window, { innerHeight: 800, innerWidth: 390, scrollX: 0, scrollY: 0, ...(visualViewport ? { visualViewport: viewport } : {}) });
  window.scrollTo = (x,y) => { scrolls.push([x,y]); window.scrollX = x; window.scrollY = y; };
  const root = document.documentElement; document.scrollingElement = root;
  const flush = () => { const run = frame; frame = null; run?.(); };
  const event = (target, name) => { target.dispatchEvent(new Event(name)); flush(); };
  const settle = () => {
    for (const [key,timer] of [...timers]) { if (timers.delete(key)) { timer.callback(); flush(); } }
  };
  const focus = element => { document.activeElement = element; event(document, 'focusin'); };
  const close = () => { event(window,'pagehide'); Object.assign(globalThis, originals); env.restoreTimers(); };
  configure?.({root,viewport});
  const ready=initDock();
  return { ready, env, viewport, root, dock: document.getElementById('navDock'), flush, event, settle, focus, scrolls, close };
}

test('dock stays outside the scrolling views and hides through keyboard dismissal', () => {
  const h = harness();
  try {
    assert.equal(h.dock.parentElement, document.body); assert.equal(document.getElementById('bottomNav').parentElement,h.dock);
    assert.equal(h.dock.closest('#appScroller'),null);
    assert.equal(h.root.style.getPropertyValue('--app-height'),'800px');
    h.focus(document.getElementById('friendUidInput'));
    h.viewport.height=450; h.viewport.offsetTop=180; h.event(h.viewport,'resize');
    assert.equal(h.dock.classList.contains('keyboard-open'),true);
    assert.equal(h.root.style.getPropertyValue('--app-height'),'800px');
    assert.equal(h.root.style.getPropertyValue('--visible-height'),'450px');
    assert.equal(h.root.style.getPropertyValue('--visible-top'),'180px');
    document.activeElement=document.body; h.event(document,'focusout');
    assert.equal(h.dock.classList.contains('keyboard-open'),true);
    h.viewport.height=800; h.viewport.offsetTop=0; h.event(h.viewport,'resize');
    assert.equal(h.dock.classList.contains('keyboard-open'),false);
    assert.equal(h.root.style.getPropertyValue('--visible-height'),'800px');
  } finally { h.close(); }
});

test('stale viewport metrics after focusing a sheet heading cannot lift the dock or shorten the shell', () => {
  const h = harness();
  try {
    const app=document.getElementById('appScroller'); const sheet=document.getElementById('walletDialog');
    app.scrollTop=320; sheet.scrollTop=210;
    h.focus(document.getElementById('walletPromoCode'));
    h.viewport.height=450; h.viewport.offsetTop=180; h.event(h.viewport,'resize');
    window.scrollY=58; h.root.scrollTop=58; h.root.scrollLeft=12;
    document.activeElement=document.body; h.event(document,'focusout');
    h.focus(document.getElementById('walletTitle')); // Native dialog/panel focus follows focusout.
    h.event(document,'fitcat:dialogclose'); h.settle();
    assert.equal(h.dock.classList.contains('keyboard-open'),false);
    assert.equal(h.root.style.getPropertyValue('--app-height'),'800px');
    assert.equal(h.root.style.getPropertyValue('--visible-height'),'800px');
    assert.equal(h.root.style.getPropertyValue('--visible-top'),'0px');
    assert.deepEqual(h.scrolls,[[0,0]]); assert.equal(h.root.scrollTop,0); assert.equal(h.root.scrollLeft,0);
    assert.equal(app.scrollTop,320); assert.equal(sheet.scrollTop,210);
    assert.equal(h.dock.style.bottom,undefined); assert.equal(h.dock.style.transform,undefined);
    h.event(h.viewport,'scroll'); assert.equal(h.dock.classList.contains('keyboard-open'),false);
  } finally { h.close(); }
});

test('rotation and genuine window resizing update the shell after restoration', () => {
  const h = harness();
  try {
    h.event(window,'pageshow'); h.settle();
    window.innerHeight=640; h.viewport.height=640; h.event(window,'resize');
    assert.equal(h.root.style.getPropertyValue('--app-height'),'640px');
    window.innerWidth=844; window.innerHeight=390; h.viewport.width=844; h.viewport.height=390;
    h.event(window,'orientationchange'); h.settle();
    assert.equal(h.root.style.getPropertyValue('--app-height'),'390px');
    assert.equal(h.dock.classList.contains('keyboard-open'),false);
  } finally { h.close(); }
});

test('a browser without VisualViewport still sizes the shell and restores root pan', () => {
  const h = harness({visualViewport:false});
  try {
    assert.equal(h.root.style.getPropertyValue('--app-height'),'800px');
    window.scrollY=40; h.event(window,'scroll'); assert.deepEqual(h.scrolls,[[0,0]]);
    h.focus(document.getElementById('friendUidInput')); window.innerHeight=450; h.event(window,'resize');
    assert.equal(h.dock.classList.contains('keyboard-open'),true);
    window.innerHeight=800; h.event(window,'resize');
    assert.equal(h.dock.classList.contains('keyboard-open'),false);
  } finally { h.close(); }
});

test('pinch zoom keeps its own viewport and is never forced back to the origin', () => {
  const h = harness();
  try {
    window.scrollY=100; h.viewport.scale=2; h.viewport.height=400; h.viewport.offsetTop=100;
    h.event(h.viewport,'resize'); h.event(h.viewport,'scroll');
    assert.deepEqual(h.scrolls,[]); assert.equal(h.root.style.getPropertyValue('--app-height'),'800px');
  } finally { h.close(); }
});


test('a cold iPhone launch immediately covers the physical screen without requiring rotation', async () => {
  const h=harness({configure({root,viewport}) {
    navigator.userAgent='iPhone'; navigator.standalone=true;
    window.screen={width:390,height:844}; window.innerHeight=742;
    viewport.height=742; root.clientHeight=742;
    document.getElementById('viewportProbe').getBoundingClientRect=()=>({height:742});
  }});
  try {
    assert.equal(h.root.style.getPropertyValue('--app-height'),'844px');
    assert.equal(h.root.style.getPropertyValue('--visible-height'),'844px');
    h.settle(); h.settle(); await h.ready;
    assert.equal(h.dock.classList.contains('keyboard-open'),false);
    assert.equal(h.root.style.getPropertyValue('--app-height'),'844px');
  } finally {h.close();}
});

test('late CSS viewport changes are observed even when WebKit sends no window resize', () => {
  const original=globalThis.ResizeObserver; let notify; let measured=742;
  globalThis.ResizeObserver=class {constructor(callback){notify=callback;} observe(){} disconnect(){}};
  const h=harness({configure() {document.getElementById('viewportProbe').getBoundingClientRect=()=>({height:measured});}});
  try {
    assert.equal(h.root.style.getPropertyValue('--app-height'),'742px');
    measured=844; notify(); h.flush();
    assert.equal(h.root.style.getPropertyValue('--app-height'),'844px');
  } finally {h.close(); if(original)globalThis.ResizeObserver=original;else delete globalThis.ResizeObserver;}
});
