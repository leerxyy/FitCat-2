import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWallet, WALLET_KEY, validateWallet } from '../js/core/wallet.js';
import { COLLECTIBLE_FRAME_PRICE, COLLECTIBLE_PROFILE_FRAMES, collectibleFrameAsset } from '../js/core/profile-frames.js';
import { effectiveProfileStyle, profileChoiceAllowed } from '../js/core/profile-style.js';
import { state, loadState, setProfileStyle, exportSnapshot, importSnapshot } from '../js/core/store.js';
const now=Date.UTC(2026,9,19,7);
function memory(balance=2000) {
  const map=new Map([['fitnessProfile',JSON.stringify({name:'Meow',age:20,gender:'male',height:165,weight:52,goal:'maintain'})]]);
  if(balance)map.set(WALLET_KEY,JSON.stringify({version:1,balance,entries:[{id:'old-coins',kind:'promo',amount:balance,at:now,balanceAfter:balance}],redeemed:[],subscription:null}));
  const writes=[];
  return {map,writes,getItem:k=>map.get(k)??null,setItem:(k,v)=>{writes.push(k);map.set(k,String(v));},removeItem:k=>map.delete(k)};
}
test('all five collectible frames cost 229 and require ownership even on PRO+',()=>{
  assert.equal(COLLECTIBLE_FRAME_PRICE,229);assert.equal(COLLECTIBLE_PROFILE_FRAMES.length,5);
  for(const frame of COLLECTIBLE_PROFILE_FRAMES){
    assert.equal(profileChoiceAllowed('frame',frame,true),false);
    assert.equal(profileChoiceAllowed('frame',frame,false,[],[frame]),true);
    assert.equal(effectiveProfileStyle({frame,cover:'mist'},true).frame,'ice');
    assert.equal(effectiveProfileStyle({frame,cover:'mist'},false,[],[frame]).frame,frame);
  }
  assert.equal(collectibleFrameAsset('../photo'),'');
});
test('each purchase atomically records its frame and exact debit while preserving old coins and receipts',async()=>{
  const storage=memory(),wallet=createWallet(storage),before=wallet.snapshot();
  for(const [index,frame]of COLLECTIBLE_PROFILE_FRAMES.entries()){
    await wallet.purchaseFrame(frame,{now,operationId:'frame-'+index});
    assert.equal(wallet.snapshot().balance,2000-229*(index+1));
  }
  assert.equal(storage.writes.length,5);assert.deepEqual(wallet.snapshot().entries[0],before.entries[0]);
  assert.deepEqual(wallet.ownedFrames(),COLLECTIBLE_PROFILE_FRAMES);
  assert.deepEqual(createWallet(storage).ownedFrames(),COLLECTIBLE_PROFILE_FRAMES);
  assert.ok(wallet.snapshot().entries.slice(1).every(x=>x.kind==='profile-frame'&&x.amount===-229));
  assert.equal(wallet.status(now).active,false);
});
test('retries and concurrent purchases never debit the same frame twice or reuse another receipt',async()=>{
  const storage=memory(500),one=createWallet(storage),two=createWallet(storage);
  await Promise.all([one.purchaseFrame('dragon',{now,operationId:'same'}),two.purchaseFrame('dragon',{now,operationId:'second'})]);
  const saved=storage.getItem(WALLET_KEY);
  await one.purchaseFrame('dragon',{now,operationId:'same'});
  assert.equal(storage.getItem(WALLET_KEY),saved);assert.equal(one.snapshot().balance,271);assert.equal(one.snapshot().entries.length,2);
  await assert.rejects(one.purchaseFrame('chronos',{now,operationId:'same'}),/wallet_invalid_purchase/);
  await assert.rejects(one.purchase('1',{now,operationId:'same'}),/wallet_invalid_purchase/);
  await assert.rejects(one.purchaseCover('dubai',{now,operationId:'same'}),/wallet_invalid_purchase/);
});
test('frames, cities and subscriptions use one spending lock and cannot overdraw',async()=>{
  const storage=memory(250),wallet=createWallet(storage);
  const results=await Promise.allSettled([wallet.purchaseFrame('dragon',{now}),wallet.purchaseFrame('chronos',{now}),wallet.purchaseCover('moscow',{now}),wallet.purchase('1',{now})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(wallet.snapshot().balance,21);assert.equal(wallet.snapshot().entries.length,2);
});
test('invalid IDs, lack of funds and failed writes cannot grant a free frame',async()=>{
  const poor=memory(228),wallet=createWallet(poor),saved=poor.getItem(WALLET_KEY);
  await assert.rejects(wallet.purchaseFrame('dragon',{now}),/wallet_insufficient/);
  for(const frame of ['ice','__proto__','../dragon','',null])await assert.rejects(wallet.purchaseFrame(frame,{now}),/wallet_invalid_purchase/);
  assert.equal(poor.getItem(WALLET_KEY),saved);assert.deepEqual(wallet.ownedFrames(),[]);
  const storage=memory(),value=storage.getItem(WALLET_KEY),write=storage.setItem;
  storage.setItem=()=>{throw new Error('quota');};
  await assert.rejects(createWallet(storage).purchaseFrame('phoenix',{now}),/quota/);
  assert.equal(storage.getItem(WALLET_KEY),value);assert.deepEqual(createWallet(storage).ownedFrames(),[]);
  storage.setItem=write;await createWallet(storage).purchaseFrame('phoenix',{now});assert.equal(createWallet(storage).snapshot().balance,1771);
});
test('expiration, resets and city purchases preserve collectible ownership',async()=>{
  const storage=memory();loadState(storage);const wallet=createWallet(storage);
  await wallet.purchaseFrame('dragon',{now});await wallet.purchaseCover('moscow',{now});await wallet.purchase('1',{now});
  setProfileStyle({frame:'dragon',cover:'moscow'});const end=wallet.status(now).expiresAt;
  assert.equal(wallet.status(end).active,false);
  assert.deepEqual(effectiveProfileStyle(state.profileStyle,false,wallet.ownedCovers(),wallet.ownedFrames()),{frame:'dragon',cover:'moscow'});
  setProfileStyle({frame:'ice',cover:'mist'});loadState(storage);
  assert.deepEqual(wallet.ownedFrames(),['dragon']);assert.deepEqual(wallet.ownedCovers(),['moscow']);
});
test('backups restore frames and balance together; old backups preserve existing purchases',async()=>{
  const storage=memory();loadState(storage);const wallet=createWallet(storage);
  await wallet.purchaseFrame('frostcrown',{now});setProfileStyle({frame:'frostcrown',cover:'mist'});
  const backup=structuredClone(exportSnapshot()),recipient=memory(0);loadState(recipient);importSnapshot(backup);
  const imported=createWallet(recipient);assert.deepEqual(imported.snapshot(),backup.wallet);
  assert.equal(effectiveProfileStyle(state.profileStyle,false,[],imported.ownedFrames()).frame,'frostcrown');
  const old=structuredClone(backup);delete old.wallet;const saved=recipient.getItem(WALLET_KEY);importSnapshot(old);assert.equal(recipient.getItem(WALLET_KEY),saved);
});
test('invalid or duplicate frame receipts abort restoration without overwriting current data',async()=>{
  const storage=memory();loadState(storage);await createWallet(storage).purchaseFrame('eclipse',{now});
  const backup=structuredClone(exportSnapshot()),saved=new Map(storage.map);
  for(const edit of [w=>w.entries.at(-1).frame='unknown',w=>{w.entries.at(-1).amount=-1;w.entries.at(-1).balanceAfter=1999;w.balance=1999;}]){
    const bad=structuredClone(backup);edit(bad.wallet);assert.throws(()=>importSnapshot(bad),/invalid_backup/);assert.deepEqual(storage.map,saved);
  }
  const duplicate=structuredClone(backup.wallet);duplicate.entries.push({...duplicate.entries.at(-1),id:'duplicate',balanceAfter:duplicate.balance-229});duplicate.balance-=229;
  assert.throws(()=>validateWallet(duplicate),/wallet_corrupt/);
});
test('five original alpha sprites and thumbnails are bounded offline WebP assets with provenance',()=>{
  const records=JSON.parse(readFileSync(new URL('../assets/profile-frames/frames.sources.json',import.meta.url),'utf8'));
  assert.deepEqual(records.map(x=>x.frame),COLLECTIBLE_PROFILE_FRAMES);
  let total=0;
  for(const record of records){
    assert.equal(record.generated,true);assert.match(record.master_sha256,/^[a-f0-9]{64}$/);assert.equal(record.assets.length,4);
    for(const asset of record.assets){const buffer=readFileSync(new URL('../'+asset.file,import.meta.url));assert.equal(buffer.subarray(0,4).toString(),'RIFF');assert.equal(buffer.subarray(8,12).toString(),'WEBP');assert.equal(buffer.length,asset.bytes);total+=buffer.length;}
  }
  assert.ok(total<4000000,'Keep all frame artwork, thumbs and effect maps under 4 MB');
});
