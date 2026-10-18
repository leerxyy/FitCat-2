import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initAmbient, requestDeviceTilt, disableDeviceTilt } from '../js/ui/ambient.js';
import { APPEARANCE_DEFAULTS } from '../js/core/appearance.js';
function harness(){
 const env=setupDOM(),old=Object.fromEntries(['requestAnimationFrame','cancelAnimationFrame','matchMedia','performance'].map(key=>[key,globalThis[key]]));
 let time=0,id=0,reduce=false;const frames=new Map(),preference=new EventTarget();Object.defineProperty(preference,'matches',{get:()=>reduce});
 globalThis.performance={now:()=>time};globalThis.requestAnimationFrame=run=>{frames.set(++id,run);return id;};globalThis.cancelAnimationFrame=key=>frames.delete(key);globalThis.matchMedia=query=>query.includes('prefers-reduced-motion')?preference:{matches:true};
 Object.assign(window,{innerWidth:400,innerHeight:800,scrollY:0});
 const step=()=>{for(let i=0;i<40;i++){time+=16;const pending=[...frames.values()];frames.clear();for(const run of pending)run(time);}};
 const sensor=(beta,gamma)=>{const event=new Event('deviceorientation');Object.assign(event,{beta,gamma});window.dispatchEvent(event);};
 return {env,frames,step,sensor,reduce(value){reduce=value;preference.dispatchEvent(new Event('change'));},close(){disableDeviceTilt();Object.assign(globalThis,old);env.restoreTimers();}};
}
test('device tilt is requested only on explicit activation, calibrated and smoothed after consent',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static async requestPermission(){calls++;return 'granted';}};
 try{
  initAmbient();h.step();assert.equal(calls,0);assert.equal(await requestDeviceTilt(),true);assert.equal(calls,1);
  h.sensor(50,0);h.sensor(65,20);h.step();const layer=document.getElementById('ambientLight');assert.ok(parseFloat(layer.style['--parallax-x'])>5);
  const shift=parseFloat(document.documentElement.style['--card-shift-x']);assert.ok(shift<0&&shift>-1.5);
  const preview=document.getElementById('appearancePreview');assert.ok(parseFloat(preview.style['--preview-rotate-y'])>0);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.frames.size,0);h.sensor(90,40);assert.equal(h.frames.size,0);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));h.reduce(true);assert.equal(layer.style['--parallax-x'],'0px');assert.equal(h.frames.size,0);
 }finally{h.close();}
});
test('a denied sensor request leaves scroll parallax usable and never writes a sensor preference',async()=>{
 const h=harness();window.DeviceOrientationEvent=class{static async requestPermission(){return 'denied';}};
 try{initAmbient();assert.equal(await requestDeviceTilt(),false);const scroller=document.getElementById('appScroller');scroller.scrollTop=1200;scroller.dispatchEvent(new Event('scroll'));h.step();assert.ok(parseFloat(document.getElementById('ambientLight').style['--parallax-y'])<0);assert.equal(h.env.localStorage.getItem('deviceorientation'),null);}
 finally{h.close();}
});
test('disabling parallax invalidates an outstanding permission request and returns all layers to zero',async()=>{
 const h=harness();let grant;window.DeviceOrientationEvent=class{static requestPermission(){return new Promise(resolve=>{grant=resolve;});}};
 try{initAmbient();const pending=requestDeviceTilt();document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:{...APPEARANCE_DEFAULTS,parallax:false}}));grant('granted');assert.equal(await pending,false);h.sensor(50,0);h.sensor(70,25);h.step();assert.equal(document.getElementById('ambientLight').style['--parallax-x'],'0px');assert.equal(h.frames.size,0);}
 finally{h.close();}
});
test('depth changes remain bounded, switching parallax off cancels pending frames, and reduced motion wins',()=>{
 const h=harness();try{
  initAmbient({...APPEARANCE_DEFAULTS,depth:100});window.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'mouse',clientX:100000,clientY:-100000}));h.step();const layer=document.getElementById('ambientLight');assert.ok(Math.abs(parseFloat(layer.style['--parallax-x']))<=45);assert.ok(Math.abs(parseFloat(layer.style['--parallax-y']))<=80);
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:{...APPEARANCE_DEFAULTS,parallax:false}}));assert.equal(layer.style['--parallax-x'],'0px');assert.equal(h.frames.size,0);
  h.reduce(true);document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:APPEARANCE_DEFAULTS}));window.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'mouse',clientX:400,clientY:0}));assert.equal(h.frames.size,0);assert.equal(layer.style['--parallax-x'],'0px');
 }finally{h.close();}
});
