import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit } from './dom.mjs';
import { localDate } from '../js/core/math.js';

test('statistics redesign keeps real journal data, periods and entry actions consistent', async t => {
  const day = offset => { const value = new Date(); value.setDate(value.getDate() + offset); return localDate(value); };
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, startWeight: 80, targetWeight: 75, goal: 'maintain' }),
    lastDate: new Date().toDateString(), nutritionHistory: JSON.stringify([{ date: day(0), kcal: 0, protein: 0, fat: 0, carbs: 0 }]) });
  const $ = id => document.getElementById(id);
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); await tick(); };
  const charts = []; const previousChart = globalThis.Chart;
  globalThis.Chart = class { constructor(context, config) { this.config = config; charts.push(this); } destroy() { this.destroyed = true; } };
  const chart = type => charts.filter(item => item.config.type === type).at(-1)?.config;
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    const { changed } = await import('../js/ui/components.js');

    await t.test('empty screens show useful actions without loading charts or inventing records', async () => {
      await click('[data-tab="analytics"]');
      assert.equal($('weightStatisticsPanel').hidden, false); assert.equal($('nutritionStatisticsPanel').hidden, true);
      assert.equal($('statsWeightButton').getAttribute('aria-selected'), 'true'); assert.equal($('currentWeightStat').textContent, '80');
      assert.match($('weightChartStatus').textContent, /Пока нет измерений/); assert.equal($('weightChartFrame').hidden, true);
      assert.equal($('newWeight').closest('dialog'), $('weightEntryModal')); assert.equal(state.weight.length, 0);
      await click('#statsNutritionButton [data-i18n]');
      assert.equal($('weightStatisticsPanel').inert, true); assert.equal($('nutritionStatisticsPanel').inert, false);
      assert.match($('nutritionChartStatus').textContent, /Пока нет данных о питании/); assert.equal($('nutritionChartFrame').hidden, true);
      assert.match($('nutritionHistoryList').textContent, /Сегодня/); assert.match($('nutritionHistoryList').textContent, /Приёмы пищи не добавлены/);
      assert.equal(charts.length, 0); assert.equal(state.nutrition.length, 1);
      await click('#nutritionChartStatus [data-action="openFood"]'); assert.equal($('foodEntryModal').open, true);
      await click('#foodEntryModal [data-sheet-handle]');
    });

    await t.test('weight entry saves its date, updates current weight and BMI, and leaves the profile and other data intact', async () => {
      await click('#statsWeightButton');
      for (const [date, weight] of [[day(-10), 82.7], [day(0), 81.2]]) {
        await click('[data-action="openWeightEntry"]');
        assert.equal($('weightEntryModal').open, true); assert.equal(document.activeElement, $('weightEntryTitle'));
        assert.equal($('weightEntryModal').querySelector('.close-button'), null);
        $('newWeight').value = weight; $('weightDate').value = date; submit($('weightEntryForm')); await tick(); await tick();
        assert.equal($('weightEntryModal').open, false);
      }
      assert.equal(state.weight.length, 2); assert.equal(state.profile.weight, 80);
      assert.equal($('currentWeightStat').dataset.value, '81.2'); assert.equal($('startWeightStat').dataset.value, '82.7');
      assert.ok(Math.abs(Number($('bmiValue').dataset.value) - 81.2 / 1.8 ** 2) < 1e-8);
      assert.deepEqual(chart('line').data.datasets[0].data, [82.7, 81.2]);
      assert.equal($('weightHistoryList').querySelector('.stats-history-row').dataset.historyDate, day(0));
      assert.deepEqual(JSON.parse(env.localStorage.getItem('weightHistory')), state.weight);
      assert.equal(state.nutrition.length, 1); assert.equal($('navDock').hidden, false);
    });

    await t.test('invalid dates and measurements do not save; same-day replacement uses confirmation and date identity', async () => {
      await click('[data-action="openWeightEntry"]');
      for (const [weight, date] of [[0, day(0)], [501, day(0)], [80, '2026-02-31'], [80, '']]) {
        $('newWeight').value = weight; $('weightDate').value = date; submit($('weightEntryForm')); await tick();
        assert.equal(state.weight.length, 2); assert.equal($('weightEntryModal').open, true);
      }
      $('newWeight').value = '80.5'; $('weightDate').value = day(0); submit($('weightEntryForm')); await tick();
      assert.equal($('confirmDialog').open, true); assert.equal($('saveWeightEntry').disabled, true);
      await click('#confirmDialog [data-close]'); assert.equal(state.weight.find(entry => entry.date === day(0)).weight, 81.2);
      submit($('weightEntryForm')); submit($('weightEntryForm')); await tick();
      state.weight.reverse(); await click('#confirmAccept');
      assert.equal(state.weight.length, 2); assert.equal(state.weight.find(entry => entry.date === day(0)).weight, 80.5);
      assert.equal(state.weight.find(entry => entry.date === day(-10)).weight, 82.7);
      assert.equal($('saveWeightEntry').disabled, false); assert.equal($('weightEntryModal').open, false);
      await click('[data-action="setWeightGoal"]'); $('promptInput').value = '76'; submit($('promptForm')); await tick(); await tick();
      assert.equal(state.profile.targetWeight, 76); assert.deepEqual(chart('line').data.datasets[1].data, [76, 76]);
    });

    await t.test('7-day, 30-day and all-time periods filter both the real chart and history at calendar boundaries', async () => {
      state.nutrition = [-30, -29, -7, -6, 0, 1].map((offset, index) => ({ date: day(offset), kcal: 1000 + index, protein: 40 + index, fat: 30, carbs: 80 }));
      changed(); await click('#statsNutritionButton');
      const dates = () => $('nutritionHistoryList').querySelectorAll('[data-history-date]').map(row => row.dataset.historyDate).sort();
      assert.deepEqual(chart('bar').data.datasets[0].data, [1003, 1004]); assert.deepEqual(dates(), [day(-6), day(0)]);
      $('nutritionPeriod').value = '30'; $('nutritionPeriod').dispatchEvent(new Event('change')); await tick();
      assert.deepEqual(chart('bar').data.datasets[0].data, [1001, 1002, 1003, 1004]); assert.deepEqual(dates(), [day(-29), day(-7), day(-6), day(0)]);
      $('nutritionPeriod').value = 'all'; $('nutritionPeriod').dispatchEvent(new Event('change')); await tick();
      assert.deepEqual(chart('bar').data.datasets[0].data, [1000, 1001, 1002, 1003, 1004, 1005]);
      assert.equal(dates().length, 6); assert.equal(state.nutrition.length, 6);
      assert.match($('nutritionChartTitle').textContent, /за всё время/);
      $('nutritionPeriod').value = 'invalid'; $('nutritionPeriod').dispatchEvent(new Event('change')); await tick();
      assert.equal($('nutritionPeriod').value, 'all');
    });

    await t.test('ellipsis actions cancel safely and delete the selected nutrition date after confirmation', async () => {
      const selector = `[data-record-kind="nutrition"][data-value="${day(-29)}"]`;
      await click(selector); assert.equal($('statsRecordModal').open, true); assert.match($('statsRecordDescription').textContent, /1.?001/);
      await click('#statsRecordModal [data-close]'); assert.equal(state.nutrition.length, 6);
      await click(selector); await click('#deleteStatsRecord'); assert.equal($('statsRecordModal').open, false);
      await click('#confirmDialog [data-close]'); assert.equal(state.nutrition.length, 6);
      await click(selector); await click('#deleteStatsRecord'); await click('#confirmAccept');
      assert.equal(state.nutrition.length, 5); assert.equal(state.nutrition.some(entry => entry.date === day(-29)), false);
      assert.ok(state.nutrition.some(entry => entry.date === day(-30))); assert.equal(state.weight.length, 2);
      assert.deepEqual(JSON.parse(env.localStorage.getItem('nutritionHistory')), state.nutrition);
    });

    await t.test('language changes preserve controls and keyboard navigation keeps one accessible selected panel', async () => {
      for (const [language, title] of [['en', 'Nutrition'], ['cn', '饮食'], ['ru', 'Питание']]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        assert.equal($('statsNutritionButton').querySelector('[data-i18n]').textContent, title);
        assert.equal(document.querySelectorAll('.stats-mode .selection-glint').length, 2);
        assert.equal(document.querySelectorAll('.stats-metric .selection-glint').length, 4);
        assert.equal(document.querySelectorAll('.stats-metric .pro-feature-badge').length, 3);
        assert.equal($('statsNutritionButton').getAttribute('aria-selected'), 'true');
      }
      for (const [key, expected] of [['Home', 'Weight'], ['ArrowRight', 'Nutrition'], ['ArrowRight', 'Weight'], ['End', 'Nutrition'], ['ArrowLeft', 'Weight']]) {
        const event = new Event('keydown', { bubbles: true, cancelable: true }); event.key = key; $('statisticsSwitch').dispatchEvent(event); await tick();
        assert.equal(document.activeElement, $(`stats${expected}Button`));
        assert.equal(document.querySelectorAll('.stats-mode.active').length, 1);
        assert.equal($('weightStatisticsPanel').hidden, expected !== 'Weight'); assert.equal($('nutritionStatisticsPanel').hidden, expected !== 'Nutrition');
      }
    });

    await t.test('rapid animated changes and leaving Statistics settle on the final selection without stale panels', async () => {
      const previousMedia = globalThis.matchMedia; const animations = [];
      for (const id of ['weightStatisticsPanel', 'nutritionStatisticsPanel']) $(id).animate = () => {
        let resolve, reject; const animation = { finished: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel() { reject(new Error('cancelled')); }, finish() { resolve(); } };
        animations.push(animation); return animation;
      };
      globalThis.matchMedia = () => ({ matches: false });
      try {
        await click('#statsNutritionButton'); await click('#statsWeightButton'); await click('#statsNutritionButton');
        for (const animation of animations) animation.finish(); await tick();
        assert.equal($('nutritionStatisticsPanel').hidden, false); assert.equal($('weightStatisticsPanel').hidden, true);
        assert.equal($('weightStatisticsPanel').inert, true); assert.equal($('nutritionStatisticsPanel').inert, false);
        assert.equal(document.querySelectorAll('.stats-panel-leaving').length, 0);
        await click('#statsWeightButton'); await click('[data-tab="activity"]');
        for (const animation of animations) animation.finish(); await tick(); await click('[data-tab="analytics"]');
        assert.equal($('weightStatisticsPanel').hidden, false); assert.equal($('nutritionStatisticsPanel').hidden, true);
        assert.equal($('navDock').hidden, false); assert.equal(document.querySelectorAll('.stats-panel-leaving').length, 0);
      } finally { globalThis.matchMedia = previousMedia; }
    });
  } finally { globalThis.Chart = previousChart; env.restoreTimers(); }
});
