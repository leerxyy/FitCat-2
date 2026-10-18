import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit } from './dom.mjs';

test('home redesign keeps live food and water and integrates the draggable dock with real navigation', async t => {
  const foods = [{ id: 'breakfast', name: 'Каша', meal: 'breakfast', weight: 100, kcal: 200, protein: 10, fat: 4, carbs: 30, checked: true },
    { id: 'lunch', name: 'Бургер', meal: 'lunch', weight: 200, kcal: 500, protein: 30, fat: 16, carbs: 40, checked: true }];
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }), todayFoods: JSON.stringify(foods), waterAmount: '750', lastDate: new Date().toDateString() });
  const $ = id => document.getElementById(id);
  const click = async selector => {
    const element = document.querySelector(selector); assert.ok(element, selector);
    const event = new Event('click', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'detail', { value: 0 });
    element.dispatchEvent(event); await tick(); await tick();
  };
  const pointer = (type, x, target = type === 'pointerdown' ? $('bottomNav') : document) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: 735 })) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event); return event;
  };
  window.PointerEvent = class {};
  $('bottomNav').getBoundingClientRect = () => ({ left: 14, top: 700, width: 372, height: 70, bottom: 770 });
  try {
    await import('../js/app.js'); const { state } = await import('../js/core/store.js');
    const { renderFoods } = await import('../js/features/diary.js');
    await t.test('the latest existing meal is the only current outline and all nutrition values remain live', () => {
      assert.equal($('caloriesEaten').dataset.value, '700'); assert.equal($('waterCurrent').dataset.value, '0.75');
      assert.equal(document.querySelectorAll('.meal-group.is-current').length, 1);
      assert.equal(document.querySelector('.meal-group.is-current').dataset.meal, 'lunch');
      assert.equal(document.querySelector('.meal-group.is-current summary').getAttribute('aria-current'), 'true');
      assert.equal(document.querySelectorAll('.meal-outline').length, 2);
      assert.ok(document.querySelector('.scanner-button .scanner-glint')); assert.ok(document.querySelector('.nav-selection .nav-lens-glint'));
    });
    await t.test('choosing a meal transfers the highlight without changing records, including after a translation', async () => {
      const raw = env.localStorage.getItem('todayFoods'); await click('[data-meal="breakfast"] summary');
      assert.equal(document.querySelector('.meal-group.is-current').dataset.meal, 'breakfast');
      assert.equal(document.querySelector('[data-meal="lunch"] summary').getAttribute('aria-current'), null);
      assert.equal(env.localStorage.getItem('todayFoods'), raw); state.preferences.lang = 'en'; document.dispatchEvent(new Event('fitcat:language')); await tick();
      assert.equal(document.querySelector('.meal-group.is-current').dataset.meal, 'breakfast'); assert.equal(document.querySelectorAll('.meal-outline').length, 2);
      state.preferences.lang = 'ru'; document.dispatchEvent(new Event('fitcat:language')); await tick();
    });
    await t.test('saving a new meal makes it current while retaining the existing meals', async () => {
      await click('.add-food-button'); $('foodName').value = 'Рыба'; $('foodWeight').value = 100; $('foodKcal100').value = 120;
      $('foodProt100').value = 20; $('foodFat100').value = 4; $('foodCarb100').value = 0; $('foodMeal').value = 'dinner'; $('foodEaten').checked = true;
      submit($('foodForm')); await tick(); await tick();
      assert.equal(state.foods.length, 3); assert.equal(document.querySelector('.meal-group.is-current').dataset.meal, 'dinner');
      assert.equal(document.querySelectorAll('.meal-group.is-current').length, 1); assert.equal($('caloriesEaten').dataset.value, '820');
      await click('[data-action="deleteFood"][data-value="' + state.foods.at(-1).id + '"]');
      assert.equal(document.querySelector('.meal-group.is-current').dataset.meal, 'lunch');
    });
    await t.test('a drag changes the actual tab only on release, with one active button and synced lens', async () => {
      pointer('pointerdown', 65); pointer('pointermove', 245); assert.equal($('todayPage').hidden, false); assert.equal($('analyticsPage').hidden, true);
      pointer('pointerup', 245); await tick(); await tick(); assert.equal($('analyticsPage').hidden, false); assert.equal($('todayPage').hidden, true);
      assert.equal(document.querySelector('[aria-current="page"]').dataset.tab, 'analytics'); assert.equal(document.querySelectorAll('.nav-item.is-active').length, 1);
      assert.equal($('bottomNav').style['--active-index'], '2'); assert.equal($('bottomNav').style['--lens-index'], '2');
      await click('[data-tab="activity"]'); assert.equal($('activityPage').hidden, false); assert.equal($('bottomNav').style['--lens-index'], '1');
    });
    await t.test('backgrounding, pagehide and an opening modal cancel a pending dock drag', async () => {
      for (const cancel of [() => { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); document.hidden = false; },
        () => window.dispatchEvent(new Event('pagehide'))]) {
        pointer('pointerdown', 155); pointer('pointermove', 335); cancel(); pointer('pointerup', 335); await tick();
        assert.equal($('activityPage').hidden, false); assert.equal($('bottomNav').classList.contains('is-scrubbing'), false);
      }
      pointer('pointerdown', 155); pointer('pointermove', 335); await click('#headerCoinBalance'); pointer('pointerup', 335); await tick();
      assert.equal($('walletDialog').open, true); assert.equal($('activityPage').hidden, false); await click('#walletDialog [data-sheet-handle]');
    });
    await t.test('empty food has no artificial current meal and normal water additions still work', async () => {
      await click('[data-tab="today"]'); const old = state.water; await click('[data-action="addWater"][data-value="250"]'); assert.equal(state.water, old + 250);
      state.foods = []; renderFoods(); assert.equal(document.querySelectorAll('.meal-group.is-current').length, 0); assert.equal(document.querySelectorAll('.meal-outline').length, 0);
      assert.ok($('foodListContainer').querySelector('.empty-state')); assert.equal($('navDock').closest('#appScroller'), null);
    });
  } finally { env.restoreTimers(); }
});
