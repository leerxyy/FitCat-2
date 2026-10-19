import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, activeProFixture } from './dom.mjs';
import { WALLET_KEY } from '../js/core/wallet.js';
import { PROFILE_STYLE_KEY } from '../js/core/profile-style.js';
import { COLLECTIBLE_PROFILE_FRAMES } from '../js/core/profile-frames.js';

test('collectible frames preview, purchase, save and animate independently of PRO+',async t=>{
  const at=Date.now(),balance=2000;
  const env=setupDOM({fitnessProfile:JSON.stringify({name:'Meow',age:20,gender:'male',height:165,weight:52,goal:'maintain'}),lastDate:new Date().toDateString(),[WALLET_KEY]:JSON.stringify({version:1,balance,entries:[{id:'old-coins',kind:'promo',amount:balance,at,balanceAfter:balance}],redeemed:[],subscription:null})});
  const $=id=>document.getElementById(id);
  const click=async selector=>{const node=document.querySelector(selector);assert.ok(node,selector);node.click();await tick();await tick();};
  const close=async()=>{$('profileFrameModal').dispatchEvent(new Event('cancel',{cancelable:true}));await tick();await tick();};
  try{
    await import('../js/app.js');
    const {state,loadState}=await import('../js/core/store.js');
    const {getWallet}=await import('../js/features/wallet.js');
    const {renderProfileStyle,syncProfileStyleMotion}=await import('../js/features/profile-style.js');
    await click('[data-action="showProfile"]');await click('#profileFrameEdit');
    await t.test('all five paid tiles have visible coin icons and are separate from PRO+ frames',()=>{
      assert.equal($('profileFrameModal').querySelectorAll('.collectible-choice').length,5);
      for(const id of COLLECTIBLE_PROFILE_FRAMES){const tile=$('frameChoice_'+id);assert.equal(tile.hasAttribute('data-pro-feature'),false);assert.equal(tile.querySelector('[data-frame-price]').textContent,'229');assert.ok(tile.querySelector('.city-choice-price img'));}
    });
    await t.test('every detailed preview uses its own artwork and effects without spending or changing the saved avatar',async()=>{
      const wallet=env.localStorage.getItem(WALLET_KEY),style=env.localStorage.getItem(PROFILE_STYLE_KEY);
      for(const id of COLLECTIBLE_PROFILE_FRAMES){
        await click('#frameChoice_'+id);
        assert.equal($('subscriptionDialog').open,false);assert.equal($('framePickerFrame').dataset.frame,id);assert.equal($('framePickerFrame').dataset.collectible,'true');assert.equal($('frameStylePreview').dataset.collectible,'true');
        assert.match($('framePickerFrame').style.getPropertyValue('--collectible-art'),new RegExp('profile-frames/'+id+'\\.webp'));assert.ok($('framePickerFrame').querySelector('.collectible-details svg'));
        const image=$('framePickerFrame').querySelector('img.collectible-art');
        assert.ok(image,'Artwork must be a real image element, not only a CSS background');
        assert.match(image.getAttribute('src'),new RegExp('^file:.*?/assets/profile-frames/'+id+'\\.webp$'));
        for(const property of ['--collectible-art','--collectible-light','--collectible-aura']){
          const value=$('framePickerFrame').style.getPropertyValue(property);
          assert.match(value,/^url\("file:\/\//,'Every inherited CSS image value must be absolute');
          const actual=JSON.parse(value.slice(4,-1));
          assert.equal(new URL(actual,'https://example.test/FitCat-2/styles/profile-collectibles.css').href,actual);
        }
        assert.equal(state.profileStyle.frame,'ice');assert.equal($('profileAvatarFrame').dataset.frame,'ice');
        assert.equal(env.localStorage.getItem(WALLET_KEY),wallet);assert.equal(env.localStorage.getItem(PROFILE_STYLE_KEY),style);
      }
      await click('#collectibleFrameReturn');assert.equal($('collectibleFrameOffer').hidden,true);assert.equal($('framePickerFrame').dataset.frame,'ice');
      await click('#frameChoice_dragon');await close();await click('#profileFrameEdit');assert.equal($('framePickerFrame').dataset.frame,'ice');
    });
    await t.test('an explicit double-tapped purchase debits exactly 229 and displays a named receipt',async()=>{
      await click('#frameChoice_dragon');$('collectibleFrameBuy').click();$('collectibleFrameBuy').click();await tick();await tick();
      assert.equal(getWallet().snapshot().balance,1771);assert.deepEqual(getWallet().ownedFrames(),['dragon']);assert.equal(state.profileStyle.frame,'dragon');
      assert.equal($('profileAvatarFrame').dataset.frame,'dragon');assert.equal($('headerAvatarFrame').dataset.frame,'dragon');assert.equal($('profileIdentityCard').dataset.collectibleFrame,'true');
      assert.match($('profileAvatarFrame').querySelector('img.collectible-art').getAttribute('src'),/\/assets\/profile-frames\/dragon.webp$/);
      assert.match($('headerAvatarFrame').querySelector('img.collectible-art').getAttribute('src'),/\/assets\/profile-frames\/dragon-thumb.webp$/);
      assert.equal($('collectibleFramePurchase').hidden,true);assert.equal($('frameChoice_dragon').dataset.owned,'true');assert.equal($('frameChoice_dragon').querySelector('[data-frame-price]').textContent,'Куплено');
      assert.match($('walletHistoryList').textContent,/Рамка · Небесный дракон/);assert.doesNotMatch($('walletHistoryList').textContent,/PRO\+ · undefined/);
      assert.match($('headerAvatarFrame').style.getPropertyValue('--collectible-art'),/dragon-thumb/);assert.equal($('headerAvatarFrame').querySelector('.collectible-details').children.length,0);
    });
    await t.test('reset, reload and PRO+ expiration leave the paid frame available without another debit',async()=>{
      const saved=env.localStorage.getItem(WALLET_KEY);loadState(env.localStorage);renderProfileStyle();assert.equal($('profileAvatarFrame').dataset.frame,'dragon');
      await click('#profileFrameModal [data-action="resetProfileStyle"]');assert.equal(state.profileStyle.frame,'ice');
      await click('#frameChoice_dragon');assert.equal(state.profileStyle.frame,'dragon');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);
      for(const [key,value] of Object.entries(activeProFixture()))env.localStorage.setItem(key,value);
      document.dispatchEvent(new Event('fitcat:subscription'));await tick();env.localStorage.removeItem('fitcat_subscription_v1');document.dispatchEvent(new Event('fitcat:subscription'));await tick();
      assert.equal($('profileAvatarFrame').dataset.frame,'dragon');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);
    });
    await t.test('a failed debit preserves both profile and funds, and retry purchases once',async()=>{
      await click('#frameChoice_chronos');const saved=env.localStorage.getItem(WALLET_KEY),write=env.localStorage.setItem;
      env.localStorage.setItem=(key,value)=>{if(key===WALLET_KEY)throw new Error('quota');write(key,value);};
      try{await click('#collectibleFrameBuy');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);assert.equal(state.profileStyle.frame,'dragon');assert.equal($('collectibleFrameError').hidden,false);}finally{env.localStorage.setItem=write;}
      await click('#collectibleFrameBuy');assert.equal(state.profileStyle.frame,'chronos');assert.equal(getWallet().snapshot().balance,1542);
      assert.equal($('profileAvatarFrame').querySelectorAll('.collectible-gear').length,4);
    });
    await t.test('a failed avatar save after payment leaves a free Apply action and its receipt',async()=>{
      await click('#frameChoice_eclipse');const write=env.localStorage.setItem;
      env.localStorage.setItem=(key,value)=>{if(key===PROFILE_STYLE_KEY)throw new Error('quota');write(key,value);};
      try{await click('#collectibleFrameBuy');assert.equal(state.profileStyle.frame,'chronos');assert.equal(getWallet().snapshot().balance,1313);assert.equal($('collectibleFrameApply').hidden,false);assert.equal($('collectibleFrameError').hidden,false);}finally{env.localStorage.setItem=write;}
      const saved=env.localStorage.getItem(WALLET_KEY);await click('#collectibleFrameApply');assert.equal(state.profileStyle.frame,'eclipse');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);assert.equal($('collectibleFrameError').hidden,true);
    });
    await t.test('insufficient funds cannot charge or equip; a receipt from another tab unlocks Apply',async()=>{
      const saved=env.localStorage.getItem(WALLET_KEY);env.localStorage.removeItem(WALLET_KEY);await click('#frameChoice_frostcrown');assert.equal($('collectibleFrameBuy').disabled,true);assert.equal($('collectibleFrameShortfallAmount').textContent,'229');
      await click('#collectibleFrameBuy');assert.equal(env.localStorage.getItem(WALLET_KEY),null);assert.equal(state.profileStyle.frame,'eclipse');
      env.localStorage.setItem(WALLET_KEY,saved);await getWallet().purchaseFrame('frostcrown');const event=new Event('storage');Object.defineProperty(event,'key',{value:WALLET_KEY});window.dispatchEvent(event);await tick();
      assert.equal($('collectibleFramePurchase').hidden,true);assert.equal($('collectibleFrameApply').hidden,false);assert.equal(state.profileStyle.frame,'eclipse');
      const paid=env.localStorage.getItem(WALLET_KEY);await click('#collectibleFrameApply');assert.equal(state.profileStyle.frame,'frostcrown');assert.equal(env.localStorage.getItem(WALLET_KEY),paid);
    });
    await t.test('visible hero motion keeps one phase and pauses on hidden or reduced-motion screens',async()=>{
      await close();const media=globalThis.matchMedia,animation={animationName:'profile-collectible-star',currentTime:0};let seeks=0;
      $('framePickerFrame').getAnimations=()=>{seeks++;return[animation];};globalThis.matchMedia=()=>({matches:false});
      try{
        await click('#profileFrameEdit');syncProfileStyleMotion();assert.equal($('framePickerFrame').dataset.live,'true');assert.equal($('profileAvatarFrame').dataset.live,'false');
        const first=animation.currentTime,details=$('framePickerFrame').querySelector('.collectible-details').firstElementChild,count=seeks;
        assert.ok(first>0);renderProfileStyle();assert.equal(seeks,count);assert.equal($('framePickerFrame').querySelector('.collectible-details').firstElementChild,details);
        await close();animation.currentTime=0;await click('#profileFrameEdit');assert.ok(animation.currentTime>=first);
        Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));assert.equal($('framePickerFrame').dataset.live,'false');
        Object.defineProperty(document,'hidden',{value:false,configurable:true});globalThis.matchMedia=()=>({matches:true});syncProfileStyleMotion();assert.equal($('framePickerFrame').dataset.live,'false');
      }finally{globalThis.matchMedia=media;delete $('framePickerFrame').getAnimations;}
    });
    await t.test('translated titles and prices preserve the saved frame and its ownership',async()=>{
      for(const [lang,title]of [['en','Frost Crown'],['cn','冰霜王冠'],['ru','Ледяная корона']]){state.preferences.lang=lang;document.dispatchEvent(new Event('fitcat:language'));await tick();assert.equal($('collectibleFrameTitle').textContent,title);assert.equal(state.profileStyle.frame,'frostcrown');assert.equal($('collectibleFramePrice').textContent,'229');}
    });
  }finally{env.restoreTimers();}
});
