import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';
import { initActions } from '../js/ui/components.js';
import { initOrientation } from '../js/ui/orientation.js';

function setup(type='landscape-primary') {
  const env=setupDOM(); let locks=0;
  navigator.userAgent='iPhone'; navigator.standalone=true;
  window.screen={width:390,height:844,orientation:Object.assign(new EventTarget(),{type,lock:()=>{++locks;return Promise.reject(new Error('unsupported'));}})};
  window.matchMedia=()=>({matches:true}); window.innerWidth=844; window.innerHeight=390;
  return {env,get locks(){return locks;}};
}

test('unsupported native locking uses a modal phone guard and preserves the open wallet across rotation', async () => {
  const h=setup();
  try {
    initActions(); const wallet=document.getElementById('walletDialog'); wallet.showModal(); wallet.scrollTop=240;
    initOrientation(); await tick(); const guard=document.getElementById('orientationGuard');
    assert.equal(h.locks,1); assert.equal(guard.open,true); assert.equal(wallet.open,true);
    const cancel=new Event('cancel',{cancelable:true}); guard.dispatchEvent(cancel); assert.equal(cancel.defaultPrevented,true);
    guard.click(); assert.equal(guard.open,true);
    window.screen.orientation.type='portrait-primary'; window.dispatchEvent(new Event('orientationchange'));
    assert.equal(guard.open,false); assert.equal(wallet.open,true); assert.equal(wallet.scrollTop,240);
  } finally {h.env.restoreTimers();}
});

test('a portrait phone remains usable when its keyboard makes the window wider than it is tall', async () => {
  const h=setup('portrait-primary');
  try {
    window.innerWidth=390; window.innerHeight=300; initOrientation(); await tick();
    assert.equal(document.getElementById('orientationGuard').open,false);
    window.dispatchEvent(new Event('resize')); assert.equal(document.getElementById('orientationGuard').open,false);
  } finally {h.env.restoreTimers();}
});

test('the guard leaves a desktop browser in landscape usable', () => {
  const h=setup();
  try {
    navigator.userAgent='Desktop'; navigator.standalone=false; window.screen.width=1920; window.screen.height=1080;
    window.matchMedia=()=>({matches:false}); initOrientation();
    assert.equal(document.getElementById('orientationGuard').open,false); assert.equal(h.locks,0);
  } finally {h.env.restoreTimers();}
});
