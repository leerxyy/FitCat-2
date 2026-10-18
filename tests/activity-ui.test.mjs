import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('redesigned rhythm and workout controls keep autosaved activity, saved training and goal adjustments consistent', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }), lastDate: new Date().toDateString(), workoutIntensity: 'moderate' });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); };
  const toggle = async (id, value) => { $(id).checked = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); await tick(); };
  try {
    await import('../js/app.js');
    const { state, rollDay } = await import('../js/core/store.js');
    const { changed } = await import('../js/ui/components.js');
    await t.test('a rhythm choice immediately persists and updates goals without Apply', async () => {
      await click('[data-tab="activity"]');
      assert.equal($('activityRhythmTitle').textContent, 'Твой ритм дня');
      assert.equal($('activityLevelMeter').dataset.level, '2');
      await click('[data-activity="1.55"] .activity-choice-copy');
      assert.equal(state.preferences.dailyActivity, 1.55);
      assert.equal(document.querySelectorAll('.activity-daily-item.selected').length, 1);
      assert.equal(document.querySelector('[data-activity="1.55"]').getAttribute('aria-pressed'), 'true');
      assert.equal($('activityLevelMeter').dataset.level, '3');
      assert.equal(document.querySelector('[data-action="applyDailyActivity"]'), null);
      assert.equal(env.localStorage.getItem('dailyActivity'), '1.55'); assert.equal($('caloriesTarget').dataset.value, '2961');
      await click('[data-activity="1.725"]'); await click('[data-tab="today"]'); await click('[data-tab="activity"]');
      assert.equal($('activityLevelMeter').dataset.level, '4'); assert.equal(document.querySelector('[data-activity="1.725"]').getAttribute('aria-pressed'), 'true');
      assert.equal(env.localStorage.getItem('dailyActivity'), '1.725'); await click('[data-activity="1.55"]');
    });
    await t.test('the page switch opens the free workout sheet and all intensity settings update both goals exactly once', async () => {
      const base = Number($('caloriesTarget').dataset.value);
      await toggle('activityWorkoutToggle', true);
      assert.equal($('workoutModal').open, true); assert.equal(document.activeElement, $('workoutTitle'));
      assert.equal($('subscriptionDialog').open, false); assert.equal($('workoutToggle').checked, true);
      assert.equal($('workoutSettings').hidden, false); assert.equal($('workoutModal').querySelector('.close-button'), null);
      for (const [level, extra] of [['light', 150], ['moderate', 250], ['intense', 400]]) {
        await click(`#workoutIntensityControl [data-value="${level}"] .workout-choice-copy`);
        assert.equal(env.localStorage.getItem('workoutIntensity'), level);
        assert.equal(document.querySelectorAll('.workout-option.selected').length, 1);
        assert.equal($('workoutCalorieBonus').dataset.value, String(extra)); assert.equal($('workoutWaterBonus').dataset.value, String(extra));
        assert.equal(Number($('caloriesTarget').dataset.value), base + extra);
        assert.equal($('activityWorkoutToggle').checked, true);
      }
      await click('[data-value="moderate"].workout-option'); await click('#workoutModal [data-sheet-handle]');
      assert.equal($('workoutModal').open, false); assert.equal(state.preferences.workoutIntensity, 'moderate');
    });
    await t.test('turning training off restores the base goal and retains intensity across closing and reopening', async () => {
      await click('[data-action="openWorkout"]'); await toggle('workoutToggle', false);
      assert.equal($('activityWorkoutToggle').checked, false); assert.equal($('workoutSettings').hidden, true);
      assert.equal($('workoutOffHint').hidden, false); assert.equal($('workoutCalorieBonus').dataset.value, '0');
      assert.equal($('caloriesTarget').dataset.value, '2961'); assert.equal(env.localStorage.getItem('workoutEnabled'), 'false');
      assert.equal(state.preferences.workoutIntensity, 'moderate');
      $('workoutModal').querySelector('[data-sheet-handle]').click(); await tick();
      await click('[data-action="openWorkout"]'); await toggle('workoutToggle', true);
      assert.equal($('workoutIntensity').value, 'moderate'); assert.equal($('activityWorkoutDetail').textContent, 'Умеренная');
      const cancel = new Event('cancel', { cancelable: true }); $('workoutModal').dispatchEvent(cancel); await tick();
      assert.equal(cancel.defaultPrevented, true); assert.equal($('workoutModal').open, false);
      assert.equal(env.localStorage.getItem('workoutEnabled'), 'true');
    });
    await t.test('the nutrition adjustment matches the real target difference after a goal multiplier', async () => {
      state.profile.goal = 'lose'; changed(); await toggle('activityWorkoutToggle', false);
      const base = Number($('caloriesTarget').dataset.value); await toggle('activityWorkoutToggle', true);
      const difference = Number($('caloriesTarget').dataset.value) - base;
      assert.ok(difference > 0 && difference < 250);
      assert.equal($('workoutCalorieBonus').dataset.value, String(difference)); assert.equal($('workoutWaterBonus').dataset.value, '250');
      assert.equal(document.querySelectorAll('.workout-option.selected').length, 1);
    });
    await t.test('new copy translates without destroying icons, and a new day clears training while retaining saved intensity', async () => {
      for (const [language, title] of [['en', 'Your daily rhythm'], ['cn', '你的日常节奏'], ['ru', 'Твой ритм дня']]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        assert.equal($('activityRhythmTitle').textContent, title);
        assert.equal(document.querySelectorAll('.activity-daily-item .choice-icon').length, 4);
        assert.equal(document.querySelectorAll('.workout-option .selection-glint').length, 3);
        assert.equal(document.querySelectorAll('.activity-daily-item .selection-glint').length, 4);
        assert.equal($('workoutToggle').getAttribute('aria-label').startsWith('workout_'), false);
        assert.equal($('activityWorkoutDetail').textContent.startsWith('workout_'), false);
      }
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); rollDay(tomorrow); changed(); await tick();
      assert.equal($('workoutToggle').checked, false); assert.equal($('activityWorkoutToggle').checked, false);
      assert.equal($('workoutSettings').hidden, true); assert.equal($('workoutWaterBonus').dataset.value, '0');
      assert.equal(state.preferences.workoutIntensity, 'moderate');
    });
  } finally { env.restoreTimers(); }
});
