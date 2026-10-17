import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit } from './dom.mjs';

test('the real app modules load old data and wire diary, water, language, profile and history actions', async t => {
  const profile = { name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain', startWeight: 80, targetWeight: 75 };
  const env = setupDOM({ fitnessProfile: JSON.stringify(profile), lastDate: new Date().toDateString(),
    todayFoods: JSON.stringify([{ name: 'Старый продукт', weight: 100, kcal: 250, protein: 8, fat: 2, carbs: 50, checked: true }]),
    waterAmount: '500', weightHistory: JSON.stringify([{ date: '2026-10-10', weight: 81 }, { date: '2026-10-01', weight: 82 }]) });
  const errors = []; const originalError = console.error; console.error = error => errors.push(error);
  const charts = []; globalThis.Chart = class { constructor(context, options) { this.options = options; charts.push(this); } destroy() {} };
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    const $ = id => document.getElementById(id);
    const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); };
    await t.test('existing data populates the new main screen', () => {
      assert.equal($('mainPage').hidden, false); assert.equal($('setupPage').hidden, true);
      assert.equal($('caloriesEaten').dataset.value, '250'); assert.equal($('caloriesRemaining').dataset.value, '2377');
      assert.equal($('waterCurrent').dataset.value, '0.5'); assert.match($('foodListContainer').textContent, /Старый продукт/);
    });
    await t.test('water buttons and Undo update state and original storage', async () => {
      const meal = $('foodListContainer').querySelector('details');
      await click('[data-action="addWater"][data-value="250"]'); assert.equal(state.water, 750); assert.equal(env.localStorage.getItem('waterAmount'), '750');
      assert.equal($('foodListContainer').querySelector('details'), meal);
      $('toast').querySelector('button').click(); await tick(); assert.equal(state.water, 500);
    });
    await t.test('the custom water form sets the total volume', async () => {
      await click('[data-action="openWater"]'); assert.equal($('waterEntryModal').open, true);
      $('manualWaterInput').value = '1250'; submit($('waterForm')); await tick();
      assert.equal(state.water, 1250); assert.equal($('waterEntryModal').open, false);
    });
    await t.test('adding a real portion recalculates the ring and saves the local product', async () => {
      await click('[data-action="openFood"]'); assert.equal($('foodEntryModal').open, true);
      for (const [id, value] of Object.entries({ foodName: 'Овсянка', foodKcal100: 350, foodProt100: 12, foodFat100: 6, foodCarb100: 62, foodWeight: 50, foodMeal: 'breakfast' })) $(id).value = value;
      submit($('foodForm')); await tick();
      assert.equal($('foodEntryModal').open, false); assert.equal(state.foods.length, 2);
      assert.equal(state.foods[1].kcal, 175); assert.equal(state.foods[1].protein, 6);
      assert.equal($('caloriesEaten').dataset.value, '425'); assert.equal(state.products[0].name, 'Овсянка');
      assert.equal(JSON.parse(env.localStorage.getItem('todayFoods'))[1].kcal, 175);
    });
    await t.test('unchecking a food leaves it planned and removes its calories from the ring', async () => {
      const id = state.foods[1].id; await click(`[data-action="toggleFood"][data-value="${id}"]`);
      assert.equal(state.foods[1].checked, false); assert.equal($('caloriesEaten').dataset.value, '250');
      assert.match($('foodListContainer').textContent, /Запланировано/);
    });
    await t.test('the affected meal opens after adding food and can be collapsed again', async () => {
      const meal = $('foodListContainer').querySelector('[data-meal="breakfast"]');
      assert.equal(meal.open, true); meal.querySelector('summary').click(); await tick();
      assert.equal(meal.open, false); assert.equal(meal.querySelector('summary').getAttribute('aria-expanded'), 'false');
      meal.querySelector('summary').click(); await tick(); assert.equal(meal.open, true);
    });
    await t.test('editing a portion updates the selected item without duplicating it', async () => {
      const id = state.foods[1].id; await click(`[data-action="editFood"][data-value="${id}"]`);
      $('foodWeight').value = 100; $('foodEaten').checked = true; submit($('foodForm')); await tick();
      assert.equal(state.foods.length, 2); assert.equal(state.foods[1].kcal, 350); assert.equal($('caloriesEaten').dataset.value, '600');
    });
    await t.test('food deletion and Undo restore the same entry', async () => {
      const id = state.foods[1].id; await click(`[data-action="deleteFood"][data-value="${id}"]`); assert.equal(state.foods.length, 1);
      $('toast').querySelector('button').click(); await tick(); assert.equal(state.foods.length, 2); assert.equal(state.foods[1].id, id);
    });
    await t.test('activity selection and training change daily targets', async () => {
      await click('[data-action="tab"][data-tab="activity"]'); assert.equal($('activityPage').hidden, false); assert.equal($('todayPage').hidden, true);
      await click('[data-action="selectDailyActivity"][data-activity="1.55"]'); await click('[data-action="applyDailyActivity"]');
      assert.equal(state.preferences.dailyActivity, 1.55); assert.equal($('caloriesTarget').dataset.value, '2961');
      $('workoutToggle').checked = true; $('workoutToggle').dispatchEvent(new Event('change')); await tick();
      assert.equal($('workoutSettings').hidden, false); assert.equal($('caloriesTarget').dataset.value, '3111');
    });
    await t.test('history charts receive data in date order', async () => {
      await click('[data-action="tab"][data-tab="analytics"]'); assert.equal($('analyticsPage').hidden, false);
      assert.ok(charts.length >= 1); const weight = charts.find(chart => chart.options.type === 'line');
      assert.deepEqual(weight.options.data.datasets[0].data, [82, 81]);
    });
    await t.test('deleting a sorted history row removes its date rather than the old array index', async () => {
      await click('[data-action="deleteWeightEntry"][data-value="2026-10-10"]'); assert.equal($('confirmDialog').open, true);
      $('confirmAccept').click(); await tick(); assert.deepEqual(state.weight, [{ date: '2026-10-01', weight: 82 }]);
    });
    await t.test('profile, settings and all language versions remain reachable', async () => {
      await click('[data-action="showProfile"]'); assert.equal($('profilePage').hidden, false); assert.equal($('profileName').value, 'Тест');
      await click('[data-action="showPage"][data-value="settingsPage"]'); assert.equal($('settingsPage').hidden, false);
      await click('[data-action="setSettingsLanguage"][data-value="en"]'); assert.equal(document.documentElement.lang, 'en');
      await click('[data-action="tab"][data-tab="today"]'); assert.equal($('pageTitle').textContent, 'Today');
      await click('[data-action="setSettingsLanguage"][data-value="cn"]'); assert.equal(document.documentElement.lang, 'zh-Hans');
      await click('[data-action="setSettingsLanguage"][data-value="ru"]'); assert.equal(document.documentElement.lang, 'ru');
    });
    await t.test('friends have a usable offline state without trying to connect', async () => {
      await click('[data-action="tab"][data-tab="friends"]'); assert.equal($('friendsPage').hidden, false);
      assert.equal($('friendsOfflineMsg').hidden, false); assert.equal(document.head.querySelectorAll('script').filter(script => /^https?:/.test(script.getAttribute('src') || '')).length, 0);
    });
    assert.deepEqual(errors, []);
  } finally { console.error = originalError; env.restoreTimers(); delete globalThis.Chart; }
});
