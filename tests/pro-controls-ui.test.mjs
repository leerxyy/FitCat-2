import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit, activeProFixture } from './dom.mjs';
import { SUBSCRIPTION_KEY } from '../js/core/subscription.js';

test('water conditions, gestures and friend transfers share PRO access without blocking ordinary water or wallet', async t => {
  const realNow = Date.now; let now = realNow(); Date.now = () => now;
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 170, weight: 52, startWeight: 52, goal: 'maintain' }),
    lastDate: new Date().toDateString(), waterAmount: '750', smartWaterEnabled: 'true', currentTemp: '27', currentSteps: '12800' });
  const $ = id => document.getElementById(id);
  const originalVideoCount = document.querySelectorAll('video').length;
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const closeSub = () => click('#subscriptionDialog [data-sheet-handle]');
  let cameraRequests = 0; let stoppedTracks = 0; let closedModels = 0; let pendingCamera;
  const oldHands = globalThis.Hands;
  globalThis.Hands = class {
    setOptions() {} onResults() {} send() { return new Promise(() => {}); } close() { closedModels++; }
  };
  navigator.mediaDevices = { getUserMedia: () => { cameraRequests++; return new Promise(resolve => { pendingCamera = resolve; }); } };
  const createElement = document.createElement.bind(document);
  document.createElement = tag => { const node = createElement(tag); if (tag === 'video') node.play = async () => {}; return node; };
  const stream = () => ({ getTracks: () => [{ stop: () => { stoppedTracks++; } }] });
  const activate = async () => {
    env.localStorage.setItem(SUBSCRIPTION_KEY, activeProFixture(now)[SUBSCRIPTION_KEY]);
    const event = new Event('storage'); event.key = SUBSCRIPTION_KEY; window.dispatchEvent(event); await tick();
  };
  const expire = async () => {
    now = JSON.parse(env.localStorage.getItem(SUBSCRIPTION_KEY)).expiresAt;
    window.dispatchEvent(new Event('focus')); await tick(); await tick();
  };
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    const { openWallet, getWallet } = await import('../js/features/wallet.js');

    await t.test('Basic opens the water screen; both the conditions badge and switch open the subscription without changing saved settings', async () => {
      await click('[data-action="openSmartWater"]');
      assert.equal($('smartWaterModal').open, true); assert.equal($('subscriptionDialog').open, false);
      assert.equal(document.querySelector('[data-action="openSmartWater"] .pro-feature-badge'), null);
      assert.equal($('smartWaterToggle').checked, false); assert.equal($('smartWaterGoal').dataset.value, '1.82');
      await click('#smartWaterConditions .pro-feature-text');
      assert.equal($('smartWaterModal').open, false); assert.equal($('subscriptionDialog').open, true);
      assert.equal($('proFeatureTitle').textContent, 'Умная вода'); await closeSub();
      await click('[data-action="openSmartWater"]');
      $('smartWaterToggle').checked = true; $('smartWaterToggle').dispatchEvent(new Event('change')); await tick();
      assert.equal($('subscriptionDialog').open, true); assert.equal($('smartWaterToggle').checked, false);
      assert.equal(state.preferences.smartWaterEnabled, true); assert.equal(state.water, 750); await closeSub();
    });

    await t.test('Basic gesture and transfer badges open the same subscription; camera and wallet are untouched', async () => {
      await click('[data-action="showPage"][data-value="settingsPage"]');
      await click('#gestureToggleBtn .pro-feature-text');
      assert.equal($('subscriptionDialog').open, true); assert.equal($('proFeatureTitle').textContent, 'Управление жестами');
      assert.equal(cameraRequests, 0); assert.equal(document.querySelectorAll('video').length, originalVideoCount); await closeSub();
      await click('#walletBadge'); const before = env.localStorage.getItem('fitcat_wallet_v1');
      await click('[data-action="walletTransfer"] .pro-feature-text');
      assert.equal($('walletDialog').open, false); assert.equal($('subscriptionDialog').open, true);
      assert.equal($('proFeatureTitle').textContent, 'Отправить другу'); assert.match($('proFeatureDescription').textContent, /пока недоступны/);
      assert.equal(env.localStorage.getItem('fitcat_wallet_v1'), before); await closeSub();
      openWallet('transfer'); await tick(); assert.equal($('walletDialog').open, false); assert.equal($('subscriptionDialog').open, true); await closeSub();
    });

    await t.test('PRO conditions toggle directly and the transfer form still cannot debit coins', async () => {
      await activate();
      await click('[data-action="openSmartWater"]');
      await click('#smartWaterConditions .pro-feature-text'); assert.equal(state.preferences.smartWaterEnabled, false);
      await click('#smartWaterConditions'); assert.equal(state.preferences.smartWaterEnabled, true);
      assert.equal($('smartWaterConditions').getAttribute('aria-pressed'), 'true'); assert.equal($('subscriptionDialog').open, false);
      await click('#smartWaterModal [data-sheet-handle]');
      await click('#walletBadge'); await click('[data-action="walletTransfer"]');
      assert.equal(document.querySelector('[data-wallet-panel="transfer"]').hidden, false);
      const before = env.localStorage.getItem('fitcat_wallet_v1');
      $('walletRecipient').value = '81234567890'; $('walletTransferAmount').value = '25'; submit($('walletTransferForm'));
      assert.match($('walletTransferResult').textContent, /пока недоступны/); assert.equal(env.localStorage.getItem('fitcat_wallet_v1'), before);
      await click('#walletDialog [data-sheet-handle]'); assert.equal(getWallet().snapshot().balance, 0);
    });

    await t.test('a camera permission request that finishes after PRO expiry releases the stream and model', async () => {
      await click('#gestureToggleBtn'); assert.equal(cameraRequests, 0); await click('#gestureGuideModal [data-action="skipGestureTraining"]'); assert.equal(cameraRequests, 1); assert.ok(pendingCamera);
      await expire(); pendingCamera(stream()); await tick(); await tick();
      assert.equal(stoppedTracks, 1); assert.equal(closedModels, 1);
      assert.equal($('gestureToggleBtn').getAttribute('aria-pressed'), 'false'); assert.equal(document.querySelectorAll('video').length, originalVideoCount);
    });

    await t.test('active gesture camera stops on expiry, and an expired transfer form cannot be submitted', async () => {
      await activate(); await click('#gestureToggleBtn'); await click('#gestureGuideModal [data-action="skipGestureTraining"]'); pendingCamera(stream()); await tick(); await tick();
      assert.equal($('gestureToggleBtn').getAttribute('aria-pressed'), 'true'); assert.equal(document.querySelectorAll('video').length, originalVideoCount + 1);
      await click('#walletBadge'); await click('[data-action="walletTransfer"]'); await expire();
      assert.equal($('gestureToggleBtn').getAttribute('aria-pressed'), 'false'); assert.equal(document.querySelectorAll('video').length, originalVideoCount);
      assert.equal(stoppedTracks, 2); assert.equal(closedModels, 2); assert.equal(document.querySelector('[data-wallet-panel="overview"]').hidden, false);
      submit($('walletTransferForm')); await tick(); assert.equal($('subscriptionDialog').open, true); assert.equal($('walletDialog').open, false); await closeSub();
    });

    await t.test('new premium entry labels and context descriptions translate in English and Chinese', async () => {
      for (const [language, label] of [['en', /Available with PRO/], ['cn', /PRO\+ 专享/]]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        for (const id of ['smartWaterConditions', 'gestureToggleBtn']) assert.match($(id).getAttribute('aria-label'), label);
        await click('#walletBadge'); await click('[data-action="walletTransfer"] .pro-feature-text');
        assert.equal($('proFeatureNotice').hidden, false); assert.ok($('proFeatureDescription').textContent.length > 10);
        assert.equal($('proFeatureDescription').textContent.startsWith('pro_'), false); await closeSub();
      }
    });
  } finally {
    const { stopGestures } = await import('../js/features/gestures.js'); stopGestures();
    globalThis.Hands = oldHands; Date.now = realNow; env.restoreTimers();
  }
});
