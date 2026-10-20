import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENT_IDS, STABILITY_LEVELS, collectAchievements, normalizeAchievements, achievementProgress, longestRun, ACHIEVEMENTS_KEY } from '../js/core/achievements.js';
import { loadState, state, persist, activateDeveloper, exportSnapshot, importSnapshot, clearAccount, isDeveloperCommand } from '../js/core/store.js';
import { createWallet, WALLET_KEY, DEVELOPER_COINS } from '../js/core/wallet.js';

const now=new Date('2026-10-20T12:00:00Z');
const profile={name:'Meow',age:20,gender:'male',height:165,weight:52,goal:'maintain'};
const product=name=>({name,kcal:100,protein:4,fat:3,carbs:8});
const day=index=>{const d=new Date(now);d.setUTCDate(d.getUTCDate()-index);return d.toISOString().slice(0,10);};
const history=count=>Array.from({length:count},(_,i)=>({date:day(i),kcal:0,protein:0,fat:0,carbs:0,foodCount:1}));
const data=(nutrition=[],other={})=>({profile,foods:[],nutrition,templates:[],products:[],...other});
const storage=(seed={})=>{const map=new Map(Object.entries(seed));return{map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};};

test('stability has exactly 7, 30, 60 and 90 day tiers; no annual tier or atlas sprite exists',()=>{
 assert.deepEqual(STABILITY_LEVELS,[7,30,60,90]);assert.equal(ACHIEVEMENT_IDS.length,8);assert.ok(!ACHIEVEMENT_IDS.includes('stable365'));
});
test('opening the app and empty archived days award nothing',()=>{
 const result=collectAchievements(null,data([{date:day(0),kcal:0}]),now);assert.equal(result.days.length,0);assert.deepEqual(result.unlocked,{});
});
test('food entries migrate from real history, duplicate dates count once and future/invalid dates never count',()=>{
 const result=collectAchievements(null,data([{date:day(0),kcal:20},{date:day(0),kcal:40},{date:'2026-02-31',kcal:30},{date:'2099-10-20',foodCount:1}]),now);
 assert.deepEqual(result.days,[day(0)]);assert.ok(result.unlocked.first);
});
test('7 consecutive logged days unlock rhythm, gaps preserve total-day progress but do not invent a streak',()=>{
 const seven=collectAchievements(null,data(history(7)),now);assert.ok(seven.unlocked.rhythm);assert.ok(seven.unlocked.stable7);
 const gaps=collectAchievements(null,data(history(14).filter((_,i)=>i%2===0)),now);assert.equal(gaps.days.length,7);assert.ok(gaps.unlocked.stable7);assert.ok(!gaps.unlocked.rhythm);assert.equal(longestRun(gaps.days),1);
});
test('diamond is the maximum tier, and removal of records does not revoke a previously earned shield',()=>{
 const earned=collectAchievements(null,data(history(100)),now);assert.ok(earned.unlocked.stable90);
 const later=collectAchievements(earned,data(),now);assert.equal(later.days.length,100);assert.deepEqual(later.unlocked,earned.unlocked);assert.equal(achievementProgress(later,'stable90').target,90);
});
test('templates and five distinct personal foods require complete macro fields and ignore duplicate names',()=>{
 let result=collectAchievements(null,data([], {products:[product('Rice'),product('rice'),product('Oats'),product('Apple'),product('Milk')],templates:[{foods:[product('A'),product('B')]}]}),now);
 assert.ok(!result.unlocked.choice);assert.ok(!result.unlocked.balance);
 result=collectAchievements(result,data([], {products:[product('Egg'),{name:'Bad',kcal:1}],templates:[{foods:[product('A'),product('B'),product('C')]}]}),now);
 assert.ok(result.unlocked.choice);assert.ok(result.unlocked.balance);
});
test('malformed achievements cannot inject other badges, day counts or invalid timestamps',()=>{
 const value=normalizeAchievements({days:['bad','2099-01-01',day(0),day(0)],unlocked:{stable365:{at:1},first:{at:-1}},developer:'true'},now);
 assert.deepEqual(value.days,[day(0)]);assert.deepEqual(value.unlocked,{});assert.equal(value.developer,false);
});
test('developer command grants all badges, 999999 coins and 99 calendar years once, including concurrent calls',async()=>{
 const adapter=storage({fitnessProfile:JSON.stringify(profile),lastDate:now.toDateString()});loadState(adapter);
 const before=Date.parse('2026-10-20T12:00:00Z');
 await Promise.all(Array.from({length:6},()=>activateDeveloper('Meow /dev',before)));
 const wallet=createWallet(adapter).snapshot();assert.equal(wallet.balance,DEVELOPER_COINS);assert.equal(wallet.entries.length,1);assert.equal(new Date(wallet.subscription.expiresAt).toISOString(),'2125-10-20T12:00:00.000Z');
 assert.ok(createWallet(adapter).status(before).active);assert.equal(state.profile.name,'Meow');assert.equal(state.achievements.developer,true);assert.equal(Object.keys(state.achievements.unlocked).length,8);assert.equal(state.achievements.days.length,0);
 loadState(adapter);await activateDeveloper('/dev',before+86400000);assert.equal(createWallet(adapter).snapshot().balance,DEVELOPER_COINS);assert.equal(createWallet(adapter).snapshot().subscription.expiresAt,wallet.subscription.expiresAt);
});
test('developer credit preserves prior coins, purchases, profile and unrelated preferences',async()=>{
 const at=now.getTime(),adapter=storage({fitnessProfile:JSON.stringify(profile),lastDate:now.toDateString(),unrelated:'keep',fitcat_low_detail_mode_v1:'true',[WALLET_KEY]:JSON.stringify({version:1,balance:100,entries:[{id:'old-credit',kind:'promo',amount:100,at,balanceAfter:100}],redeemed:[],subscription:null})});
 loadState(adapter);await activateDeveloper('/dev',at);assert.equal(createWallet(adapter).snapshot().balance,100+DEVELOPER_COINS);assert.equal(adapter.getItem('unrelated'),'keep');assert.equal(state.preferences.lowDetailMode,true);assert.equal(state.profile.weight,52);
});
test('every stage of a failed developer write rolls back memory, wallet, profile and badges',async()=>{
 for(const failure of ['fitnessProfile',ACHIEVEMENTS_KEY,WALLET_KEY]){
  const adapter=storage({fitnessProfile:JSON.stringify(profile),lastDate:now.toDateString()});loadState(adapter);persist();const saved=new Map(adapter.map),before=structuredClone(state),write=adapter.setItem;let failed=false;
  adapter.setItem=(key,value)=>{if(key===failure&&!failed){failed=true;throw Error('quota');}write(key,value);};
  await assert.rejects(activateDeveloper('New /dev',now.getTime()),/quota/);assert.deepEqual(adapter.map,saved);assert.deepEqual(state,before);
 }
});
test('developer command token avoids ordinary names, and supports a standalone command or a suffix',async()=>{
 assert.equal(isDeveloperCommand('Meow/dev'),true);assert.equal(isDeveloperCommand('/DEV'),true);assert.equal(isDeveloperCommand('/device'),false);assert.equal(isDeveloperCommand('developer'),false);
 const adapter=storage({fitnessProfile:JSON.stringify(profile)});loadState(adapter);assert.equal(await activateDeveloper('/device'),null);assert.equal(adapter.getItem(WALLET_KEY),null);
});
test('new achievement data and the developer wallet survive backup and reload; deleting the profile clears achievements only',async()=>{
 const adapter=storage({fitnessProfile:JSON.stringify(profile),lastDate:now.toDateString(),another_app:'keep'});loadState(adapter);await activateDeveloper('/dev',now.getTime());
 const snapshot=structuredClone(exportSnapshot());state.achievements=normalizeAchievements(null);importSnapshot(snapshot);loadState(adapter);assert.equal(state.achievements.developer,true);assert.equal(createWallet(adapter).snapshot().balance,DEVELOPER_COINS);
 const wallet=adapter.getItem(WALLET_KEY);clearAccount();assert.equal(adapter.getItem(ACHIEVEMENTS_KEY),null);assert.equal(adapter.getItem(WALLET_KEY),wallet);assert.equal(adapter.getItem('another_app'),'keep');
});
