import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, activeProFixture } from './dom.mjs';
import { localDate } from '../js/core/math.js';

test('chart loading respects the current statistics panel and current PRO access', async t => {
  const today = localDate(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); const past = localDate(yesterday);
  const env = setupDOM({ ...activeProFixture(), fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }),
    lastDate: new Date().toDateString(), weightHistory: JSON.stringify([{ date: past, weight: 81 }]),
    nutritionHistory: JSON.stringify([{ date: past, kcal: 1700, protein: 91, fat: 37, carbs: 203 }, { date: today, kcal: 1000, protein: 40, fat: 30, carbs: 90 }]) });
  const $ = id => document.getElementById(id);
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); await tick(); };
  const scripts = () => document.head.querySelectorAll('script').filter(node => node.src?.includes('chart.js'));
  const previousChart = globalThis.Chart; const charts = []; delete globalThis.Chart;
  try {
    await import('../js/app.js');
    const { proAccess } = await import('../js/core/store.js');
    await t.test('a failed load leaves history readable and offers a working retry', async () => {
      await click('[data-tab="analytics"]'); assert.equal(scripts().length, 1);
      scripts()[0].onerror(); await tick(); await tick();
      assert.equal($('weightChartFrame').hidden, true); assert.ok($('weightHistoryList').querySelector('[data-history-date]'));
      assert.ok($('weightChartStatus').querySelector('[data-action="retryCharts"]'));
      await click('#weightChartStatus [data-action="retryCharts"]'); assert.equal(scripts().length, 1);
      assert.match($('weightChartStatus').textContent, /Загружаем график/);
    });
    await t.test('a delayed response cannot draw a hidden panel or expose macros after expiry', async () => {
      await click('#statsNutritionButton'); await click('[data-nutrition="protein"]'); assert.equal(proAccess(), true);
      assert.equal(document.querySelector('[data-nutrition="protein"]').getAttribute('aria-pressed'), 'true');
      env.localStorage.removeItem('fitcat_subscription_v1'); window.dispatchEvent(new Event('focus')); await tick();
      assert.equal(proAccess(), false); assert.equal(document.querySelector('[data-nutrition="kcal"]').getAttribute('aria-pressed'), 'true');
      globalThis.Chart = class { constructor(context, config) { charts.push(config); } destroy() {} };
      scripts()[0].onload(); await tick(); await tick();
      assert.equal(charts.length, 1); assert.equal(charts[0].type, 'bar');
      assert.deepEqual(charts[0].data.datasets[0].data, [1700, 1000]);
      assert.equal($('weightStatisticsPanel').hidden, true); assert.equal($('nutritionChartFrame').hidden, false);
    });
    await t.test('leaving before a queued draw cancels it and returning draws the selected pane', async () => {
      $('statsWeightButton').click(); document.querySelector('[data-tab="today"]').click(); await tick(); await tick();
      assert.equal(charts.length, 1);
      await click('[data-tab="analytics"]'); assert.equal(charts.length, 2); assert.equal(charts.at(-1).type, 'line');
      assert.deepEqual(charts.at(-1).data.datasets[0].data, [81]);
      assert.equal($('weightStatisticsPanel').hidden, false); assert.equal($('nutritionStatisticsPanel').hidden, true);
    });
  } finally { globalThis.Chart = previousChart; env.restoreTimers(); }
});
