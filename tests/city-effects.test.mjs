import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CITY_EFFECTS, CITY_LAYER_SUFFIXES, cityEffectAssets, cityTrafficMarkup } from '../js/core/profile-city-effects.js';
import { CITY_PROFILE_COVERS, canonicalCityCover } from '../js/core/profile-cities.js';
import { normalizeProfileStyle, effectiveProfileStyle } from '../js/core/profile-style.js';
import { createWallet, WALLET_KEY } from '../js/core/wallet.js';
import { loadState, state, exportSnapshot, importSnapshot } from '../js/core/store.js';

const now=Date.UTC(2026,9,19), profile={name:'Meow',age:20,gender:'male',height:165,weight:52,goal:'maintain'};
function legacyWallet() {
  const value={version:1,balance:701,entries:[{id:'credit',kind:'promo',amount:1000,at:now,balanceAfter:1000},{id:'old-tokyo',kind:'profile-cover',cover:'tokyo',amount:-299,at:now+1,balanceAfter:701}],redeemed:[],subscription:null};
  const map=new Map([[WALLET_KEY,JSON.stringify(value)],['fitnessProfile',JSON.stringify(profile)],['fitcat_profile_style_v1',JSON.stringify({frame:'jade',cover:'tokyo'})]]);
  return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}

test('all four approved cities have separate bounded light, facade and river geometry',()=>{
  assert.deepEqual(CITY_PROFILE_COVERS,['chongqing','moscow','dubai','hongkong']);
  for(const city of CITY_PROFILE_COVERS){
    const cfg=CITY_EFFECTS[city];assert.equal(CITY_LAYER_SUFFIXES.length,6);
    for(const polygon of [cfg.water,...cfg.glass]){
      assert.ok(polygon.length>=3);
      for(const point of polygon)for(const number of point)assert.ok(Number.isFinite(number)&&number>=0&&number<=1);
    }
    assert.equal(cfg.fog.length,3);
    const assets=Object.values(cityEffectAssets(city));assert.equal(assets.length,6);
    for(const asset of assets)assert.ok(existsSync(new URL('../'+asset,import.meta.url)),asset);
  }
  assert.deepEqual(cityEffectAssets('https://evil.test/'),{});assert.equal(cityTrafficMarkup('unknown'),'');
});
test('the moving light routes are few, native SVG strokes with matched endpoints',()=>{
  assert.equal(CITY_EFFECTS.dubai.routes.length,6);assert.equal(CITY_EFFECTS.hongkong.routes.length,2);
  assert.equal(CITY_EFFECTS.moscow.routes.length,2);assert.equal(CITY_EFFECTS.chongqing.routes.length,0);
  for(const city of CITY_PROFILE_COVERS){
    const markup=cityTrafficMarkup(city);assert.doesNotMatch(markup,/<(?:script|filter|animate|foreignObject)/i);
    assert.equal((markup.match(/pathLength="100"/g)||[]).length,CITY_EFFECTS[city].routes.length*2);
  }
});
test('a paid Tokyo receipt grants Hong Kong without rewriting the ledger or charging twice',async()=>{
  const storage=legacyWallet(),wallet=createWallet(storage),before=storage.getItem(WALLET_KEY);
  assert.deepEqual(wallet.ownedCovers(),['hongkong']);assert.equal(canonicalCityCover('tokyo'),'hongkong');
  await wallet.purchaseCover('hongkong',{now:now+3,operationId:'new-request'});
  await wallet.purchaseCover('hongkong',{now:now+3,operationId:'old-tokyo'});
  assert.equal(storage.getItem(WALLET_KEY),before);assert.equal(wallet.snapshot().balance,701);
  assert.deepEqual(normalizeProfileStyle({frame:'jade',cover:'tokyo'}),{frame:'jade',cover:'hongkong'});
  assert.equal(effectiveProfileStyle({cover:'tokyo'},false,wallet.ownedCovers()).cover,'hongkong');
  await assert.rejects(wallet.purchaseCover('tokyo',{now}),/wallet_invalid_purchase/);
});
test('old backups restore the replacement cover with the original valid paid ledger',()=>{
  const storage=legacyWallet();loadState(storage);
  assert.equal(state.profileStyle.cover,'hongkong');const backup=structuredClone(exportSnapshot());
  backup.profileStyle.cover='tokyo';importSnapshot(backup);loadState(storage);
  assert.equal(state.profileStyle.cover,'hongkong');assert.deepEqual(createWallet(storage).ownedCovers(),['hongkong']);
  assert.equal(createWallet(storage).snapshot().entries.at(-1).cover,'tokyo');
});
test('approved masters and every generated effect are recorded as generated art, with no rejected city photography',()=>{
  const sources=JSON.parse(readFileSync(new URL('../assets/profile-covers/cities.sources.json',import.meta.url),'utf8'));
  assert.deepEqual(sources.map(x=>x.city),CITY_PROFILE_COVERS);
  for(const source of sources){assert.equal(source.generated,true);assert.match(source.master_sha256,/^[a-f0-9]{64}$/);assert.equal(source.assets.length,8);assert.equal(source.author,undefined);}
  assert.equal(existsSync(new URL('../assets/profile-covers/tokyo.webp',import.meta.url)),false);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/commons\.wikimedia|cityCoverCreditSource|cityCoverCreditLicense/);
});
test('effects share visibility pause and reduced motion, with zero new frame loops or sensor listeners',()=>{
  const css=readFileSync(new URL('../styles/profile-cities.css',import.meta.url),'utf8');
  assert.match(css,/\.profile-scene \.city-route path[^}]+animation-play-state: var\(--cosmetic-play\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  const core=readFileSync(new URL('../js/core/profile-city-effects.js',import.meta.url),'utf8');
  assert.doesNotMatch(core,/requestAnimationFrame|deviceorientation|devicemotion|setInterval|feTurbulence/);
  assert.doesNotMatch(css,/(?:filter|backdrop-filter)\s*:/);
});
