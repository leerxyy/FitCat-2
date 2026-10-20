import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { setupDOM } from './dom.mjs';
import { initSelectionLens, syncSelectionLens } from '../js/ui/selection-lens.js';
import { achievementArt } from '../js/ui/achievement-art.js';
import { ACHIEVEMENT_IDS } from '../js/core/achievements.js';
import { PROFILE_FRAMES, PROFILE_COVERS, normalizeProfileStyle, profileChoiceAllowed } from '../js/core/profile-style.js';
import { createWallet, WALLET_KEY } from '../js/core/wallet.js';
import { RETIRED_FRAME_PRICES, RETIRED_COVER_PRICES } from '../js/core/retired-cosmetics.js';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

for (const ldm of [false,true]) test(`lens follows frames, never returns to the old tab on release and becomes idle (LDM ${ldm})`,()=>{
 const env=setupDOM();window.PointerEvent=class{};globalThis.matchMedia=()=>({matches:false});document.documentElement.dataset.lowDetail=ldm?'on':'off';
 const frames=new Map();let frameId=0,time=performance.now();
 window.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};window.cancelAnimationFrame=id=>frames.delete(id);
 const advance=()=>{time+=16;const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(time));};
 const track=document.createElement('div');document.body.append(track);Object.assign(track,{offsetWidth:300,offsetHeight:60});track.getBoundingClientRect=()=>({left:0,top:0,width:300,height:60});
 for(let i=0;i<3;i++){const button=document.createElement('button');Object.assign(button,{offsetWidth:100,offsetHeight:60,offsetLeft:i*100,offsetTop:0});track.append(button);}
 let index=0,commits=0;const controller=initSelectionLens(track,{getIndex:()=>index,onSelect:value=>{index=value;commits++;syncSelectionLens(track);document.dispatchEvent(new Event('fitcat:tab'));}});
 const pointer=(type,x)=>{const event=new Event(type,{bubbles:true,cancelable:true});for(const [key,value]of Object.entries({pointerId:1,isPrimary:true,button:0,clientX:x,clientY:30}))Object.defineProperty(event,key,{value});(type==='pointerdown'?track:document).dispatchEvent(event);};
 const visual=()=>parseFloat(track.style.getPropertyValue('--lens-display-x'));
 try{
  pointer('pointerdown',50);pointer('pointermove',250);assert.equal(index,0);assert.equal(commits,0);assert.equal(visual(),0);assert.equal(frames.size,1);
  advance();const moving=visual();assert.ok(moving>0&&moving<200,`intermediate frame: ${moving}`);advance();assert.ok(visual()>moving);
  const writes=[],set=track.style.setProperty;track.style.setProperty=function(key,value){if(key==='--lens-x')writes.push(parseFloat(value));set.call(this,key,value);};
  const released=visual();pointer('pointerup',250);assert.equal(index,2);assert.equal(commits,1);assert.equal(visual(),released);assert.ok(writes.every(x=>x===200),'release must never target the previous tab');
  let previous=visual();for(let i=0;i<100&&frames.size;i++){advance();assert.ok(visual()>=previous,'settling must be monotonic');previous=visual();}
  assert.equal(visual(),200);assert.equal(frames.size,0);assert.equal(track.classList.contains('is-lens-animating'),false);
  pointer('pointerdown',250);pointer('pointermove',50);advance();assert.ok(visual()<200);controller.dispose();assert.equal(frames.size,0);
 }finally{controller.dispose();env.restoreTimers();}
});

