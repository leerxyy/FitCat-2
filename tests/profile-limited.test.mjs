import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIMITED_COSMETIC_PRICE,LIMITED_PROFILE_FRAMES,LIMITED_PROFILE_COVERS,LIMITED_PROFILE_SETS,limitedAsset} from '../js/core/profile-limited.js';
import {profileFramePrice,collectibleFrameAsset} from '../js/core/profile-frames.js';
import {profileCoverPrice} from '../js/core/profile-cities.js';
import {profileCoverAsset,effectiveProfileStyle,profileChoiceAllowed,PROFILE_STYLE_KEY} from '../js/core/profile-style.js';
import {createWallet,WALLET_KEY,validateWallet} from '../js/core/wallet.js';
import {loadState,state,setProfileStyle,exportSnapshot,importSnapshot} from '../js/core/store.js';
import {LIMITED_FRAME_GEOMETRY} from '../js/core/profile-limited-geometry.js';
import {limitedCoverMarkup,limitedFrameEffectsMarkup} from '../js/core/profile-limited-effects.js';
import {profileLimitedCopy} from '../js/core/profile-limited-copy.js';
const now=Date.UTC(2026,9,19,12);
function memory(balance=100000){
  const map=new Map([['fitnessProfile',JSON.stringify({name:'Meow',age:20,gender:'male',height:165,weight:52,goal:'maintain'})],[WALLET_KEY,JSON.stringify({version:1,balance,entries:balance?[{id:'old-balance',kind:'promo',amount:balance,at:now,balanceAfter:balance}]:[],redeemed:[],subscription:null})]]),writes=[];
  return{map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,String(value));},removeItem:key=>map.delete(key)};
}
test('three coordinated sets expose six independently priced permanent items',()=>{
  assert.equal(LIMITED_COSMETIC_PRICE,9999);assert.equal(LIMITED_PROFILE_SETS.length,3);
  assert.equal(LIMITED_PROFILE_FRAMES.length,3);assert.equal(LIMITED_PROFILE_COVERS.length,3);
  for(const id of LIMITED_PROFILE_FRAMES){assert.equal(profileFramePrice(id),9999);assert.match(collectibleFrameAsset(id),/assets\/profile-limited\/frames/);}
  for(const id of LIMITED_PROFILE_COVERS){assert.equal(profileCoverPrice(id),9999);assert.match(profileCoverAsset(id),/assets\/profile-limited\/covers/);}
  assert.equal(profileFramePrice('dragon'),229);assert.equal(profileCoverPrice('moscow'),299);
  for(const id of ['__proto__','../cathedral','https://evil.test/asset']){assert.equal(limitedAsset('frame',id),'');assert.equal(limitedAsset('cover',id),'');assert.equal(profileFramePrice(id),null);assert.equal(profileCoverPrice(id),null);}
});
test('PRO+ never grants a limited item, but owned items remain usable on Basic',()=>{
  for(const set of LIMITED_PROFILE_SETS){
    const chosen={cover:set.cover,frame:set.frame};
    assert.deepEqual(effectiveProfileStyle(chosen,true),{cover:'mist',frame:'ice'});
    assert.equal(profileChoiceAllowed('frame',set.frame,true),false);assert.equal(profileChoiceAllowed('cover',set.cover,true),false);
    assert.deepEqual(effectiveProfileStyle(chosen,false,[set.cover],[set.frame]),chosen);
    assert.equal(profileChoiceAllowed('frame',set.frame,false,[],[set.frame]),true);assert.equal(profileChoiceAllowed('cover',set.cover,false,[set.cover],[]),true);
  }
});
test('buying all six makes six exact atomic debits and retains legacy receipts byte-for-byte',async()=>{
  const storage=memory(),wallet=createWallet(storage),before=structuredClone(wallet.snapshot().entries[0]);
  for(const frame of LIMITED_PROFILE_FRAMES)await wallet.purchaseFrame(frame,{now,operationId:'frame-'+frame});
  for(const cover of LIMITED_PROFILE_COVERS)await wallet.purchaseCover(cover,{now,operationId:'cover-'+cover});
  const saved=wallet.snapshot();assert.equal(saved.balance,40006);assert.equal(storage.writes.length,6);assert.deepEqual(saved.entries[0],before);
  assert.ok(saved.entries.slice(1).every(e=>e.amount===-9999));assert.deepEqual(wallet.ownedFrames(),LIMITED_PROFILE_FRAMES);assert.deepEqual(wallet.ownedCovers(),LIMITED_PROFILE_COVERS);
  assert.deepEqual(createWallet(storage).snapshot(),saved);assert.equal(wallet.status(now).active,false);
});
test('double taps, operation retries and another local wallet cannot charge a limited item twice',async()=>{
  const storage=memory(),one=createWallet(storage),two=createWallet(storage);
  await Promise.all([one.purchaseFrame('kitsune',{now,operationId:'f'}),two.purchaseFrame('kitsune',{now,operationId:'f2'}),one.purchaseCover('scarlet',{now,operationId:'c'}),two.purchaseCover('scarlet',{now,operationId:'c2'})]);
  assert.equal(one.snapshot().balance,80002);assert.equal(storage.writes.length,2);
  const saved=storage.getItem(WALLET_KEY);await one.purchaseFrame('kitsune',{now,operationId:'f'});await one.purchaseCover('scarlet',{now,operationId:'c'});assert.equal(storage.getItem(WALLET_KEY),saved);
  await assert.rejects(one.purchaseFrame('seraph',{now,operationId:'f'}),/wallet_invalid_purchase/);
  await assert.rejects(one.purchaseCover('atlantis',{now,operationId:'c'}),/wallet_invalid_purchase/);
  await assert.rejects(one.purchaseCover('scarlet',{now,operationId:'f'}),/wallet_invalid_purchase/);
});
test('limited items, old frames, cities and subscriptions share one spending lock',async()=>{
  const storage=memory(10250),wallet=createWallet(storage);
  const operations=await Promise.allSettled([wallet.purchaseFrame('kitsune',{now,operationId:'limited'}),wallet.purchaseFrame('dragon',{now,operationId:'old-frame'}),wallet.purchaseCover('moscow',{now,operationId:'old-cover'}),wallet.purchase('1',{now,operationId:'sub'})]);
  assert.equal(operations.filter(r=>r.status==='fulfilled').length,2);assert.equal(wallet.snapshot().balance,22);assert.deepEqual(wallet.ownedFrames(),['kitsune','dragon']);assert.deepEqual(wallet.ownedCovers(),[]);assert.ok(wallet.snapshot().balance>=0);
});
test('insufficient balance never grants or partially pays for a limited cosmetic',async()=>{
  const storage=memory(9998),wallet=createWallet(storage),before=storage.getItem(WALLET_KEY);
  await assert.rejects(wallet.purchaseCover('cathedral',{now}),/wallet_insufficient/);await assert.rejects(wallet.purchaseFrame('seraph',{now}),/wallet_insufficient/);
  assert.equal(storage.getItem(WALLET_KEY),before);assert.equal(storage.writes.length,0);assert.deepEqual(wallet.ownedFrames(),[]);assert.deepEqual(wallet.ownedCovers(),[]);
});
test('a failed storage write leaves both funds and entitlement unchanged; retry charges once',async()=>{
  for(const[kind,id]of [['Frame','pearlguard'],['Cover','atlantis']]){
    const storage=memory(),wallet=createWallet(storage),saved=storage.getItem(WALLET_KEY),write=storage.setItem;
    storage.setItem=()=>{throw new Error('quota');};await assert.rejects(wallet['purchase'+kind](id,{now,operationId:'same'}),/quota/);assert.equal(storage.getItem(WALLET_KEY),saved);
    storage.setItem=write;await wallet['purchase'+kind](id,{now,operationId:'same'});await wallet['purchase'+kind](id,{now,operationId:'same'});assert.equal(wallet.snapshot().balance,90001);assert.equal(storage.writes.length,1);
  }
});
test('tampered amounts, unknown items and duplicate limited receipts fail ledger validation',async()=>{
  for(const[kind,id]of [['Frame','seraph'],['Cover','cathedral']]){
    const storage=memory(),wallet=createWallet(storage);await wallet['purchase'+kind](id,{now});const original=wallet.snapshot();
    const cheaper=structuredClone(original);cheaper.entries[1].amount=-229;cheaper.entries[1].balanceAfter=99771;cheaper.balance=99771;assert.throws(()=>validateWallet(cheaper),/wallet_corrupt/);
    const unknown=structuredClone(original);unknown.entries[1][kind.toLowerCase()]='injected';assert.throws(()=>validateWallet(unknown),/wallet_corrupt/);
    const duplicate=structuredClone(original);duplicate.entries.push({...duplicate.entries[1],id:'duplicate',balanceAfter:80002});duplicate.balance=80002;assert.throws(()=>validateWallet(duplicate),/wallet_corrupt/);
  }
});
test('a backup restores limited choices, balance and receipts together without losing older purchases',async()=>{
  const storage=memory();loadState(storage);const wallet=createWallet(storage);
  await wallet.purchaseFrame('dragon',{now});await wallet.purchaseCover('moscow',{now});await wallet.purchaseFrame('seraph',{now});await wallet.purchaseCover('cathedral',{now});
  setProfileStyle({frame:'seraph',cover:'cathedral'});const backup=structuredClone(exportSnapshot()),saved=storage.getItem(WALLET_KEY);
  setProfileStyle({frame:'ice',cover:'mist'});storage.removeItem(WALLET_KEY);importSnapshot(backup);
  assert.deepEqual(state.profileStyle,{frame:'seraph',cover:'cathedral'});assert.equal(storage.getItem(WALLET_KEY),saved);assert.deepEqual(wallet.ownedFrames(),['dragon','seraph']);assert.deepEqual(wallet.ownedCovers(),['moscow','cathedral']);
  loadState(storage);assert.deepEqual(state.profileStyle,{frame:'seraph',cover:'cathedral'});
});
test('failed backup validation preserves installed limited items and all current storage',async()=>{
  const storage=memory();loadState(storage);await createWallet(storage).purchaseFrame('kitsune',{now});setProfileStyle({frame:'kitsune',cover:'lake'});
  const before=new Map(storage.map),backup=structuredClone(exportSnapshot());backup.wallet.entries[1].amount=-1;
  assert.throws(()=>importSnapshot(backup),/invalid_backup/);assert.deepEqual(storage.map,before);assert.equal(state.profileStyle.frame,'kitsune');assert.ok(storage.getItem(PROFILE_STYLE_KEY));
});
test('all source art, alpha pieces and pre-rendered effects are local WebP and cached offline',()=>{
  const source=JSON.parse(readFileSync(new URL('../assets/profile-limited/sources.json',import.meta.url))),sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  let count=0,bytes=0;
  for(const item of source.items){for(const asset of item.assets){const raw=readFileSync(new URL('../'+asset.file,import.meta.url));assert.equal(raw.subarray(0,4).toString(),'RIFF');assert.equal(raw.subarray(8,12).toString(),'WEBP');assert.equal(raw.length,asset.bytes);assert.ok(sw.includes("'"+asset.file+"'"),asset.file);count++;bytes+=raw.length;}}
  assert.equal(source.items.filter(x=>x.generated).length,6);assert.ok(count<100);assert.ok(bytes<7000000);
  for(const id of LIMITED_PROFILE_FRAMES){const g=LIMITED_FRAME_GEOMETRY[id];assert.ok(g.hole>.48&&g.hole<.65);for(const p of g.pieces){assert.ok(p.left>=0&&p.top>=0&&p.left+p.width<=100.001&&p.top+p.height<=100.001);assert.ok(p.width<42&&p.height<60,'Pieces must be cropped rather than full-canvas copies');}}
  assert.equal(LIMITED_FRAME_GEOMETRY.seraph.pieces.filter(p=>p.type==='wing').length,6);
});
test('every new runtime module, stylesheet and provenance record is in the precache',()=>{
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  for(const file of ['js/core/profile-limited.js','js/core/profile-limited-copy.js','js/core/profile-limited-effects.js','js/core/profile-limited-geometry.js','styles/profile-limited.css','assets/profile-limited/sources.json'])assert.ok(sw.includes("'"+file+"'"),file);
});
test('animation layers preserve intrinsic layout, share the paused clock and avoid extra runtime loops',()=>{
  const css=readFileSync(new URL('../styles/profile-limited.css',import.meta.url),'utf8'),feature=readFileSync(new URL('../js/features/profile-style.js',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(css,/#profileIdentityCard\[data-collectible-frame=/);assert.doesNotMatch(css,/#frameStylePreview\[data-collectible=/);
  assert.match(css,/animation-play-state: var\(--cosmetic-play, paused\) !important/);assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css,/(?:^|[;{\s])filter\s*:/);assert.doesNotMatch(feature,/setInterval|requestAnimationFrame|deviceorientation/);
  assert.equal((feature.match(/subscribeAmbientMotion\(/g)||[]).length,1);assert.ok(html.includes('styles/profile-limited.css'));
  for(const name of css.matchAll(/@keyframes\s+([^\s{]+)/g))assert.ok(name[1].startsWith('profile-'));
  for(const id of LIMITED_PROFILE_FRAMES){const markup=limitedFrameEffectsMarkup(id);assert.match(markup,/limited-piece/);assert.doesNotMatch(markup,/url\("assets\//);assert.match(markup,/&quot;file:\/\//);}
  for(const id of LIMITED_PROFILE_COVERS){const markup=limitedCoverMarkup(id);assert.match(markup,/limited-light-flow/);assert.match(markup,/limited-rays/);assert.doesNotMatch(markup,/-front\.webp/);assert.match(markup,/&quot;file:\/\//);assert.doesNotMatch(markup,/<video|<canvas/);}
});
test('all three languages name every new item and explain separate permanent purchases',()=>{
  const keys=Object.keys(profileLimitedCopy.ru).sort();
  for(const copy of Object.values(profileLimitedCopy)){assert.deepEqual(Object.keys(copy).sort(),keys);for(const value of Object.values(copy))assert.ok(typeof value==='string'&&value.trim());for(const id of LIMITED_PROFILE_FRAMES)assert.ok(copy['profile_frame_'+id]);for(const id of LIMITED_PROFILE_COVERS)assert.ok(copy['profile_cover_'+id]);}
});
