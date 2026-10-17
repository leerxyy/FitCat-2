import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit } from './dom.mjs';
import { localDate } from '../js/core/math.js';
import { WALLET_KEY } from '../js/core/wallet.js';

test('PRO feature badges, Basic gates, checkout, expiry and retained templates work together', async t => {
  const actualNow = Date.now; let now = actualNow(); Date.now = () => now;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); const past = localDate(yesterday);
  const food = { id: 'food', name: 'Тест', kcal: 300, protein: 11, fat: 10, carbs: 20, weight: 100, meal: 'breakfast', checked: true };
  const templates = [1, 2, 3].map(i => ({ name: 'Шаблон ' + i, foods: [{ ...food }] }));
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 170, weight: 52, startWeight: 52, goal: 'maintain' }),
    lastDate: new Date().toDateString(), smartWaterEnabled: 'true', currentTemp: '27', currentSteps: '12800', waterAmount: '750',
    todayFoods: JSON.stringify([food]), fitcat_templates: JSON.stringify(templates),
    nutritionHistory: JSON.stringify([{ date: past, kcal: 1907, protein: 91, fat: 37, carbs: 203 }, { date: localDate(), kcal: 300, protein: 11, fat: 10, carbs: 20 }]),
    [WALLET_KEY]: JSON.stringify({ version: 1, balance: 100, entries: [{ id: 'old-credit', kind: 'promo', amount: 100, at: now, balanceAfter: 100 }], redeemed: [], subscription: null }),
  });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const closeSubscription = () => click('[data-subscription-panel="overview"] [data-close="subscriptionDialog"]');
  const originalFetch = globalThis.fetch; const originalChart = globalThis.Chart;
  const charts = [];
  globalThis.Chart = class { constructor(context, config) { this.config = config; charts.push(this); } destroy() { this.destroyed = true; } };
  let releaseWeather; let weatherCalls = 0;
  globalThis.fetch = async () => { weatherCalls++; await new Promise(resolve => { releaseWeather = resolve; }); return { ok: true, json: async () => ({ hourly: {
    time: Array.from({ length: 24 }, (_, h) => `${localDate()}T${String(h).padStart(2, '0')}:00`), temperature_2m: Array(24).fill(35),
  } }) }; };
  try {
    await import('../js/app.js');
    const { state, proAccess } = await import('../js/core/store.js');
    const { getWallet } = await import('../js/features/wallet.js');
    const pastRow = () => document.querySelector(`[data-action="deleteNutritionEntry"][data-value="${past}"]`).closest('.history-item');
    const saveTemplate = async name => {
      await click('[data-action="openMealTools"]'); await click('#saveTemplateButton');
      assert.equal($('promptDialog').open, true); $('promptInput').value = name; submit($('promptForm')); await tick(); await tick();
      await click('[data-close="mealToolsModal"]');
    };

    await t.test('Basic sees premium labels, free calories and today’s macros, with the base water goal', async () => {
      assert.equal(proAccess(), false); assert.equal($('waterGoal').textContent, '1,82 л'); assert.equal(state.water, 750);
      assert.equal($('proteinCurrent').dataset.value, '11'); assert.equal(state.preferences.smartWaterEnabled, true);
      for (const button of document.querySelectorAll('[data-pro-feature]')) {
        assert.equal(button.querySelector('.pro-feature-badge').hidden, false); assert.equal(button.classList.contains('is-pro-locked'), true);
      }
      assert.match(pastRow().textContent, /1.?907/); assert.equal(pastRow().textContent.includes('91'), false);
      assert.ok(pastRow().querySelector('.history-macro-lock')); assert.equal(weatherCalls, 0);
      assert.match($('templateAllowance').textContent, /3 \/ 3/);
    });

    await t.test('the floating badge and each macro tab open the existing subscription overview', async () => {
      document.querySelector('[data-action="openSmartWater"] .pro-feature-text').click(); await tick();
      assert.equal($('subscriptionDialog').open, true); assert.equal($('smartWaterModal').open, false);
      assert.equal($('proFeatureTitle').textContent, 'Умная вода'); assert.match($('subscriptionPurchase').textContent, /Оформить/); await closeSubscription();
      await click('[data-tab="analytics"]');
      for (const metric of ['protein', 'fat', 'carbs']) {
        await click(`[data-action="switchNutritionChart"][data-value="${metric}"]`);
        assert.equal($('subscriptionDialog').open, true); assert.equal($('proFeatureTitle').textContent, 'История БЖУ');
        assert.equal(document.querySelector(`[data-nutrition="${metric}"]`).getAttribute('aria-pressed'), 'false');
        assert.equal(document.querySelector('[data-nutrition="kcal"]').classList.contains('active'), true); await closeSubscription();
      }
      await click('.history-macro-lock'); assert.equal($('subscriptionDialog').open, true); await closeSubscription();
      await click('[data-action="switchNutritionChart"][data-value="kcal"]'); assert.equal($('subscriptionDialog').open, false);
    });

    await t.test('the fourth Basic template opens the paywall, while deleting one frees a slot', async () => {
      await click('[data-action="openMealTools"]'); await click('#saveTemplateButton');
      assert.equal($('subscriptionDialog').open, true); assert.equal($('mealToolsModal').open, false); assert.equal($('promptDialog').open, false);
      assert.equal($('proFeatureTitle').textContent, 'Больше шаблонов'); assert.equal(state.templates.length, 3); await closeSubscription();
      await click('[data-action="openMealTools"]'); await click('[data-action="deleteTemplate"][data-value="2"]'); await click('#confirmAccept');
      assert.equal(state.templates.length, 2); assert.equal($('saveTemplateButton').querySelector('.pro-feature-badge').hidden, true);
      await click('#saveTemplateButton'); $('promptInput').value = 'Третий'; submit($('promptForm')); await tick(); await tick();
      assert.equal(state.templates.length, 3); assert.equal($('saveTemplateButton').querySelector('.pro-feature-badge').hidden, false);
      await click('[data-close="mealToolsModal"]');
    });

    await t.test('a real coin purchase unlocks existing settings and macro history immediately', async () => {
      await click('#subscriptionBadge'); await click('#subscriptionPurchase'); await click('#confirmSubscriptionPurchase');
      assert.equal(proAccess(), true); assert.equal(getWallet().snapshot().balance, 71);
      assert.equal($('subscriptionBadge').classList.contains('is-pro'), false);
      for (const button of document.querySelectorAll('[data-pro-feature]')) assert.equal(button.classList.contains('is-pro-locked'), false);
      assert.equal($('waterGoal').textContent, '2,37 л'); assert.match(pastRow().textContent, /91/); assert.equal(pastRow().querySelector('.history-macro-lock'), null);
      await click('[data-subscription-panel="success"] [data-close="subscriptionDialog"]');
      await click('[data-action="openSmartWater"]'); assert.equal($('smartWaterModal').open, true); assert.equal($('subscriptionDialog').open, false);
      await click('.smart-water-heading [data-action="closeSmartWater"]');
      for (const metric of ['protein', 'fat', 'carbs']) {
        await click(`[data-action="switchNutritionChart"][data-value="${metric}"]`);
        assert.equal($('subscriptionDialog').open, false); assert.equal(document.querySelector(`[data-nutrition="${metric}"]`).classList.contains('active'), true);
        assert.equal(document.querySelector(`[data-nutrition="${metric}"]`).getAttribute('aria-pressed'), 'true');
      }
      const bars = charts.filter(chart => chart.config.type === 'bar'); assert.ok(bars.at(-1).config.data.datasets[0].data.includes(203));
    });

    await t.test('PRO permits extra templates and does not alter the past-day nutrition record', async () => {
      await saveTemplate('Четвёртый'); await saveTemplate('Пятый'); assert.equal(state.templates.length, 5);
      assert.deepEqual(state.nutrition.find(row => row.date === past), { date: past, kcal: 1907, protein: 91, fat: 37, carbs: 203 });
      assert.equal(state.water, 750);
    });

    await t.test('expiry closes smart water, cancels a pending forecast and removes historical macro access', async () => {
      await click('[data-action="openSmartWater"]'); await click('[data-action="waterTemperatureMode"][data-mode="auto"]');
      navigator.onLine = true; navigator.geolocation = { getCurrentPosition(success) { success({ coords: { latitude: 55.16, longitude: 61.4 } }); } };
      await click('#weatherLocate'); navigator.onLine = false; assert.equal(weatherCalls, 1);
      now = getWallet().status().expiresAt; window.dispatchEvent(new Event('focus')); await tick(); await tick();
      assert.equal(proAccess(), false); assert.equal($('smartWaterModal').open, false); assert.equal($('subscriptionDialog').open, true);
      assert.equal($('waterGoal').textContent, '1,82 л'); assert.ok(pastRow().querySelector('.history-macro-lock'));
      assert.equal(document.querySelector('[data-nutrition="kcal"]').classList.contains('active'), true);
      releaseWeather(); await tick(); await tick(); assert.equal(state.weather.daily, null); assert.equal(state.preferences.currentTemp, 27);
      assert.equal(state.templates.length, 5); assert.equal(state.preferences.smartWaterEnabled, true); await closeSubscription();
    });

    await t.test('saved templates remain usable after expiry, and new templates still require PRO', async () => {
      await click('[data-action="openMealTools"]'); await click('[data-action="loadTemplate"][data-value="4"]'); await click('#confirmAccept');
      assert.equal($('subscriptionDialog').open, false); assert.equal(state.foods[0].name, 'Тест'); assert.equal(state.templates.length, 5);
      await click('[data-action="openMealTools"]'); await click('#saveTemplateButton'); assert.equal($('subscriptionDialog').open, true);
      assert.equal(state.templates.length, 5); assert.match($('templateAllowance').textContent, /3 \/ 3/);
      await click('#subscriptionPurchase'); await click('#confirmSubscriptionPurchase');
      assert.equal(proAccess(), true); assert.equal(getWallet().snapshot().balance, 42); assert.equal(state.templates.length, 5);
      await click('[data-subscription-panel="success"] [data-close="subscriptionDialog"]');
      state.preferences.lang = 'en'; document.dispatchEvent(new Event('fitcat:language')); await tick();
      assert.match(document.querySelector('[data-action="openSmartWater"]').getAttribute('aria-label'), /Included in PRO/);
      state.preferences.lang = 'cn'; document.dispatchEvent(new Event('fitcat:language')); await tick();
      assert.match($('templateAllowance').textContent, /不限/);
    });
  } finally { if (releaseWeather) releaseWeather(); globalThis.fetch = originalFetch; globalThis.Chart = originalChart; Date.now = actualNow; env.restoreTimers(); }
});