test('each achievement has original inline art, bounded dimensions, unique gradients and no sprite fetch',()=>{
 const ids=new Set();
 for(const id of [...ACHIEVEMENT_IDS,'dev']){
  const html=achievementArt(id);assert.match(html,/<svg[^>]+width="\d+"[^>]+height="\d+"/);assert.doesNotMatch(html,/<image|<img|atlas\.png|background-image/);
  for(const [,name]of html.matchAll(/ id="([^"]+)"/g)){assert.ok(!ids.has(name));ids.add(name);}
  if(id.startsWith('stable'))assert.ok(html.includes('>'+id.replace('stable','')+'</text>'));
 }
 const profile=read('styles/profile.css');assert.match(profile,/\.profile-achievement-list\{[^}]*flex-flow:row nowrap/);assert.match(profile,/\.achievements-grid\{[^}]*flex-flow:row nowrap/);assert.match(profile,/\.achievements-grid\{[^}]*overflow-x:auto/);
 const html=read('index.html');assert.ok(!html.includes('styles/engagement.css'));assert.ok(html.includes('styles/profile.css'));assert.ok(html.includes('styles/settings.css'));
});

test('gesture guide has one enable switch, compact native-sized art, a skip route and no duplicate Settings toggle',()=>{
 const env=setupDOM();try{
  assert.equal(document.getElementById('gestureEnabledToggle'),null);assert.equal(document.querySelectorAll('#gestureGuideToggle').length,1);
  assert.ok(document.querySelector('#gestureGuideIntro [data-action="skipGestureTraining"]'));
  assert.ok(document.querySelector('#gesturePractice [data-action="skipGestureTraining"]'));
  const svg=document.querySelector('.gesture-instruction-icon svg');assert.equal(svg.getAttribute('width'),'44');assert.equal(svg.getAttribute('height'),'44');
  assert.match(read('styles/settings.css'),/\.gesture-instruction-icon svg\{[^}]*max-width:32px/);
 }finally{env.restoreTimers();}
});

test('retired collections cannot be selected or purchased; existing receipts and coins remain valid',async()=>{
 const entries=[{id:'seed',kind:'promo',at:1,amount:100000,balanceAfter:100000}];let balance=100000;
 for(const [kind,prices,key]of [['profile-frame',RETIRED_FRAME_PRICES,'frame'],['profile-cover',RETIRED_COVER_PRICES,'cover']])for(const [id,price]of Object.entries(prices)){
  balance-=price;entries.push({id:'old-'+id,kind,at:2,amount:-price,balanceAfter:balance,[key]:id});
  assert.equal(profileChoiceAllowed(key,id,true,Object.keys(RETIRED_COVER_PRICES),Object.keys(RETIRED_FRAME_PRICES)),false);
 }
 const saved=JSON.stringify({version:1,balance,entries,redeemed:[],subscription:null});let raw=saved;
 const storage={getItem:key=>key===WALLET_KEY?raw:null,setItem:(key,value)=>{if(key===WALLET_KEY)raw=value;}};
 const wallet=createWallet(storage);assert.equal(wallet.snapshot().balance,balance);assert.equal(raw,saved);
 for(const id of Object.keys(RETIRED_FRAME_PRICES))await assert.rejects(wallet.purchaseFrame(id),/wallet_invalid_purchase/);
 for(const id of Object.keys(RETIRED_COVER_PRICES))await assert.rejects(wallet.purchaseCover(id),/wallet_invalid_purchase/);
 assert.equal(raw,saved);await wallet.purchase(1,{now:100,operationId:'after-retirement'});assert.equal(wallet.snapshot().balance,balance-29);assert.equal(wallet.snapshot().entries.length,entries.length+1);
 assert.deepEqual(normalizeProfileStyle({frame:'kitsune',cover:'scarlet'}),{frame:'ice',cover:'mist'});
 assert.deepEqual(normalizeProfileStyle({frame:'chronos',cover:'moscow'}),{frame:'ice',cover:'moscow'});
 assert.equal(PROFILE_FRAMES.length,8);assert.equal(PROFILE_COVERS.length,12);
 const html=read('index.html');assert.doesNotMatch(html,/collectibleFrameOffer|frameLimitedTitle|coverLimitedTitle|collectibleFramesTitle|collectible-shell|scene-limited/);
 for(const path of ['assets/profile-limited','assets/profile-frames'])assert.equal(existsSync(new URL('../'+path,import.meta.url)),false);
});
