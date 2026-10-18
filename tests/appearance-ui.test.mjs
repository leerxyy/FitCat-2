import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { setupDOM, tick, activeProFixture } from './dom.mjs';
import { APPEARANCE_KEY, APPEARANCE_DEFAULTS, ACCENTS } from '../js/core/appearance.js';

test('Appearance integrates all mockup controls with live app styles, storage, PRO access and reset',async t=>{
 const env=setupDOM({fitnessProfile:JSON.stringify({name:'Meow',age:20,gender:'male',height:180,weight:80,goal:'maintain'}),lastDate:new Date().toDateString(),waterAmount:'750',profilePhoto:'data:image/png;base64,existing'});
 let tiltPermission='granted',tiltRequests=0;
 window.DeviceOrientationEvent=class{static async requestPermission(){tiltRequests++;return tiltPermission;}};
 const $=id=>document.getElementById(id),root=document.documentElement;
 const click=async selector=>{const node=document.querySelector(selector);assert.ok(node,selector);const event=new Event('click',{bubbles:true,cancelable:true});Object.defineProperty(event,'detail',{value:0});node.dispatchEvent(event);await tick();await tick();};
 const range=(key,value)=>{const node=$('appearancePage').querySelector(`[data-appearance-range="${key}"]`);node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return node;};
 const toggle=(key,value)=>{const node=$('appearancePage').querySelector(`[data-appearance-toggle="${key}"]`);node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}));return node;};
 const choice=(kind,value)=>click(`#appearancePage [data-appearance-kind="${kind}"][data-value="${value}"]`);
 try{
  await import('../js/app.js');const {state}=await import('../js/core/store.js');const {renderAppearance}=await import('../js/features/appearance.js');
  await click('[data-action="showProfile"]');await click('#profilePage [data-value="settingsPage"]');await click('#openAppearance');
  await t.test('opens from Settings, uses the original logo and has no background upload or Save buttons',()=>{
   assert.equal($('appearancePage').hidden,false);assert.equal($('navDock').hidden,true);assert.equal(document.activeElement,$('appearanceTitle'));
   assert.equal($('appearancePage').querySelectorAll('[data-appearance-kind="theme"]').length,9);
   assert.equal($('appearancePage').querySelectorAll('[data-appearance-kind="background"]').length,10);
   assert.equal($('appearancePage').querySelectorAll('[data-appearance-kind="accent"]').length,12);
   assert.equal($('appearancePage').querySelectorAll('[data-appearance-kind="effect"]').length,4);
   assert.equal($('appearancePage').querySelector('input[type="file"]'),null);assert.equal($('appearancePage').querySelector('[data-i18n="save"]'),null);
   for(const img of $('appearancePage').querySelectorAll('img'))assert.equal(img.getAttribute('src'),'assets/icons/logo.svg');
   assert.equal($('appearanceStylePanel').hidden,false);assert.equal($('appearanceBackgroundPanel').hidden,true);
  });
  await t.test('free color and glass choices save immediately and update the actual app instead of just the preview',async()=>{
   await choice('accent','amber');assert.equal(state.appearance.accent,'amber');assert.equal(root.style['--accent'],'#ffd079');assert.equal(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)).accent,'amber');
   range('transparency',60);assert.equal(root.style['--appearance-glass-alpha'],'0.4');assert.equal(state.appearance.transparency,60);
   range('glow',0);assert.equal(root.style['--appearance-glow-alpha'],'0');assert.equal(state.water,750);assert.equal(state.profile.name,'Meow');
   assert.equal(root.dataset.accent,'amber');assert.equal(root.style['--tone-h16cff3'],undefined);assert.equal($('appearanceSaveStatus').dataset.error,'false');
  });
  await t.test('a continuous drag previews 70% without writing per event or being reset by a rerender or theme change',async()=>{
   const input=$('appearancePage').querySelector('[data-appearance-range="transparency"]'),write=env.localStorage.setItem;
   const initial=env.localStorage.getItem(APPEARANCE_KEY);let writes=0;
   env.localStorage.setItem=(key,value)=>{if(key===APPEARANCE_KEY)writes++;return write(key,value);};
   try{
    input.focus();for(let value=15;value<=70;value++){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
    assert.equal(writes,0);assert.equal(env.localStorage.getItem(APPEARANCE_KEY),initial);assert.equal(input.value,'70');assert.equal(root.style['--appearance-glass-alpha'],'0.3');
    renderAppearance();assert.equal(input.value,'70');assert.equal($(input.id+'Output').textContent,'70%');
    input.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(writes,1);assert.equal(state.appearance.transparency,70);assert.equal(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)).transparency,70);
   }finally{env.localStorage.setItem=write;}
   await choice('theme','forest');assert.equal(state.appearance.transparency,70);assert.equal(input.value,'70');assert.equal(root.style['--appearance-glass-alpha'],'0.3');
   await choice('background','mountains');await choice('accent','rose');assert.equal(state.appearance.transparency,70);
  });
  await t.test('all twelve accent choices retain transparency and use one precomputed palette selector',async()=>{
   for(const [key,value] of Object.entries(ACCENTS)){await choice('accent',key);assert.equal(root.style['--accent'],value.color);assert.equal(root.dataset.accent,key);assert.equal(state.appearance.transparency,70);}
   assert.equal(root.style['--tone-h16cff3'],undefined);
  });
  await t.test('card glass remains identical after the real autosave delay and after reopening Appearance',async()=>{
   const input=$('appearancePage').querySelector('[data-appearance-range="transparency"]');
   input.value=50;input.dispatchEvent(new Event('input',{bubbles:true}));
   assert.equal(root.dataset.appearanceAdjusting,'on');
   const material=root.style['--appearance-glass-filter'];assert.match(material,/^blur\(/);
   await delay(280);assert.equal(root.dataset.appearanceAdjusting,'off');assert.equal(root.style['--appearance-glass-filter'],material);assert.equal(root.style['--appearance-glass-alpha'],'0.5');
   input.value=70;input.dispatchEvent(new Event('input',{bubbles:true}));assert.equal(root.style['--appearance-glass-filter'],'none');
   await delay(280);assert.equal(root.style['--appearance-glass-filter'],'none');assert.equal(root.style['--appearance-glass-alpha'],'0.3');assert.equal(state.appearance.transparency,70);
   await click('[data-action="appearanceBack"]');await click('#openAppearance');
   assert.equal(input.value,'70');assert.equal(root.style['--appearance-glass-filter'],'none');assert.equal(root.style['--appearance-glass-alpha'],'0.3');
  });
  await t.test('unfinished changes are saved when the page is hidden, with no default value written over them',()=>{
   const input=$('appearancePage').querySelector('[data-appearance-range="glow"]');input.value=44;input.dispatchEvent(new Event('input',{bubbles:true}));
   document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)).glow,44);
   document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(input.value,'44');
  });
  await t.test('backgrounds and their independent dim/blur controls persist without offering arbitrary photos',async()=>{
   await click('#appearanceBackgroundTab');assert.equal($('appearanceStylePanel').inert,true);assert.equal($('appearanceBackgroundPanel').hidden,false);
   for(const value of ['mountains','gradient','dark','ocean']){await choice('background',value);assert.equal(root.dataset.background,value);assert.equal(state.appearance.background,value);}
   range('dimming',45);range('blur',20);assert.equal(root.style['--wallpaper-dim'],'0.45');assert.equal(root.style['--wallpaper-blur'],'2px');
   assert.equal(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)).blur,20);
  });
  await t.test('premium themes and backgrounds on Basic open the subscription with an accurate feature description',async()=>{
   const before=env.localStorage.getItem(APPEARANCE_KEY);await choice('background','cosmos');
   assert.equal($('subscriptionDialog').open,true);assert.equal(env.localStorage.getItem(APPEARANCE_KEY),before);
   assert.match($('proFeatureTitle').textContent,/Темы/);assert.match($('proFeatureDescription').textContent,/Космос/);
   await click('#subscriptionDialog [data-sheet-handle]');await click('#appearanceStyleTab');await choice('theme','amethyst');assert.equal($('subscriptionDialog').open,true);
   await click('#subscriptionDialog [data-sheet-handle]');
  });
  await t.test('each animation effect and the two speeds work independently; disabling effects preserves choices',async()=>{
   await click('#appearanceEffectsTab');for(const value of ['particles','waves','aurora','flow']){await choice('effect',value);assert.equal(root.dataset.backgroundEffect,value);}
   range('speed',80);const backgroundDuration=root.style['--background-duration'];range('glintSpeed',100);
   assert.equal(root.style['--shine-duration'],'2000ms');assert.equal(root.style['--background-duration'],backgroundDuration);
   range('glintSpeed',0);assert.equal(root.style['--shine-duration'],'18000ms');range('intensity',70);assert.equal(root.style['--effect-opacity'],'0.7');
   toggle('glints',false);assert.equal(root.dataset.glints,'off');assert.equal($('appearancePage').querySelector('[data-appearance-range="glintSpeed"]').disabled,true);
   toggle('animation',false);assert.equal(root.dataset.backgroundAnimation,'off');assert.equal($('appearancePage').querySelector('[data-appearance-range="speed"]').disabled,true);
   toggle('parallax',false);assert.equal(root.dataset.parallax,'off');assert.equal($('appearancePage').querySelector('[data-appearance-range="depth"]').disabled,true);
   toggle('glints',true);toggle('animation',true);toggle('parallax',true);assert.equal(state.appearance.glintSpeed,0);assert.equal(state.appearance.speed,80);range('depth',70);assert.equal(state.appearance.depth,70);
  });
  await t.test('motion presets and segmented keyboard navigation keep one selected tab',async()=>{
   await click('#appearanceStyleTab');await choice('motion','calm');assert.equal(root.dataset.uiMotion,'calm');await choice('motion','expressive');assert.equal(root.dataset.uiMotion,'expressive');
   const event=new Event('keydown',{bubbles:true,cancelable:true});event.key='End';$('appearanceTabs').dispatchEvent(event);
   assert.equal($('appearanceAudioPanel').hidden,false);assert.equal(document.activeElement,$('appearanceAudioTab'));
   assert.equal($('appearanceTabs').querySelectorAll('[aria-selected="true"]').length,1);
  });
  await t.test('the device-tilt switch requests permission from the gesture, waits for real data and handles denial',async()=>{
   const media=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});
   try{
    assert.equal(tiltRequests,0);renderAppearance();assert.equal($('appearanceDeviceTilt').disabled,false);
    toggle('deviceTilt',true);await tick();await tick();assert.equal(tiltRequests,1);assert.equal(state.appearance.deviceTilt,true);
    assert.equal($('appearanceTiltStatus').dataset.state,'waiting');assert.equal($('appearanceRecenterTilt'),null);assert.equal($('appearanceEnableTilt').hidden,true);
    const event=Object.assign(new Event('deviceorientation'),{beta:45,gamma:0});window.dispatchEvent(event);
    assert.equal($('appearanceTiltStatus').dataset.state,'active');assert.equal($('appearanceEnableTilt').hidden,true);
    toggle('deviceTilt',false);assert.equal(state.appearance.deviceTilt,false);
    tiltPermission='denied';toggle('deviceTilt',true);await tick();await tick();
    assert.equal(state.appearance.deviceTilt,false);assert.equal($('appearanceDeviceTilt').checked,false);assert.equal($('appearanceTiltStatus').dataset.state,'denied');
   }finally{globalThis.matchMedia=media;tiltPermission='granted';}
  });
  await t.test('PRO activation, expiry and renewal change the effective style without erasing the saved premium choice',async()=>{
   for(const [key,value] of Object.entries(activeProFixture()))env.localStorage.setItem(key,value);document.dispatchEvent(new Event('fitcat:subscription'));await tick();
   await click('#appearanceStyleTab');await choice('theme','amethyst');assert.equal(root.dataset.background,'gradient');assert.equal(root.style['--accent'],'#bda0ff');assert.equal(state.appearance.glintSpeed,0);assert.equal(state.appearance.motion,'expressive');assert.equal(state.appearance.transparency,70);
   await click('#appearanceBackgroundTab');await choice('background','cosmos');assert.equal(root.dataset.background,'cosmos');
   const saved=env.localStorage.getItem(APPEARANCE_KEY);env.localStorage.removeItem('fitcat_subscription_v1');document.dispatchEvent(new Event('fitcat:subscription'));await tick();
   assert.equal(root.dataset.background,'ocean');assert.equal(env.localStorage.getItem(APPEARANCE_KEY),saved);assert.equal($('appearanceProNotice').hidden,false);
   for(const [key,value] of Object.entries(activeProFixture()))env.localStorage.setItem(key,value);document.dispatchEvent(new Event('fitcat:subscription'));await tick();assert.equal(root.dataset.background,'cosmos');
  });
  await t.test('the page is translated in all three languages while retaining fields and the original logo',()=>{
   for(const [lang,title] of [['en','Appearance'],['cn','外观'],['ru','Оформление']]){state.preferences.lang=lang;document.dispatchEvent(new Event('fitcat:language'));assert.equal($('appearanceTitle').textContent,title);assert.equal(state.appearance.background,'cosmos');assert.equal($('appearancePage').querySelectorAll('img').length,10);}
  });
  await t.test('a failed autosave reverts the control and reports the error while keeping the saved appearance',()=>{
   const before=structuredClone(state.appearance),write=env.localStorage.setItem,error=console.error;console.error=()=>{};
   env.localStorage.setItem=(key,value)=>{if(key===APPEARANCE_KEY)throw new Error('quota');write(key,value);};
   try{range('glow',70);assert.deepEqual(state.appearance,before);assert.equal($('appearanceSaveStatus').dataset.error,'true');assert.equal($('appearancePage').querySelector('[data-appearance-range="glow"]').value,String(before.glow));}
   finally{env.localStorage.setItem=write;console.error=error;}
   range('glow',69);assert.equal(state.appearance.glow,69);assert.equal($('appearanceSaveStatus').dataset.error,'false');
  });
  await t.test('reset restores every default and retains profile, photo, food, coins, subscription and language',async()=>{
   const before=new Map(env.map);await click('#appearanceReset');assert.deepEqual(state.appearance,APPEARANCE_DEFAULTS);assert.equal(root.dataset.background,'ocean');assert.equal(root.style['--shine-duration'],'6000ms');assert.equal(root.style['--accent'],'#16cff3');assert.equal($('appearanceReset').disabled,true);
   for(const [key,value] of before)if(key!==APPEARANCE_KEY)assert.equal(env.localStorage.getItem(key),value,key);
   await click('[data-action="appearanceBack"]');assert.equal($('settingsPage').hidden,false);assert.equal(document.activeElement,$('settingsTitle'));
  });
  await t.test('ordinary app navigation and water entry still work after changing the appearance',async()=>{
   await click('#settingsBackButton');await click('[data-tab="today"]');const before=state.water;await click('[data-action="addWater"][data-value="250"]');assert.equal(state.water,before+250);
   await click('[data-tab="activity"]');assert.equal($('activityPage').hidden,false);assert.equal($('navDock').hidden,false);renderAppearance();assert.equal($('navDock').hidden,false);
  });
 }finally{env.restoreTimers();}
});
