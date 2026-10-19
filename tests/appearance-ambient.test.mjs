import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM } from './dom.mjs';
import { initAmbient,requestDeviceTilt,disableDeviceTilt,deviceTiltStatus,subscribeAmbientMotion } from '../js/ui/ambient.js';
import { APPEARANCE_DEFAULTS } from '../js/core/appearance.js';
import { applyPerformanceMode } from '../js/ui/performance.js';

function harness(){
 const env=setupDOM(),old=Object.fromEntries(['requestAnimationFrame','cancelAnimationFrame','matchMedia','performance','setTimeout','clearTimeout'].map(key=>[key,globalThis[key]]));
 let time=0,id=0,reduce=false;const frames=new Map(),timers=new Map(),gestures={};
 const preference=new EventTarget();Object.defineProperty(preference,'matches',{get:()=>reduce});
 globalThis.performance={now:()=>time};globalThis.requestAnimationFrame=run=>{frames.set(++id,run);return id;};globalThis.cancelAnimationFrame=key=>frames.delete(key);
 globalThis.setTimeout=(run,delay,...args)=>{timers.set(++id,{time:time+delay,run,args});return id;};globalThis.clearTimeout=key=>timers.delete(key);
 globalThis.matchMedia=query=>query.includes('prefers-reduced-motion')?preference:{matches:true};
 const add=document.addEventListener.bind(document);document.addEventListener=(type,handler,options)=>{if(['pointerup','click','keydown'].includes(type))gestures[type]=handler;return add(type,handler,options);};
 Object.assign(window,{innerWidth:400,innerHeight:800,scrollY:0});
 const step=(count=120,interval=1000/60)=>{for(let i=0;i<count;i++){
  time+=interval;for(const [key,timer]of [...timers])if(timer.time<=time){timers.delete(key);timer.run(...timer.args);}
  const pending=[...frames.values()];frames.clear();for(const run of pending)run(time);
 }};
 const sensor=(beta,gamma,alpha=0)=>window.dispatchEvent(Object.assign(new Event('deviceorientation'),{alpha,beta,gamma}));
 return {env,frames,step,sensor,async flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();},
  tap(target=document.getElementById('todayPage'),type='pointerup',extra={}){gestures[type]?.({type,target,isTrusted:true,button:0,key:'Enter',...extra});},
  reduce(value){reduce=value;preference.dispatchEvent(new Event('change'));},
  close(){disableDeviceTilt();Object.assign(globalThis,old);env.restoreTimers();}};
}
const reading=()=>({x:parseFloat(document.getElementById('ambientLight').style['--parallax-x']),y:parseFloat(document.getElementById('ambientLight').style['--parallax-y'])});
const saved={...APPEARANCE_DEFAULTS,deviceTilt:true};

test('LDM cancels live background frames and sensor delivery, then restores the saved tilt intent',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{
  initAmbient(saved);await h.flush();h.sensor(89,5);h.sensor(89,35);assert.ok(h.frames.size>0);
  applyPerformanceMode(true);assert.equal(h.frames.size,0);assert.deepEqual(reading(),{x:0,y:0});
  h.sensor(89,-35);h.step();assert.deepEqual(reading(),{x:0,y:0});assert.equal(h.frames.size,0);
  const before=calls;h.tap();await h.flush();assert.equal(calls,before);
  applyPerformanceMode(false);await h.flush();h.sensor(89,5);h.sensor(89,30);h.step();assert.ok(reading().x>0);
 }finally{h.close();}
});
test('launching directly in LDM starts neither a sensor request nor an ambient animation loop',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{applyPerformanceMode(true);initAmbient(saved);h.step();h.tap();await h.flush();assert.equal(calls,0);assert.equal(h.frames.size,0);}finally{h.close();}
});

