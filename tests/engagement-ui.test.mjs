import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { setupDOM, tick } from './dom.mjs';
import { WALLET_KEY } from '../js/core/wallet.js';

test('achievement descriptions, developer command and skippable gesture practice work together',async t=>{
 const env=setupDOM({fitnessProfile:JSON.stringify({name:'Meow',age:20,gender:'male',height:165,weight:52,goal:'maintain'}),lastDate:new Date().toDateString()});
 const $=id=>document.getElementById(id),click=async selector=>{const node=document.querySelector(selector);assert.ok(node,selector);node.click();await tick();await tick();};
 const change=async(id,on)=>{$(id).checked=on;$(id).dispatchEvent(new Event('change'));await tick();await tick();};
 const close=async id=>{$(id).dispatchEvent(new Event('cancel',{cancelable:true}));await tick();await tick();};
 let results,cameras=0,stops=0,closed=0;const callbacks=[];
 const previousHands=globalThis.Hands;
 globalThis.innerWidth=390;globalThis.innerHeight=844;
 globalThis.Hands=class{setOptions(){}onResults(fn){results=fn;callbacks.push(fn);}send(){return new Promise(()=>{});}close(){closed++;}};
 const camera=()=>({getTracks:()=>[{stop(){stops++;}}]});
 navigator.mediaDevices={getUserMedia:async()=>{cameras++;return camera();}};
 const create=document.createElement.bind(document);document.createElement=tag=>{const node=create(tag);if(tag==='video')node.play=async()=>{};return node;};
 const hand=()=>Array.from({length:21},(_,i)=>({x:.4+(i%4)*.04,y:.7-Math.floor(i/4)*.06}));
 try{
  await import('../js/app.js');const {state,loadState}=await import('../js/core/store.js');const {getWallet}=await import('../js/features/wallet.js');
  await click('[data-action="showProfile"]');
  await t.test('all achievement tiers open short descriptions on Basic, with diamond as the final tier',async()=>{
   await click('.profile-achievements-heading');assert.equal($('achievementsModal').open,true);assert.equal($('achievementsGrid').querySelectorAll('[data-action="openAchievement"]').length,8);
   await click('#achievementsGrid [data-achievement="stable90"]');assert.equal($('achievementDetailModal').open,true);assert.match($('achievementDescription').textContent,/90 разных дней/);assert.match($('achievementDetailName').textContent,/Алмаз/);assert.equal($('achievementLevels').querySelectorAll('button').length,4);assert.ok(!document.querySelector('[data-achievement="stable365"]'));
   assert.equal($('subscriptionDialog').open,false);await close('achievementDetailModal');await close('achievementsModal');
  });
  await t.test('typing /dev saves the original nickname, activates PRO and all badges, with exactly one coin grant',async()=>{
   $('profileName').setAttribute('aria-invalid','true');$('profileName').value='Meow /dev';$('profileName').dispatchEvent(new Event('input',{bubbles:true}));await tick();await tick();await tick();assert.equal($('profileName').getAttribute('aria-invalid'),'false');
   assert.equal(state.profile.name,'Meow');assert.equal($('profileName').value,'Meow');assert.equal($('profileDeveloperBadge').hidden,false);assert.equal(getWallet().snapshot().balance,999999);assert.equal(getWallet().status().active,true);
   assert.equal(Object.keys(state.achievements.unlocked).length,8);const before=env.localStorage.getItem(WALLET_KEY);
   $('profileName').value='/dev';$('profileName').dispatchEvent(new Event('change',{bubbles:true}));await tick();await tick();assert.equal(env.localStorage.getItem(WALLET_KEY),before);
   await click('#profileDeveloperBadge');assert.match($('achievementDescription').textContent,/Персональный значок/);await close('achievementDetailModal');
  });
  await t.test('opening the tutorial asks for no camera and exposes both the guide and explicit switch',async()=>{
   await click('#profilePage [data-value="settingsPage"]');await click('#gestureToggleBtn');assert.equal($('gestureGuideModal').open,true);assert.equal(cameras,0);assert.equal($('gestureGuideIntro').hidden,false);assert.equal($('gestureGuideToggle').checked,false);
   assert.ok($('gestureGuideIntro').querySelector('[data-action="skipGestureTraining"]'));assert.ok($('gesturePractice').querySelector('[data-action="skipGestureTraining"]'));
  });
  await t.test('the switch starts one camera, and training reuses it without changing the diary or real tabs',async()=>{
   await change('gestureGuideToggle',true);assert.equal(cameras,1);assert.equal($('gestureEnabledToggle').checked,true);
   await click('#gestureStartTraining');assert.equal(cameras,1);assert.equal($('gesturePractice').hidden,false);
   const before=state.water,wallet=env.localStorage.getItem(WALLET_KEY),tab=document.querySelector('.nav-item.active')?.dataset.tab;
   const h=hand();h[4]={x:.9,y:.9};h[8]={x:.5,y:.4};results({multiHandLandmarks:[h]});h[0].x-=.2;results({multiHandLandmarks:[h]});await delay(420);
   assert.match($('gesturePracticeStep').textContent,/2 из 3/);assert.equal(state.water,before);assert.equal(document.querySelector('.nav-item.active')?.dataset.tab,tab);
   document.elementFromPoint=()=>$('gesturePracticeTarget');h[4]={...h[8]};results({multiHandLandmarks:[h]});await delay(420);assert.match($('gesturePracticeStep').textContent,/3 из 3/);
   h[4]={x:.9,y:.9};results({multiHandLandmarks:[h]});h[0].y+=.08;results({multiHandLandmarks:[h]});await delay(420);
   assert.equal($('gestureComplete').hidden,false);assert.equal(state.water,before);assert.equal(env.localStorage.getItem(WALLET_KEY),wallet);
   await click('#gestureComplete [data-action="finishGestureTraining"]');assert.equal($('gestureGuideModal').open,false);assert.equal(document.body.dataset.screen,'mainPage');assert.equal($('gestureEnabledToggle').checked,true);assert.equal(cameras,1);
   await change('gestureEnabledToggle',false);assert.equal(stops,1);assert.equal(closed,1);assert.equal($('gestureGuideToggle').checked,false);
  });
  await t.test('skipping learning activates normal gestures directly, and a permission failure leaves the switch off',async()=>{
   await click('#gestureToggleBtn');await click('#gestureGuideIntro [data-action="skipGestureTraining"]');assert.equal($('gestureGuideModal').open,false);assert.equal(cameras,2);
   const probe=document.createElement('button');let clicks=0;probe.addEventListener('click',()=>clicks++);document.body.append(probe);document.elementFromPoint=()=>probe;
   const pinch=hand();pinch[4]={...pinch[8]};callbacks[0]({multiHandLandmarks:[pinch]});assert.equal(clicks,0);results({multiHandLandmarks:[pinch]});assert.equal(clicks,1);probe.remove();await change('gestureEnabledToggle',false);
   navigator.mediaDevices.getUserMedia=async()=>{throw Error('denied');};await click('#gestureToggleBtn');await click('#gestureStartTraining');assert.equal($('gestureGuideError').hidden,false);assert.equal($('gestureEnabledToggle').checked,false);assert.equal($('gestureGuideToggle').checked,false);assert.equal($('gestureGuideIntro').hidden,false);await close('gestureGuideModal');
  });
  await t.test('developer entitlements and artwork remain after reload and LDM does not revoke achievements',async()=>{
   const wallet=env.localStorage.getItem(WALLET_KEY);loadState(env.localStorage);assert.equal(state.achievements.developer,true);state.preferences.lowDetailMode=true;document.dispatchEvent(new Event('fitcat:change'));await tick();assert.equal($('profileDeveloperBadge').hidden,false);assert.equal(document.documentElement.dataset.lowDetail,'on');assert.equal(env.localStorage.getItem(WALLET_KEY),wallet);
   await click('[data-action="showProfile"]');await click('.profile-achievements-heading');assert.equal($('achievementsGrid').querySelectorAll('.is-earned').length,9);
  });
 }finally{const {stopGestures}=await import('../js/features/gestures.js');stopGestures({quiet:true});globalThis.Hands=previousHands;env.restoreTimers();}
});
