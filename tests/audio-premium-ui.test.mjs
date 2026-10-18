import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, activeProFixture } from './dom.mjs';
import { audioFixture, microtasks } from './audio-fixture.mjs';
import { PREMIUM_SOUND_STYLES } from '../js/core/sounds.js';
import { APPEARANCE_KEY } from '../js/core/appearance.js';

test('the sound collection allows public previews and enforces PRO selection across expiry and renewal',async t=>{
 const env=setupDOM({fitnessProfile:JSON.stringify({name:'Meow',age:20,gender:'male',height:180,weight:80,goal:'maintain'}),lastDate:new Date().toDateString()});
 const f=audioFixture(),originalFetch=globalThis.fetch;window.AudioContext=f.Context;
 globalThis.fetch=(url,...args)=>String(url).includes('/assets/audio/')?f.fetch(url):originalFetch(url,...args);
 const $=id=>document.getElementById(id);
 const click=async selector=>{const node=document.querySelector(selector);assert.ok(node,selector);node.click();await tick();await microtasks();};
 const subscription=async active=>{
  if(active)for(const [key,value]of Object.entries(activeProFixture()))env.localStorage.setItem(key,value);
  else for(const [key,value]of Object.entries(activeProFixture(Date.now()-9*86400000)))env.localStorage.setItem(key,value);
  const event=new Event('storage');Object.defineProperty(event,'key',{value:'fitcat_subscription_v1'});window.dispatchEvent(event);await tick();await microtasks();
 };
 try{
  await import('../js/app.js');const {state,proAccess}=await import('../js/core/store.js');const {playInterfaceSound}=await import('../js/ui/sounds.js');
  await click('[data-action="showProfile"]');await click('#profilePage [data-value="settingsPage"]');await click('#openAppearance');await click('#appearanceAudioTab');
  await t.test('all fourteen PRO previews play on Basic without selecting, charging, or opening checkout',async()=>{
   assert.equal(proAccess(),false);const settings=env.localStorage.getItem(APPEARANCE_KEY),wallet=env.localStorage.getItem('fitcat_wallet_v1');
   for(const style of PREMIUM_SOUND_STYLES){
    const card=$('appearanceAudioPanel').querySelector(`[data-sound-card="${style}"]`);
    assert.ok(card.querySelector('.pro-feature-badge'));assert.equal(card.querySelector('[data-audio-preview]').closest('[data-pro-feature]'),null);
    await click(`[data-audio-preview="${style}"]`);assert.equal(f.stats.plays.at(-1).buffer.style,style);assert.equal($('subscriptionDialog').open,false);
   }
   assert.equal(env.localStorage.getItem(APPEARANCE_KEY),settings);assert.equal(env.localStorage.getItem('fitcat_wallet_v1'),wallet);assert.equal(state.appearance.soundStyle,'glass');
  });
  await t.test('a locked card and its PRO badge open the correct subscription description without saving',async()=>{
   const before=env.localStorage.getItem(APPEARANCE_KEY);
   await click('[data-appearance-kind="soundStyle"][data-value="wood"]');assert.equal($('subscriptionDialog').open,true);
   assert.equal($('proFeatureTitle').textContent,'Звуки PRO+');assert.match($('proFeatureDescription').textContent,/14/);assert.match($('proFeatureDescription').textContent,/дерево/);
   assert.equal(env.localStorage.getItem(APPEARANCE_KEY),before);$('subscriptionDialog').close();await tick();
   await click('[data-appearance-kind="soundStyle"][data-value="wood"] .pro-feature-badge');assert.equal($('subscriptionDialog').open,true);$('subscriptionDialog').close();await tick();
  });
  await t.test('PRO activates all fourteen choices, including wood, with one saved selection',async()=>{
   await subscription(true);assert.equal(proAccess(),true);
   $('appearanceSoundEnabled').checked=true;$('appearanceSoundEnabled').dispatchEvent(new Event('change',{bubbles:true}));await microtasks();
   for(const style of PREMIUM_SOUND_STYLES){
    await click(`[data-appearance-kind="soundStyle"][data-value="${style}"]`);
    assert.equal(state.appearance.soundStyle,style);assert.equal(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)).soundStyle,style);
    assert.equal($('appearanceAudioPanel').querySelectorAll('[data-selected="true"]').length,1);
   }
   await click('[data-appearance-kind="soundStyle"][data-value="wood"]');assert.equal(await playInterfaceSound(),true);assert.equal(f.stats.plays.at(-1).buffer.style,'wood');
  });
  await t.test('expiry switches ordinary clicks to Glass while preserving the exact saved PRO setting',async()=>{
   const saved=env.localStorage.getItem(APPEARANCE_KEY);await subscription(false);
   assert.equal(proAccess(),false);assert.equal(state.appearance.soundStyle,'wood');assert.equal(env.localStorage.getItem(APPEARANCE_KEY),saved);assert.equal($('appearanceSoundProNotice').hidden,false);
   assert.equal($('appearanceAudioPanel').querySelector('[data-sound-card="glass"]').dataset.selected,'true');
   await click('[data-audio-preview="wood"]');assert.equal(f.stats.plays.at(-1).buffer.style,'wood');
   assert.equal(await playInterfaceSound(),true);assert.equal(f.stats.plays.at(-1).buffer.style,'glass');
   assert.equal(state.appearance.soundStyle,'wood');
  });
  await t.test('renewal restores Wood automatically and translations retain accessible public preview labels',async()=>{
   const saved=env.localStorage.getItem(APPEARANCE_KEY);await subscription(true);assert.equal(env.localStorage.getItem(APPEARANCE_KEY),saved);assert.equal($('appearanceSoundProNotice').hidden,true);
   assert.equal($('appearanceAudioPanel').querySelector('[data-sound-card="wood"]').dataset.selected,'true');
   await click('[data-audio-preview="wood"]');assert.equal(f.stats.plays.at(-1).buffer.style,'wood');
   for(const [lang,label]of [['en','Preview: Wood'],['cn','试听: 木材'],['ru','Прослушать: Дерево']]){
    state.preferences.lang=lang;document.dispatchEvent(new Event('fitcat:language'));
    assert.equal($('appearanceAudioPanel').querySelector('[data-audio-preview="wood"]').getAttribute('aria-label'),label);
   }
  });
 }finally{document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));env.restoreTimers();globalThis.fetch=originalFetch;}
});