test('opted-out users never trigger a sensor permission request from launch or ordinary taps',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{initAmbient();h.step();h.tap();await h.flush();assert.equal(calls,0);assert.notEqual(deviceTiltStatus(),'active');}finally{h.close();}
});
test('explicit first enable requests access in the gesture and silently centers the first real reading',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{
  initAmbient();assert.equal(calls,0);assert.equal(await requestDeviceTilt(),true);assert.equal(calls,1);
  h.sensor(89,15,230);h.step();assert.deepEqual(reading(),{x:0,y:0});assert.equal(deviceTiltStatus(),'active');
  h.sensor(89,30,230);h.step();assert.ok(reading().x>5);
  assert.equal(document.documentElement.style['--parallax-x'],undefined);assert.equal(document.documentElement.style['--card-shift-x'],undefined);
 }finally{h.close();}
});
test('a saved grant is restored through the permission API without a repeated settings action',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{
  initAmbient(saved);assert.equal(deviceTiltStatus(),'waiting');h.step(12);await h.flush();assert.equal(calls,1);
  h.sensor(50,10);h.sensor(50,25);h.step();assert.equal(deviceTiltStatus(),'active');assert.ok(reading().x>5);h.tap();await h.flush();assert.equal(calls,1);
 }finally{h.close();}
});
for(const withReading of [false,true])test(`saving a successful tilt opt-in adopts its connection ${withReading?'after':'before'} sensor data`,async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{
  initAmbient();assert.equal(await requestDeviceTilt(),true);assert.equal(calls,1);
  if(withReading){h.sensor(45,0);h.sensor(45,20);h.step(8);assert.ok(reading().x>1);}
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:saved}));h.step(18);await h.flush();
  assert.equal(calls,1,'persisting the flag must not start a second permission probe');
  if(withReading)assert.ok(reading().x>5,'saving must preserve the neutral pose and movement');
  else{h.sensor(60,15);h.step();assert.deepEqual(reading(),{x:0,y:0});}
 }finally{h.close();}
});
test('an already-live saved listener needs no redundant permission request',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{initAmbient(saved);h.sensor(45,0);h.step();await h.flush();assert.equal(calls,0);assert.equal(deviceTiltStatus(),'active');}finally{h.close();}
});
test('a no-gesture rejection preserves the opt-in and reconnects on one ordinary trusted tap',async()=>{
 const h=harness();let calls=0,gesture=false;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return gesture?Promise.resolve('granted'):Promise.reject(new Error('NotAllowedError'));}};
 try{
  const before=new Map(h.env.map);initAmbient(saved);h.step(12);await h.flush();assert.equal(deviceTiltStatus(),'gesture');assert.equal(calls,1);
  h.step(240);assert.equal(deviceTiltStatus(),'gesture','the sensor watchdog cannot replace a blocked permission with stalled');assert.equal(calls,1);
  document.dispatchEvent(new Event('pointerup'));await h.flush();assert.equal(calls,1,'synthetic taps cannot trigger permission');
  gesture=true;h.tap();h.tap();await h.flush();assert.equal(calls,2,'only one gesture retry per foreground session');
  h.sensor(45,0);h.sensor(45,20);h.step();assert.equal(deviceTiltStatus(),'active');assert.ok(reading().x>5);
  assert.deepEqual(h.env.map,before,'orientation and permission results do not overwrite persisted choices');
 }finally{h.close();}
});
test('explicit denial does not repeatedly prompt on taps and leaves scroll parallax available',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('denied');}};
 try{initAmbient(saved);h.step(12);await h.flush();assert.equal(deviceTiltStatus(),'denied');h.tap();h.tap();await h.flush();assert.equal(calls,1);
  const scroller=document.getElementById('appScroller');scroller.scrollTop=1200;scroller.dispatchEvent(new Event('scroll'));h.step();assert.ok(reading().y< -20);
 }finally{h.close();}
});
test('visibility and page-cache resumes center a changed grip and reconnect without manual calibration',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{
  initAmbient(saved);h.sensor(45,0);h.sensor(45,20);h.step();assert.ok(reading().x>5);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.frames.size,0);
  h.sensor(80,-40);assert.equal(h.frames.size,0);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.deepEqual(reading(),{x:0,y:0});
  h.step(12);await h.flush();assert.equal(calls,1);h.sensor(80,-40);h.step();assert.deepEqual(reading(),{x:0,y:0});h.sensor(80,-25);h.step();assert.ok(reading().x>5);
  window.dispatchEvent(new Event('pagehide'));assert.equal(h.frames.size,0);window.dispatchEvent(new Event('pageshow'));assert.deepEqual(reading(),{x:0,y:0});
  h.sensor(20,30);h.step();assert.deepEqual(reading(),{x:0,y:0});assert.equal(deviceTiltStatus(),'active');
 }finally{h.close();}
});
test('late permission after hide or disable is ignored and cannot reactivate the sensor',async()=>{
 const h=harness();let grant;window.DeviceOrientationEvent=class{static requestPermission(){return new Promise(resolve=>{grant=resolve;});}};
 try{
  initAmbient();const request=requestDeviceTilt();document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));grant('granted');assert.equal(await request,false);
  h.sensor(45,0);h.sensor(70,20);assert.equal(h.frames.size,0);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));const second=requestDeviceTilt();disableDeviceTilt();grant('granted');assert.equal(await second,false);assert.deepEqual(reading(),{x:0,y:0});
 }finally{h.close();}
});
test('parallax and zero-depth toggles suspend sensors and restore the saved intent when enabled again',async()=>{
 const h=harness();window.DeviceOrientationEvent=class{static requestPermission(){return Promise.resolve('granted');}};
 try{
  initAmbient(saved);h.sensor(45,0);h.sensor(45,20);h.step();
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:{...saved,parallax:false}}));assert.deepEqual(reading(),{x:0,y:0});h.sensor(80,40);assert.equal(h.frames.size,0);
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:saved}));h.sensor(60,15);h.step();assert.equal(deviceTiltStatus(),'active');assert.deepEqual(reading(),{x:0,y:0});
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:{...saved,depth:0}}));assert.equal(h.frames.size,0);
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:saved}));h.sensor(40,0);h.sensor(40,15);h.step();assert.ok(reading().x>5);
 }finally{h.close();}
});
test('reduced motion pauses permission and animation; re-enabling motion restores the chosen effect',async()=>{
 const h=harness();let calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return Promise.resolve('granted');}};
 try{h.reduce(true);initAmbient(saved);h.step();h.tap();await h.flush();assert.equal(calls,0);assert.equal(h.frames.size,0);
  h.reduce(false);h.sensor(45,0);h.sensor(45,15);h.step();assert.equal(deviceTiltStatus(),'active');assert.ok(reading().x>5);
 }finally{h.close();}
});
test('a sudden tilt eases in, tiny tremor stays still, and returning the phone returns the wallpaper to center',async()=>{
 const h=harness();window.DeviceOrientationEvent=class{};
 try{initAmbient(saved);h.sensor(89,0);h.sensor(89,.1);h.step();assert.deepEqual(reading(),{x:0,y:0});
  h.sensor(89,60);h.step(1);const first=reading().x;assert.ok(first>0&&first<2,'no one-frame jump');
  h.step(10);const later=reading().x;assert.ok(later>first&&later<23);h.step();assert.ok(reading().x>23);
  h.sensor(89,0);h.step(180);assert.ok(Math.abs(reading().x)<.03);assert.equal(h.frames.size,0);
 }finally{h.close();}
});
test('smooth wallpaper motion stays bounded, never writes root styles, and does no idle frame work',()=>{
 const h=harness();try{
  const layer=document.getElementById('ambientLight'),root=document.documentElement;let writes=0,paints=0;
  const rootSet=root.style.setProperty,layerSet=layer.style.setProperty;
  root.style.setProperty=function(...args){writes++;return rootSet.apply(this,args);};
  layer.style.setProperty=function(...args){if(args[0]==='--parallax-x')paints++;return layerSet.apply(this,args);};
  initAmbient({...APPEARANCE_DEFAULTS,depth:100});paints=0;
  window.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'mouse',clientX:100000,clientY:-100000}));h.step(120,1000/120);
  assert.ok(paints>30&&paints<=60,`paint count ${paints}`);assert.equal(writes,0);assert.ok(Math.abs(reading().x)<=45&&Math.abs(reading().y)<=80);
  h.step(240);assert.equal(h.frames.size,0);const count=paints;h.step();assert.equal(paints,count);
 }finally{h.close();}
});
test('hidden previews stay asleep; visible previews follow the isolated background',()=>{
 const h=harness();window.DeviceOrientationEvent=class{};
 try{initAmbient(saved);h.sensor(45,0);h.sensor(45,20);h.step();const preview=document.getElementById('appearancePreview');assert.equal(preview.style['--preview-rotate-y'],undefined);
  document.getElementById('appearancePage').hidden=false;document.dispatchEvent(new CustomEvent('fitcat:screen',{detail:'appearancePage'}));assert.ok(parseFloat(preview.style['--preview-rotate-y'])>0);
 }finally{h.close();}
});
test('a trusted tap can supersede a blocked automatic request; its late rejection cannot undo the grant',async()=>{
 const h=harness();let reject,calls=0;window.DeviceOrientationEvent=class{static requestPermission(){calls++;return calls===1?new Promise((_,fail)=>{reject=fail;}):Promise.resolve('granted');}};
 try{initAmbient(saved);h.step(12);h.tap();await h.flush();assert.equal(calls,2);h.sensor(45,0);reject(new Error('NotAllowedError'));await h.flush();assert.equal(deviceTiltStatus(),'active');h.sensor(45,20);h.step();assert.ok(reading().x>5);}finally{h.close();}
});
test('changing unrelated appearance values never recenters an active phone',()=>{
 const h=harness();window.DeviceOrientationEvent=class{};
 try{initAmbient(saved);h.sensor(45,0);h.sensor(45,20);h.step();const before=reading().x;
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:{...saved,transparency:70,glow:50}}));h.sensor(45,20);h.step();assert.ok(Math.abs(reading().x-before)<.05);assert.equal(deviceTiltStatus(),'active');
 }finally{h.close();}
});

test('a live profile cover receives smoothed tilt inside a sheet while its backdrop stays fixed and resumes softly',()=>{
 const h=harness();window.DeviceOrientationEvent=class{};
 let active=true,last={x:0,y:0},calls=0;
 const release=subscribeAmbientMotion((x,y)=>{last={x,y};calls++;},()=>active);
 try{
  initAmbient(saved);h.sensor(45,0);h.sensor(45,8);h.step();const before=reading();
  document.body.classList.add('dialog-open');h.sensor(50,24);h.step();
  assert.deepEqual(reading(),before);assert.ok(Math.abs(last.x-before.x)>2);assert.ok(calls>10);
  h.step(240);assert.equal(h.frames.size,0);
  const count=calls;active=false;h.sensor(53,29);h.step();assert.equal(calls,count);assert.deepEqual(reading(),before);
  document.body.classList.remove('dialog-open');document.dispatchEvent(new Event('fitcat:dialogclose'));h.step(1);
  assert.ok(Math.abs(reading().x-before.x)<2,'resuming does not jump to the cover position');
  h.step();assert.ok(Math.abs(reading().x-before.x)>2);h.step(240);assert.equal(h.frames.size,0);
 }finally{release();h.close();}
});
