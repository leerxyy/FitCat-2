import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('Friends cards use live progress safely and cancel stale subscriptions and dialogs', async t => {
  const ownId = '82610170000'; const first = '82610170001'; const second = '82610170002';
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }),
    fitcat_myUid: ownId, fitcat_friends: JSON.stringify([first, second]), lastDate: new Date().toDateString() });
  const $ = id => document.getElementById(id);
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); await tick(); };
  const row = id => document.querySelector(`[data-friend-id="${id}"]`);
  const listeners = []; const reads = []; const updates = [];
  const refs = new Map();
  const database = () => ({ ref(path) {
    if (!refs.has(path)) refs.set(path, {
      on(type, callback, error) { listeners.push({ path, type, callback, error, active: true }); },
      off(type, callback) { for (const item of listeners) if (item.path === path && item.type === type && item.callback === callback) item.active = false; },
      once() { return new Promise(resolve => reads.push({ path, resolve: data => resolve({ val: () => data }) })); },
      async update(value) { updates.push({ path, value }); },
      onDisconnect() { return { async update() {} }; },
    });
    return refs.get(path);
  } });
  database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  const previousFirebase = globalThis.firebase;
  globalThis.firebase = { apps: [{}], database }; window.firebase = globalThis.firebase;
  const subscription = id => listeners.filter(item => item.active && item.path === 'publicProgress/' + id).at(-1);
  const activePublic = () => listeners.filter(item => item.active && item.path.startsWith('publicProgress/'));
  const payload = { name: 'Анна', online: true, dailyTargets: { kcal: 2000, protein: 100, fat: 60, carbs: 250, water: 2000 },
    todayFoods: [{ name: 'Обед', checked: true, kcal: 500, protein: 25, fat: 15, carbs: 62.5 }, { name: 'План', checked: false, kcal: 900, protein: 50, fat: 30, carbs: 100 }], waterAmount: 1000 };
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    await t.test('online listeners update names and presence without changing the saved list or leaking markup', async () => {
      await click('[data-tab="friends"]'); navigator.onLine = true; window.dispatchEvent(new Event('online')); await tick(); await tick();
      assert.equal(activePublic().length, 2); assert.equal($('friendsOfflineMsg').hidden, true);
      subscription(first).callback({ val: () => payload }); await tick();
      assert.match(row(first).textContent, /Анна/); assert.ok(row(first).querySelector('.friend-meta.is-online'));
      assert.match(row(first).textContent, /826 101 700 01/); assert.equal($('friendsCount').textContent, '2');
      subscription(first).callback({ val: () => ({ ...payload, name: '<img src=x onerror=alert(1)>' }) }); await tick();
      assert.equal(row(first).querySelector('img'), null); assert.match(row(first).textContent, /<img src=x/);
      subscription(first).callback({ val: () => payload }); await tick();
      assert.deepEqual(state.friends, [first, second]);
    });
    await t.test('progress opens with real eaten totals and correct animated targets, excluding planned food', async () => {
      await click(`[data-action="showFriendProgress"][data-value="${first}"]`);
      assert.equal($('friendProgressModal').open, true); assert.equal(document.activeElement, $('friendModalName'));
      assert.equal($('friendModalName').textContent, 'Анна'); assert.equal(reads.length, 0);
      const bars = $('friendProgressBars').querySelectorAll('[data-friend-progress]'); assert.equal(bars.length, 5);
      for (const bar of bars) assert.equal(bar.style['--fraction'], bar.dataset.friendProgress === 'water' ? '0.5' : '0.25');
      const calorieBar = bars.find(bar => bar.dataset.friendProgress === 'kcal');
      assert.match(calorieBar.parentElement.getAttribute('aria-valuetext'), /500 \/ 2.?000/);
      assert.equal(calorieBar.parentElement.getAttribute('aria-valuenow'), '25');
      await click('#friendProgressModal [data-sheet-handle]'); assert.equal($('friendProgressModal').open, false);
    });
    await t.test('leaving during a one-off load prevents a late progress dialog and duplicate requests from a busy control', async () => {
      await click(`[data-action="showFriendProgress"][data-value="${second}"]`);
      const button = row(second).querySelector('.friend-details'); assert.equal(button.disabled, true);
      assert.equal(button.getAttribute('aria-busy'), 'true'); assert.equal(reads.length, 1);
      button.click(); await tick(); assert.equal(reads.length, 1);
      await click('[data-tab="today"]'); assert.equal(activePublic().length, 0);
      reads[0].resolve({ ...payload, name: 'Поздний ответ' }); await tick(); await tick();
      assert.equal($('friendProgressModal').open, false); assert.equal(button.disabled, false);
      await click('[data-tab="friends"]'); assert.equal(activePublic().length, 2);
    });
    await t.test('removal detaches the old listener and late callbacks cannot repopulate the card or cache', async () => {
      const old = subscription(first);
      await click(`[data-action="removeFriend"][data-value="${first}"]`); await click('#confirmAccept');
      assert.equal(old.active, false); assert.equal(row(first), null); assert.deepEqual(state.friends, [second]);
      old.callback({ val: () => ({ ...payload, name: 'Устаревшее имя' }) }); old.error(); await tick();
      assert.equal(row(first), null); assert.equal($('friendsOfflineMsg').hidden, true);
      $('friendUidInput').value = first; await click('#friendAddButton');
      assert.ok(row(first)); assert.equal(row(first).textContent.includes('Устаревшее имя'), false);
      assert.equal(row(first).textContent.includes('Анна'), false); assert.equal(activePublic().length, 2);
    });
    await t.test('a connection error offers retry, and stale errors after navigation cannot change the screen', async () => {
      const current = subscription(second); current.error(); await tick();
      assert.equal($('friendsOfflineMsg').hidden, false); assert.ok($('friendsOfflineMsg').querySelector('[data-action="retryFriends"]'));
      await click('[data-action="retryFriends"]'); assert.equal($('friendsOfflineMsg').hidden, true); assert.equal(activePublic().length, 2);
      const previous = subscription(second); await click('[data-tab="activity"]');
      previous.error(); previous.callback({ val: () => ({ ...payload, name: 'Скрытая страница' }) }); await tick();
      assert.equal($('friendsOfflineMsg').hidden, true); assert.equal(activePublic().length, 0);
      await click('[data-tab="friends"]');
    });
    await t.test('offline mode detaches listeners, keeps the local list and can display already loaded progress', async () => {
      subscription(first).callback({ val: () => payload }); await tick();
      navigator.onLine = false; window.dispatchEvent(new Event('offline')); await tick();
      assert.equal(activePublic().length, 0); assert.equal($('friendsOfflineMsg').hidden, false);
      assert.equal(row(first).querySelector('.friend-meta.is-online'), null);
      const before = reads.length; await click(`[data-action="showFriendProgress"][data-value="${first}"]`);
      assert.equal($('friendProgressModal').open, true); assert.equal(reads.length, before);
      await click('#friendProgressModal [data-sheet-handle]');
      assert.deepEqual(JSON.parse(env.localStorage.getItem('fitcat_friends')), state.friends);
      assert.equal(document.head.querySelectorAll('script').filter(node => node.src?.startsWith('http')).length, 0);
    });
  } finally { for (const read of reads) read.resolve(null); globalThis.firebase = previousFirebase; env.restoreTimers(); }
});
