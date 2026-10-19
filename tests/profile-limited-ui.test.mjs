import test from 'node:test';
import assert from 'node:assert/strict';
import {setupDOM,tick,activeProFixture} from './dom.mjs';
import {WALLET_KEY} from '../js/core/wallet.js';
import {PROFILE_STYLE_KEY} from '../js/core/profile-style.js';
import {LIMITED_PROFILE_FRAMES,LIMITED_PROFILE_COVERS} from '../js/core/profile-limited.js';

test('limited collection supplies real animated previews and explicit, permanent 9999-coin purchases',async t=>{
  const at=Date.now(),balance=100000;
  const env=setupDOM({fitnessProfile:JSON.stringify({name:'Meow',age:20,gender:'male',height:165,weight:52,goal:'maintain'}),lastDate:new Date().toDateString(),[WALLET_KEY]:JSON.stringify({version:1,balance,entries:[{id:'existing-coins',kind:'promo',amount:balance,at,balanceAfter:balance}],redeemed:[],subscription:null})});
  const $=id=>document.getElementById(id),click=async selector=>{const n=document.querySelector(selector);assert.ok(n,selector);n.click();await tick();await tick();};
  const close=async id=>{$(id).dispatchEvent(new Event('cancel',{cancelable:true}));await tick();await tick();};
  const digits=value=>value.replace(/\D/g,'');
  try{
    await import('../js/app.js');
    const {state,loadState}=await import('../js/core/store.js');
    const {getWallet}=await import('../js/features/wallet.js');
    const {renderProfileStyle,syncProfileStyleMotion}=await import('../js/features/profile-style.js');
    // The whole header avatar remains a tap target even when the photograph
    // shrinks to leave space for an ornate frame.
    await click('#headerAvatarWrap');await click('#profileFrameEdit');
    await t.test('three limited frames are separate from the existing five collectibles and from PRO+',()=>{
      assert.equal($('profileFrameModal').querySelectorAll('.limited-choice').length,3);assert.equal($('profileFrameModal').querySelectorAll('.collectible-choice').length,5);
      for(const id of LIMITED_PROFILE_FRAMES){const tile=$('frameChoice_'+id);assert.equal(tile.hasAttribute('data-pro-feature'),false);assert.equal(digits(tile.querySelector('[data-frame-price]').textContent),'9999');assert.ok(tile.querySelector('.city-choice-price img'));}
    });
    await t.test('all three frame previews load cropped parts and absolute image URLs without spending',async()=>{
      const wallet=env.localStorage.getItem(WALLET_KEY),selected=env.localStorage.getItem(PROFILE_STYLE_KEY);
      for(const[id,parts,wings]of [['kitsune',6,0],['pearlguard',7,0],['seraph',11,6]]){
        await click('#frameChoice_'+id);const frame=$('framePickerFrame');
        assert.equal(frame.dataset.frame,id);assert.equal(frame.dataset.limited,'true');assert.equal($('subscriptionDialog').open,false);
        assert.match(frame.querySelector('img.collectible-art').getAttribute('src'),new RegExp('/profile-limited/frames/'+id+'-body.webp$'));
        assert.equal(frame.querySelectorAll('.limited-piece').length,parts);assert.equal(frame.querySelectorAll('[data-piece-type="wing"]').length,wings);
        // This project's DOM double stores inline CSS as an attribute; it does
        // not implement a browser CSSStyleDeclaration parser.
        for(const piece of frame.querySelectorAll('.limited-piece')){assert.match(piece.querySelector('img').getAttribute('src'),/^file:\/\//);assert.match(piece.getAttribute('style'),/--piece-art:url\("file:\/\//);assert.match(piece.getAttribute('style'),/transform-origin:[\d.-]+% [\d.-]+%/);}
        assert.equal(digits($('collectibleFramePrice').textContent),'9999');assert.equal($('collectibleFrameOffer').dataset.limited,'true');assert.equal(state.profileStyle.frame,'ice');
      }
      assert.equal(env.localStorage.getItem(WALLET_KEY),wallet);assert.equal(env.localStorage.getItem(PROFILE_STYLE_KEY),selected);
      await close('profileFrameModal');await click('#profileFrameEdit');assert.equal($('framePickerFrame').dataset.frame,'ice');
    });
    await t.test('double-tapping Buy charges once and installs bounded hero art and a small header sprite',async()=>{
      await click('#frameChoice_kitsune');$('collectibleFrameBuy').click();$('collectibleFrameBuy').click();await tick();await tick();
      assert.equal(getWallet().snapshot().balance,90001);assert.deepEqual(getWallet().ownedFrames(),['kitsune']);assert.equal(state.profileStyle.frame,'kitsune');
      assert.match($('profileAvatarFrame').querySelector('.collectible-art').getAttribute('src'),/kitsune-body.webp$/);assert.equal($('profileAvatarFrame').querySelectorAll('.limited-piece').length,6);
      assert.match($('headerAvatarFrame').querySelector('.collectible-art').getAttribute('src'),/kitsune-thumb.webp$/);assert.equal($('headerAvatarFrame').querySelector('.collectible-details').children.length,0);
      assert.equal($('frameChoice_kitsune').dataset.owned,'true');assert.equal($('collectibleFramePurchase').hidden,true);assert.match($('walletHistoryList').textContent,/Рамка · Кицунэ/);
    });
    await t.test('a failed style save after payment leaves its receipt and a free Apply button',async()=>{
      await click('#frameChoice_seraph');const write=env.localStorage.setItem;
      env.localStorage.setItem=(key,value)=>{if(key===PROFILE_STYLE_KEY)throw new Error('quota');write(key,value);};
      try{await click('#collectibleFrameBuy');assert.equal(getWallet().snapshot().balance,80002);assert.equal(state.profileStyle.frame,'kitsune');assert.equal($('collectibleFrameApply').hidden,false);assert.equal($('collectibleFrameError').hidden,false);}finally{env.localStorage.setItem=write;}
      const saved=env.localStorage.getItem(WALLET_KEY);await click('#collectibleFrameApply');assert.equal(state.profileStyle.frame,'seraph');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);assert.equal($('collectibleFrameError').hidden,true);
      await close('profileFrameModal');await click('#profileCoverEdit');
    });
    await t.test('each cover preview has its own depth planes, light maps and themed life',async()=>{
      assert.equal($('profileCoverModal').querySelectorAll('.limited-choice').length,3);assert.equal($('profileCoverModal').querySelectorAll('.city-choice').length,4);
      const wallet=env.localStorage.getItem(WALLET_KEY),selected=env.localStorage.getItem(PROFILE_STYLE_KEY);
      for(const id of LIMITED_PROFILE_COVERS){
        await click('#coverChoice_'+id);const scene=$('coverPickerScene'),world=scene.querySelector('.limited-world');
        assert.equal(scene.dataset.limited,'true');assert.equal(scene.dataset.city,'false');assert.equal($('coverStylePreview').dataset.limited,'true');
        assert.match(scene.querySelector('.scene-image').getAttribute('src'),new RegExp('profile-limited/covers/'+id+'.webp$'));
        assert.match(world.getAttribute('style'),new RegExp('--limited-front:url\\("file:.*'+id+'-front.webp'));assert.ok(world.querySelector('.limited-front img'));
        assert.ok(world.querySelector('.limited-far'));assert.ok(world.querySelector('.limited-depth'));assert.ok(world.querySelector('.limited-near'));
        assert.equal(world.querySelectorAll('.limited-petal').length,id==='scarlet'?12:0);assert.equal(world.querySelectorAll('.limited-shoal').length,id==='atlantis'?3:0);assert.equal(world.querySelectorAll('.limited-bubble-rise').length,id==='atlantis'?9:0);assert.equal(world.querySelectorAll('.limited-dust').length,id==='cathedral'?14:0);
        assert.equal(digits($('cityCoverPrice').textContent),'9999');assert.match($('cityCoverCredit').textContent,/фантазийная/);assert.equal(state.profileStyle.cover,'mist');
      }
      assert.equal(env.localStorage.getItem(WALLET_KEY),wallet);assert.equal(env.localStorage.getItem(PROFILE_STYLE_KEY),selected);
    });
    await t.test('buying a cover charges only that cover and gives it a named receipt',async()=>{
      await click('#coverChoice_scarlet');await click('#cityCoverBuy');assert.equal(getWallet().snapshot().balance,70003);assert.deepEqual(getWallet().ownedCovers(),['scarlet']);assert.equal(state.profileStyle.cover,'scarlet');
      assert.equal(state.profileStyle.frame,'seraph');assert.equal($('profileIdentityCard').dataset.limitedCover,'true');assert.equal($('profileIdentityCard').dataset.cityCover,'false');assert.equal($('cityCoverPurchase').hidden,true);assert.match($('walletHistoryList').textContent,/Обложка · Алый сёгун/);
    });
    await t.test('insufficient funds show the exact shortfall without granting the preview',async()=>{
      const saved=env.localStorage.getItem(WALLET_KEY);env.localStorage.removeItem(WALLET_KEY);await click('#coverChoice_atlantis');assert.equal($('cityCoverBuy').disabled,true);assert.equal(digits($('cityCoverShortfallAmount').textContent),'9999');
      await click('#cityCoverBuy');assert.equal(state.profileStyle.cover,'scarlet');assert.equal(env.localStorage.getItem(WALLET_KEY),null);env.localStorage.setItem(WALLET_KEY,saved);document.dispatchEvent(new Event('fitcat:wallet'));await tick();assert.equal($('cityCoverBuy').disabled,false);
    });
    await t.test('a failed cover debit preserves funds and selection; retry makes one debit',async()=>{
      const saved=env.localStorage.getItem(WALLET_KEY),write=env.localStorage.setItem;
      env.localStorage.setItem=(key,value)=>{if(key===WALLET_KEY)throw new Error('quota');write(key,value);};
      try{await click('#cityCoverBuy');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);assert.equal(state.profileStyle.cover,'scarlet');assert.equal($('cityCoverError').hidden,false);}finally{env.localStorage.setItem=write;}
      await click('#cityCoverBuy');assert.equal(state.profileStyle.cover,'atlantis');assert.equal(getWallet().snapshot().balance,60004);
    });
    await t.test('changing the preview during a pending purchase cannot redirect its debit',async()=>{
      const wallet=getWallet(),purchase=wallet.purchaseCover;let resume;const gate=new Promise(resolve=>{resume=resolve;});
      wallet.purchaseCover=async(id,options)=>{await gate;return purchase(id,options);};
      try{
        await click('#coverChoice_cathedral');$('cityCoverBuy').click();await tick();await click('#coverChoice_scarlet');assert.equal(state.profileStyle.cover,'scarlet');resume();await tick();await tick();
        assert.equal(getWallet().snapshot().balance,50005);assert.equal(state.profileStyle.cover,'cathedral');assert.deepEqual(getWallet().ownedCovers(),['scarlet','atlantis','cathedral']);
        assert.equal(getWallet().snapshot().entries.at(-1).cover,'cathedral');
      }finally{resume();wallet.purchaseCover=purchase;}
    });
    await t.test('reload, default appearance and PRO+ expiry preserve all existing receipts',async()=>{
      const saved=env.localStorage.getItem(WALLET_KEY);loadState(env.localStorage);renderProfileStyle();assert.equal($('profileCoverScene').dataset.cover,'cathedral');assert.equal($('profileAvatarFrame').dataset.frame,'seraph');
      await click('#profileCoverModal [data-action="resetProfileStyle"]');await click('#coverChoice_cathedral');assert.equal(state.profileStyle.cover,'cathedral');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);
      for(const[key,value]of Object.entries(activeProFixture()))env.localStorage.setItem(key,value);document.dispatchEvent(new Event('fitcat:subscription'));await tick();env.localStorage.removeItem('fitcat_subscription_v1');document.dispatchEvent(new Event('fitcat:subscription'));await tick();
      assert.equal($('profileAvatarFrame').dataset.frame,'seraph');assert.equal($('profileCoverScene').dataset.cover,'cathedral');assert.equal(env.localStorage.getItem(WALLET_KEY),saved);
    });
    await t.test('ordinary renders preserve detailed DOM and phase; hidden and reduced motion pause it',async()=>{
      const media=globalThis.matchMedia,animation={animationName:'profile-limited-lantern-a',currentTime:0};let seeks=0;
      $('coverPickerScene').getAnimations=()=>{seeks++;return[animation];};globalThis.matchMedia=()=>({matches:false});
      try{
        syncProfileStyleMotion();assert.equal($('coverPickerScene').dataset.live,'true');assert.equal($('profileCoverScene').dataset.live,'false');assert.equal($('coverPickerFrame').dataset.live,'false');
        const world=$('coverPickerScene').querySelector('.limited-world'),first=animation.currentTime,count=seeks;assert.ok(first>0);renderProfileStyle();assert.equal($('coverPickerScene').querySelector('.limited-world'),world);assert.equal(seeks,count);
        await close('profileCoverModal');animation.currentTime=0;await click('#profileCoverEdit');assert.ok(animation.currentTime>=first);
        Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));assert.equal($('coverPickerScene').dataset.live,'false');Object.defineProperty(document,'hidden',{value:false,configurable:true});globalThis.matchMedia=()=>({matches:true});syncProfileStyleMotion();assert.equal($('coverPickerScene').dataset.live,'false');
      }finally{globalThis.matchMedia=media;delete $('coverPickerScene').getAnimations;}
      await close('profileCoverModal');await click('#profileFrameEdit');const details=$('framePickerFrame').querySelector('.collectible-details').firstElementChild;renderProfileStyle();assert.equal($('framePickerFrame').querySelector('.collectible-details').firstElementChild,details);assert.equal($('framePickerFrame').querySelectorAll('[data-piece-type="wing"]').length,6);
    });
    await t.test('translated item titles, prices and receipts remain correct without losing the chosen style',async()=>{
      for(const[language,title]of [['en','Seraph'],['cn','六翼天使'],['ru','Серафим']]){state.preferences.lang=language;document.dispatchEvent(new Event('fitcat:language'));await tick();assert.equal($('collectibleFrameTitle').textContent,title);assert.equal(digits($('collectibleFramePrice').textContent),'9999');assert.deepEqual(state.profileStyle,{frame:'seraph',cover:'cathedral'});}
    });
  }finally{env.restoreTimers();}
});
