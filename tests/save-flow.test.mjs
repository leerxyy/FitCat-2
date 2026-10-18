import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit } from './dom.mjs';

test('animated food and water saves persist immediately, then update the dashboard after the sheet closes', async t => {
  const profile = { name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain', startWeight: 80 };
  const env = setupDOM({ fitnessProfile: JSON.stringify(profile), lastDate: new Date().toDateString(), waterAmount: '500' });
  const $ = id => document.getElementById(id); const frames = new Map(); let sequence = 0;
  try {
    await import('../js/app.js'); await tick(); await tick();
    const { state } = await import('../js/core/store.js');
    const { finishValueMotion } = await import('../js/ui/motion.js');
    const { openDialog } = await import('../js/ui/components.js');
    const closing = id => {
      const dialog = $(id); const animations = [];
      dialog.animate = (keyframes, options) => {
        let resolve, reject;
        const job = { keyframes, options, finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
          finish: () => resolve(), cancel: () => reject(new DOMException('Cancelled', 'AbortError')) };
        animations.push(job); return job;
      };
      return animations;
    };
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);
    await t.test('a food is saved before animation ends, without moving the page or duplicating the row', async () => {
      document.querySelector('[data-action="openFood"]').click(); await tick();
      const animations = closing('foodEntryModal'); $('appScroller').scrollTop = 460;
      for (const [id, value] of Object.entries({ foodName: 'Овсянка', foodKcal100: 350, foodProt100: 12, foodFat100: 6, foodCarb100: 62, foodWeight: 50, foodMeal: 'breakfast' })) $(id).value = value;
      submit($('foodForm')); submit($('foodForm'));
      assert.equal(state.foods.length, 1); assert.equal(JSON.parse(env.localStorage.getItem('todayFoods'))[0].kcal, 175);
      assert.equal($('foodEntryModal').open, true); assert.equal($('caloriesEaten').dataset.value, '0');
      assert.equal($('foodListContainer').querySelectorAll('[data-food-id]').length, 0);
      animations.at(-1).finish(); await tick();
      assert.equal($('foodEntryModal').open, false); assert.equal($('caloriesEaten').dataset.value, '175');
      assert.equal($('foodListContainer').querySelectorAll('[data-food-id]').length, 1); assert.equal($('appScroller').scrollTop, 460);
      finishValueMotion(); assert.equal($('caloriesEaten').textContent, '175');
    });
    await t.test('rapid water additions update state once per tap and retarget a bounded number of frames', async () => {
      const add = document.querySelector('[data-action="addWater"][data-value="250"]'); add.click(); add.click(); add.click(); await tick();
      assert.equal(state.water, 1250); assert.equal(env.localStorage.getItem('waterAmount'), '1250');
      assert.equal($('waterCurrent').dataset.value, '1.25'); assert.ok(frames.size < 20);
      finishValueMotion(); assert.equal($('waterCurrent').textContent, '1,25'); assert.equal($('appScroller').scrollTop, 460);
    });
    await t.test('a custom water save also waits for close, and reopening cancels a stale close safely', async () => {
      document.querySelector('[data-action="openWater"]').click(); await tick();
      const animations = closing('waterEntryModal'); $('manualWaterInput').value = '1800'; submit($('waterForm'));
      assert.equal(state.water, 1800); assert.equal(env.localStorage.getItem('waterAmount'), '1800');
      assert.equal($('waterCurrent').dataset.value, '1.25'); assert.equal($('waterEntryModal').open, true);
      openDialog('waterEntryModal'); animations[0].finish(); await tick(); assert.equal($('waterEntryModal').open, true);
      const { closeDialog } = await import('../js/ui/components.js'); closeDialog('waterEntryModal'); animations.at(-1).finish(); await tick();
      assert.equal($('waterEntryModal').open, false); assert.equal($('waterCurrent').dataset.value, '1.8');
      finishValueMotion(); assert.equal($('appScroller').scrollTop, 460);
    });
  } finally {
    const { finishValueMotion } = await import('../js/ui/motion.js'); finishValueMotion(); env.restoreTimers();
  }
});
