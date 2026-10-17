import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { setupDOM } from './dom.mjs';
const source=readFileSync(new URL('../js/ui/boot.js',import.meta.url),'utf8');
function boot() {
  const env=setupDOM({existing_diary:'keep'}); let id=0; let reloads=0; let restores=0;
  const timers=new Map(); const frames=[];
  document.addEventListener('fitcat:viewportrestore',()=>++restores);
  vm.runInNewContext(source,{window,document,Event,location:{reload(){++reloads;}},requestAnimationFrame:cb=>{frames.push(cb);return ++id;},setTimeout:(callback,delay)=>{const key=++id;timers.set(key,{callback,delay});return key;},clearTimeout:key=>timers.delete(key)});
  const framesNow=()=>{while(frames.length)frames.shift()();};
  const run=delay=>{for(const [key,timer] of [...timers])if(timer.delay===delay&&timers.delete(key))timer.callback();};
  return {env,run,framesNow,get reloads(){return reloads;},get restores(){return restores;}};
}

test('splash holds the app until readiness, then fades once without changing saved data', () => {
  const h=boot();
  try {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    assert.equal(document.documentElement.classList.contains('app-starting'),true);
    assert.equal(document.getElementById('appScroller').inert,true);
    document.dispatchEvent(new Event('fitcat:ready')); h.framesNow();
    assert.equal(document.documentElement.classList.contains('app-starting'),false);
    assert.equal(document.getElementById('appScroller').inert,false);
    assert.equal(document.getElementById('startupScreen').classList.contains('is-leaving'),true);
    assert.equal(h.restores,1); h.run(420); assert.equal(document.getElementById('startupScreen').hidden,true);
    window.dispatchEvent(new Event('pageshow')); h.framesNow(); assert.equal(h.restores,1);
    assert.equal(h.env.localStorage.getItem('existing_diary'),'keep');
  } finally {h.env.restoreTimers();}
});

test('a failed module load exposes retry instead of an endless spinner; late readiness can recover', () => {
  const h=boot();
  try {
    h.run(5000); assert.equal(document.documentElement.classList.contains('startup-failed'),true);
    document.getElementById('startupRetry').click(); assert.equal(h.reloads,1);
    document.dispatchEvent(new Event('fitcat:ready')); h.framesNow();
    assert.equal(document.documentElement.classList.contains('startup-failed'),false);
    assert.equal(document.documentElement.classList.contains('app-starting'),false);
  } finally {h.env.restoreTimers();}
});
