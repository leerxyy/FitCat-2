import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, activeProFixture } from './dom.mjs';
import { WALLET_KEY } from '../js/core/wallet.js';
import { PROFILE_STYLE_KEY } from '../js/core/profile-style.js';

test('cities offer a live preview, explicit coin purchase and permanent Basic access', async t => {
  const balance = 2000, at = Date.now();
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' }), lastDate: new Date().toDateString(),
    [WALLET_KEY]: JSON.stringify({ version: 1, balance, entries: [{ id: 'legacy-coins', kind: 'promo', amount: balance, at, balanceAfter: balance }], redeemed: [], subscription: null }) });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const close = async () => { $('profileCoverModal').dispatchEvent(new Event('cancel', { cancelable: true })); await tick(); await tick(); };
  try {
    await import('../js/app.js');
    const { state, loadState } = await import('../js/core/store.js');
    const { getWallet } = await import('../js/features/wallet.js');
    const { renderProfileStyle, syncProfileStyleMotion } = await import('../js/features/profile-style.js');
    await click('[data-action="showProfile"]'); await click('#profileCoverEdit');
    await t.test('the city collection has four approved generated-art tiles, no PRO+ gate and visible coin icons', () => {
      assert.equal($('profileCoverModal').querySelectorAll('.city-choice').length, 4);
      for (const city of ['hongkong', 'chongqing', 'moscow', 'dubai']) {
        const tile = $('coverChoice_' + city);
        assert.equal(tile.hasAttribute('data-pro-feature'), false); assert.ok(tile.querySelector('.city-choice-price img'));
        assert.equal(tile.querySelector('[data-city-price]').textContent, '299');
      }
    });
    await t.test('each city preview receives its own masks, cloud strengths and native moving routes', async () => {
      const counts = {chongqing:0, moscow:4, dubai:12, hongkong:4};
      for (const [city, count] of Object.entries(counts)) {
        await click('#coverChoice_' + city);
        const scene = $('coverPickerScene');
        assert.equal(scene.dataset.city, 'true');
        assert.match(scene.style.getPropertyValue('--city-light-a'), new RegExp('city-' + city + '-light-a'));
        assert.match(scene.style.getPropertyValue('--city-water-mask'), new RegExp('city-' + city + '-water-mask'));
        assert.equal(scene.querySelectorAll('.city-traffic path').length, count);
        assert.ok(scene.querySelector('.city-fog-far')); assert.ok(scene.querySelector('.city-water-b'));
      }
      await click('#cityCoverReturn');
      assert.equal(state.profileStyle.cover, 'mist'); assert.equal(getWallet().snapshot().balance, 2000);
    });
    await t.test('previewing a locked city changes only the preview, never selection or coins', async () => {
      const before = env.localStorage.getItem(WALLET_KEY), selected = env.localStorage.getItem(PROFILE_STYLE_KEY);
      await click('#coverChoice_hongkong');
      assert.equal($('subscriptionDialog').open, false); assert.equal($('coverPickerScene').dataset.cover, 'hongkong');
      assert.equal($('profileCoverScene').dataset.cover, 'mist'); assert.equal(state.profileStyle.cover, 'mist');
      assert.equal(env.localStorage.getItem(WALLET_KEY), before); assert.equal(env.localStorage.getItem(PROFILE_STYLE_KEY), selected);
      assert.equal($('cityCoverOffer').hidden, false); assert.equal($('cityCoverBuy').disabled, false);
      assert.equal($('cityCoverTitle').textContent, 'Гонконг'); assert.match($('cityCoverCredit').textContent, /Сгенерировано/);
      await click('#cityCoverReturn'); assert.equal($('coverPickerScene').dataset.cover, 'mist'); assert.equal($('cityCoverOffer').hidden, true);
      await click('#coverChoice_hongkong'); await close(); await click('#profileCoverEdit');
      assert.equal($('coverPickerScene').dataset.cover, 'mist');
    });
    await t.test('the separate buy action charges once, applies the cover and records the correct wallet title', async () => {
      await click('#coverChoice_hongkong'); $('cityCoverBuy').click(); $('cityCoverBuy').click(); await tick(); await tick();
      assert.equal(getWallet().snapshot().balance, 1701); assert.deepEqual(getWallet().ownedCovers(), ['hongkong']);
      assert.equal(state.profileStyle.cover, 'hongkong'); assert.equal($('profileCoverScene').dataset.cover, 'hongkong');
      assert.equal($('profileIdentityCard').dataset.cityCover, 'true'); assert.equal($('cityCoverPurchase').hidden, true);
      assert.equal($('coverChoice_hongkong').dataset.owned, 'true'); assert.equal($('coverChoice_hongkong').querySelector('[data-city-price]').textContent, 'Куплено');
      assert.match($('walletHistoryList').textContent, /Обложка · Гонконг/); assert.doesNotMatch($('walletHistoryList').textContent, /PRO\+ · undefined/);
    });
    await t.test('a paid cover survives reload, reset and subscription expiry without another charge', async () => {
      const saved = env.localStorage.getItem(WALLET_KEY);
      loadState(env.localStorage); renderProfileStyle(); assert.equal($('profileCoverScene').dataset.cover, 'hongkong');
      await click('#profileCoverModal [data-action="resetProfileStyle"]'); assert.equal(state.profileStyle.cover, 'mist');
      await click('#coverChoice_hongkong'); assert.equal(state.profileStyle.cover, 'hongkong'); assert.equal(env.localStorage.getItem(WALLET_KEY), saved);
      for (const [key, value] of Object.entries(activeProFixture())) env.localStorage.setItem(key, value);
      document.dispatchEvent(new Event('fitcat:subscription')); await tick(); env.localStorage.removeItem('fitcat_subscription_v1');
      document.dispatchEvent(new Event('fitcat:subscription')); await tick(); assert.equal($('profileCoverScene').dataset.cover, 'hongkong');
    });
    await t.test('a failed wallet write leaves balance and profile untouched and a retry is safe', async () => {
      await click('#coverChoice_chongqing'); const saved = env.localStorage.getItem(WALLET_KEY), write = env.localStorage.setItem;
      env.localStorage.setItem = (key, value) => { if (key === WALLET_KEY) throw new Error('quota'); write(key, value); };
      try { await click('#cityCoverBuy'); assert.equal(env.localStorage.getItem(WALLET_KEY), saved); assert.equal(state.profileStyle.cover, 'hongkong'); assert.equal($('cityCoverError').hidden, false); }
      finally { env.localStorage.setItem = write; }
      await click('#cityCoverBuy'); assert.equal(state.profileStyle.cover, 'chongqing'); assert.equal(getWallet().snapshot().balance, 1402);
    });
    await t.test('if applying fails after payment, retrying Apply uses the receipt and spends nothing again', async () => {
      await click('#coverChoice_moscow'); const write = env.localStorage.setItem;
      env.localStorage.setItem = (key, value) => { if (key === PROFILE_STYLE_KEY) throw new Error('quota'); write(key, value); };
      try { await click('#cityCoverBuy'); assert.equal(state.profileStyle.cover, 'chongqing'); assert.equal(getWallet().snapshot().balance, 1103); assert.equal($('cityCoverApply').hidden, false); assert.equal($('cityCoverError').hidden, false); }
      finally { env.localStorage.setItem = write; }
      const saved = env.localStorage.getItem(WALLET_KEY); await click('#cityCoverApply');
      assert.equal(state.profileStyle.cover, 'moscow'); assert.equal(env.localStorage.getItem(WALLET_KEY), saved); assert.equal($('cityCoverError').hidden, true);
    });
    await t.test('insufficient balance shows the shortfall and cannot debit through a disabled button', async () => {
      const saved = env.localStorage.getItem(WALLET_KEY); env.localStorage.removeItem(WALLET_KEY);
      await click('#coverChoice_dubai'); assert.equal($('cityCoverBuy').disabled, true); assert.equal($('cityCoverShortfall').hidden, false); assert.equal($('cityCoverShortfallAmount').textContent, '299');
      await click('#cityCoverBuy'); assert.equal(env.localStorage.getItem(WALLET_KEY), null);
      env.localStorage.setItem(WALLET_KEY, saved); document.dispatchEvent(new Event('fitcat:wallet')); await tick(); assert.equal($('cityCoverBuy').disabled, false);
    });
    await t.test('a receipt arriving from another tab unlocks Apply while preserving the chosen profile cover', async () => {
      await getWallet().purchaseCover('dubai');
      const event = new Event('storage'); Object.defineProperty(event, 'key', { value: WALLET_KEY }); window.dispatchEvent(event); await tick();
      assert.equal($('cityCoverPurchase').hidden, true); assert.equal($('cityCoverApply').hidden, false); assert.equal(state.profileStyle.cover, 'moscow');
      const saved = env.localStorage.getItem(WALLET_KEY); await click('#cityCoverApply'); assert.equal(state.profileStyle.cover, 'dubai'); assert.equal(env.localStorage.getItem(WALLET_KEY), saved);
    });
    await t.test('only the visible city hero runs; phase persists and hidden/reduced states pause every layer', async () => {
      const media = globalThis.matchMedia, animation = { animationName: 'profile-city-neon-a', currentTime: 0 }; let seeks = 0;
      $('coverPickerScene').getAnimations = () => { seeks++; return [animation]; };
      globalThis.matchMedia = () => ({ matches: false });
      try {
        syncProfileStyleMotion(); assert.equal($('coverPickerScene').dataset.live, 'true'); assert.equal($('profileCoverScene').dataset.live, 'false');
        const first = animation.currentTime; assert.ok(first > 0); renderProfileStyle(); assert.equal(seeks, 1);
        await close(); assert.equal($('profileCoverScene').dataset.live, 'true'); assert.equal($('coverPickerScene').dataset.live, 'false');
        animation.currentTime = 0; await click('#profileCoverEdit'); assert.ok(animation.currentTime >= first);
        Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); assert.equal($('coverPickerScene').dataset.live, 'false');
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      } finally { globalThis.matchMedia = media; delete $('coverPickerScene').getAnimations; }
      syncProfileStyleMotion(); assert.equal($('coverPickerScene').dataset.live, 'false');
    });
    await t.test('all three languages keep source credits and paid selection intact', async () => {
      for (const [language, title] of [['en', 'Dubai'], ['cn', '迪拜'], ['ru', 'Дубай']]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        assert.equal($('cityCoverTitle').textContent, title); assert.equal(state.profileStyle.cover, 'dubai'); assert.ok($('cityCoverCredit').textContent.length > 15);
        assert.equal($('cityCoverCreditSource'), null);
      }
    });
  } finally { env.restoreTimers(); }
});
