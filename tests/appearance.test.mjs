import test from 'node:test';
import assert from 'node:assert/strict';
import { APPEARANCE_KEY, APPEARANCE_DEFAULTS, ACCENTS, THEME_PRESETS, normalizeAppearance, effectiveAppearance, appearanceTimings, isDefaultAppearance } from '../js/core/appearance.js';
import { state, loadState, persist, setAppearance, exportSnapshot, importSnapshot, clearAccount } from '../js/core/store.js';
const profile={name:'Тест',age:20,gender:'male',height:180,weight:80,goal:'maintain'};
function storage(seed={}) {const map=new Map(Object.entries(seed));return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),map};}

test('missing, malformed or untrusted appearance restores whitelisted defaults without accepting image URLs',()=>{
 for(const value of [null,[],false,'url(https://example.com)'])assert.deepEqual(normalizeAppearance(value),APPEARANCE_DEFAULTS);
 const value=normalizeAppearance({theme:'__proto__',accent:'red; color: red',background:'data:image/png;base64,xxx',effect:'unknown',motion:'fast',parallax:'yes',blur:Infinity,speed:NaN,glow:500,depth:-20,transparency:100});
 assert.equal(value.background,'ocean');assert.equal(value.accent,'cyan');assert.equal(value.theme,'ocean');assert.equal(value.motion,'standard');assert.equal(value.glow,80);assert.equal(value.depth,0);assert.equal(value.transparency,70);assert.equal(value.blur,0);
});
test('every preset is complete and independent of the frozen default settings',()=>{
 for(const [id,preset] of Object.entries(THEME_PRESETS)){assert.deepEqual(normalizeAppearance(preset),preset);assert.equal(preset.theme,id);assert.ok(ACCENTS[preset.accent]);}
 const value=normalizeAppearance(APPEARANCE_DEFAULTS);value.glow=80;assert.equal(APPEARANCE_DEFAULTS.glow,35);assert.equal(THEME_PRESETS.ocean.glow,35);
});
test('background speed and highlight speed are independent, bounded and reversible',()=>{
 const standard=appearanceTimings(APPEARANCE_DEFAULTS);assert.equal(standard.glint,6000);
 const slow=appearanceTimings({...APPEARANCE_DEFAULTS,glintSpeed:0}),fast=appearanceTimings({...APPEARANCE_DEFAULTS,glintSpeed:100});
 assert.equal(slow.glint,18000);assert.equal(fast.glint,2000);assert.equal(slow.background,fast.background);
 assert.equal(appearanceTimings({...APPEARANCE_DEFAULTS,speed:100}).glint,6000);
 assert.ok(appearanceTimings({...APPEARANCE_DEFAULTS,speed:100}).background<appearanceTimings({...APPEARANCE_DEFAULTS,speed:0}).background);
});
test('PRO expiry applies a safe fallback without erasing the stored premium choice',()=>{
 const requested={...THEME_PRESETS.aurora,glintSpeed:80};const snapshot=structuredClone(requested);
 const basic=effectiveAppearance(requested,false);assert.equal(basic.background,'ocean');assert.equal(basic.theme,'ocean');assert.equal(basic.glintSpeed,80);
 assert.deepEqual(requested,snapshot);assert.equal(effectiveAppearance(requested,true).background,'aurora');
 assert.equal(effectiveAppearance({...APPEARANCE_DEFAULTS,theme:'custom',background:'cosmos'},false).background,'ocean');
});
test('saving an appearance writes only its key and survives a complete reload',()=>{
 const adapter=storage({fitnessProfile:JSON.stringify(profile),fitcat_wallet_v1:'keep-wallet',profilePhoto:'data:image/png;base64,existing'});loadState(adapter);
 const before=new Map(adapter.map);setAppearance({...APPEARANCE_DEFAULTS,accent:'amber',background:'mountains',glintSpeed:75});
 for(const [key,value] of before)assert.equal(adapter.getItem(key),value,key);
 loadState(adapter);assert.equal(state.appearance.background,'mountains');assert.equal(state.appearance.glintSpeed,75);assert.equal(adapter.getItem('fitcat_wallet_v1'),'keep-wallet');
});
test('70% transparency and the tilt opt-in survive reload with all legacy appearance fields',()=>{
 const adapter=storage({[APPEARANCE_KEY]:JSON.stringify({...APPEARANCE_DEFAULTS,transparency:70,background:'forest',deviceTilt:true})});
 loadState(adapter);assert.equal(state.appearance.transparency,70);assert.equal(state.appearance.deviceTilt,true);assert.equal(state.appearance.background,'forest');
 persist();loadState(adapter);assert.equal(state.appearance.transparency,70);
 adapter.setItem(APPEARANCE_KEY,JSON.stringify({theme:'ocean',transparency:70,parallax:true}));loadState(adapter);
 assert.equal(state.appearance.transparency,70);assert.equal(state.appearance.deviceTilt,false,'an old record must not silently opt in to sensors');
});
test('a failed write retains the last saved appearance in both memory and storage',()=>{
 const adapter=storage();loadState(adapter);setAppearance({...APPEARANCE_DEFAULTS,glow:50});const before=structuredClone(state.appearance),saved=adapter.getItem(APPEARANCE_KEY),write=adapter.setItem;
 adapter.setItem=(key,value)=>{if(key===APPEARANCE_KEY)throw new Error('quota');write(key,value);};
 assert.throws(()=>setAppearance({...APPEARANCE_DEFAULTS,background:'dark'}),/quota/);assert.deepEqual(state.appearance,before);assert.equal(adapter.getItem(APPEARANCE_KEY),saved);
});
test('default reset leaves the profile, diary, photo, wallet and subscription byte-for-byte intact',()=>{
 const adapter=storage({fitnessProfile:JSON.stringify(profile),todayFoods:'[]',profilePhoto:'data:image/png;base64,existing',fitcat_wallet_v1:'coins',fitcat_subscription_v1:'subscription'});loadState(adapter);
 setAppearance(THEME_PRESETS.amethyst);const before=new Map(adapter.map);setAppearance(APPEARANCE_DEFAULTS);
 assert.equal(isDefaultAppearance(state.appearance),true);for(const [key,value] of before)if(key!==APPEARANCE_KEY)assert.equal(adapter.getItem(key),value,key);
});
test('backup round trips appearance; old backups preserve current appearance and failed imports roll it back',()=>{
 const adapter=storage({fitnessProfile:JSON.stringify(profile)});loadState(adapter);setAppearance({...APPEARANCE_DEFAULTS,accent:'blue',speed:70});persist();
 const backup=structuredClone(exportSnapshot());setAppearance(APPEARANCE_DEFAULTS);importSnapshot(backup);loadState(adapter);assert.equal(state.appearance.accent,'blue');
 importSnapshot({profile,foods:[],weight:[]});assert.equal(state.appearance.speed,70);
 const before=structuredClone(state.appearance),write=adapter.setItem;
 adapter.setItem=(key,value)=>{if(key==='lastDate')throw new Error('quota');write(key,value);};
 assert.throws(()=>importSnapshot({...backup,appearance:THEME_PRESETS.aurora}),/quota/);assert.deepEqual(state.appearance,before);assert.deepEqual(JSON.parse(adapter.getItem(APPEARANCE_KEY)),before);
});
test('account deletion clears appearance but keeps another application and wallet storage intact',()=>{
 const adapter=storage({another_app:'keep',fitcat_wallet_v1:'wallet'});loadState(adapter);setAppearance(THEME_PRESETS.amethyst);clearAccount();
 assert.equal(adapter.getItem(APPEARANCE_KEY),null);assert.equal(adapter.getItem('another_app'),'keep');assert.equal(adapter.getItem('fitcat_wallet_v1'),'wallet');
});
