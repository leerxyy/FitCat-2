import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { setupDOM } from './dom.mjs';
import { APPEARANCE_KEY,APPEARANCE_DEFAULTS } from '../js/core/appearance.js';

test('a real app reload retains tilt and transparency while permission is blocked, then restores on a foreground return',async()=>{
 const chosen={...APPEARANCE_DEFAULTS,deviceTilt:true,transparency:70};
 const env=setupDOM({[APPEARANCE_KEY]:JSON.stringify(chosen),fitnessProfile:JSON.stringify({name:'Meow',age:20,gender:'male',height:180,weight:80,goal:'maintain'}),lastDate:new Date().toDateString()});
 const old=Object.fromEntries(['matchMedia','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,globalThis[key]]));
 let calls=0,allowed=false,id=0;const frames=new Map();
 globalThis.matchMedia=()=>({matches:false});globalThis.requestAnimationFrame=run=>{frames.set(++id,run);return id;};globalThis.cancelAnimationFrame=key=>frames.delete(key);
 window.DeviceOrientationEvent=class{static requestPermission(){calls++;return allowed?Promise.resolve('granted'):Promise.reject(new Error('NotAllowedError'));}};
 try{
  await import('../js/app.js');const {state}=await import('../js/core/store.js');const {deviceTiltStatus,disableDeviceTilt}=await import('../js/ui/ambient.js');
  await delay(240);assert.equal(calls,1);assert.equal(deviceTiltStatus(),'gesture');assert.equal(state.appearance.deviceTilt,true);assert.deepEqual(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)),chosen);
  assert.equal(document.getElementById('appearanceRecenterTilt'),null);assert.equal(document.documentElement.style['--appearance-glass-filter'],'none');
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));allowed=true;document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));
  await delay(240);assert.equal(calls,2);window.dispatchEvent(Object.assign(new Event('deviceorientation'),{alpha:20,beta:80,gamma:30}));
  assert.equal(deviceTiltStatus(),'active');assert.equal(state.appearance.deviceTilt,true);assert.equal(state.appearance.transparency,70);assert.deepEqual(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)),chosen);
  disableDeviceTilt();
 }finally{Object.assign(globalThis,old);env.restoreTimers();}
});
