import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit } from './dom.mjs';

test('Friends redesign supports real IDs, local additions, accessible feedback and safe removal', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }),
    fitcat_myUid: '01234567890', lastDate: new Date().toDateString() });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const row = id => document.querySelector(`[data-friend-id="${id}"]`);
  let copied = '';
  navigator.clipboard.writeText = async value => { copied = value; };
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    await t.test('the identity card shows and copies the actual 11-digit ID, including a leading zero', async () => {
      await click('[data-tab="friends"]');
      assert.equal($('friendsUidDisplay').textContent, '012 345 678 90');
      assert.equal($('friendsListHeading').hidden, true); assert.match($('friendsList').textContent, /Вместе легче/);
      assert.equal($('friendsOfflineMsg').hidden, false); assert.equal(state.friends.length, 0);
      await click('#friendsPage [data-action="copyUid"]');
      assert.equal(copied, '01234567890'); assert.match($('toast').textContent, /скопирован/);
    });
    await t.test('invalid and own IDs give inline feedback and cannot create a friend', async () => {
      for (const value of ['', '123', '82A610170001', '012 345 678 90']) {
        $('friendUidInput').value = value; await click('#friendAddButton');
        assert.equal(state.friends.length, 0); assert.equal($('friendsIdFeedback').hidden, false);
        assert.equal($('friendUidInput').getAttribute('aria-invalid'), 'true');
      }
      assert.match($('friendsIdFeedback').textContent, /собственный ID/);
      $('friendUidInput').dispatchEvent(new Event('input')); assert.equal($('friendsIdFeedback').hidden, true);
      assert.equal($('friendUidInput').hasAttribute('aria-invalid'), false);
    });
    await t.test('both form submission and the plus button accept formatted IDs once and retain the existing storage key', async () => {
      $('friendUidInput').value = '826 101 700 01'; submit($('friendAddForm')); await tick(); await tick();
      assert.deepEqual(state.friends, ['82610170001']); assert.ok(row('82610170001'));
      assert.equal($('friendsCount').textContent, '1'); assert.equal($('friendsListHeading').hidden, false);
      assert.equal($('friendsList').getAttribute('role'), 'list'); assert.equal($('friendsList').querySelector('.friends-empty'), null);
      assert.equal($('friendUidInput').value, '');
      $('friendUidInput').value = '82610170001'; await click('#friendAddButton');
      assert.deepEqual(state.friends, ['82610170001']); assert.match($('friendsIdFeedback').textContent, /уже есть/);
      $('friendUidInput').value = '826-101-700-02'; await click('#friendAddButton');
      assert.deepEqual(state.friends, ['82610170001', '82610170002']); assert.equal($('friendsCount').textContent, '2');
      assert.deepEqual(JSON.parse(env.localStorage.getItem('fitcat_friends')), state.friends);
      assert.equal(document.head.querySelectorAll('script').filter(node => node.src?.startsWith('http')).length, 0);
    });
    await t.test('offline progress provides a useful message without an empty modal or a network request', async () => {
      await click('[data-action="showFriendProgress"][data-value="82610170001"]');
      assert.equal($('friendProgressModal').open, false); assert.match($('toast').textContent, /Подключись к интернету/);
      assert.equal(row('82610170001').querySelector('.friend-details').disabled, false);
      assert.equal(document.head.querySelectorAll('script').filter(node => node.src?.startsWith('http')).length, 0);
    });
    await t.test('cancel keeps a friend; confirmation removes exactly the selected ID and restores the empty card after the last removal', async () => {
      await click('[data-action="removeFriend"][data-value="82610170001"]');
      assert.match($('confirmMessage').textContent, /826 101 700 01/); await click('#confirmDialog [data-close]');
      assert.equal(state.friends.length, 2);
      for (const id of ['82610170001', '82610170002']) {
        await click(`[data-action="removeFriend"][data-value="${id}"]`); await click('#confirmAccept');
        assert.equal(row(id), null); assert.equal(state.friends.includes(id), false);
      }
      assert.deepEqual(JSON.parse(env.localStorage.getItem('fitcat_friends')), []);
      assert.equal($('friendsListHeading').hidden, true); assert.match($('friendsList').textContent, /Вместе легче/);
    });
    await t.test('translation preserves ID, copy and plus controls and localizes validation feedback', async () => {
      $('friendUidInput').value = 'bad'; await click('#friendAddButton');
      for (const [language, emptyTitle, addLabel] of [['en', 'Better together', 'Add friend'], ['cn', '一起更轻松', '添加好友'], ['ru', 'Вместе легче', 'Добавить друга']]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        assert.match($('friendsList').textContent, new RegExp(emptyTitle));
        assert.equal($('friendAddButton').getAttribute('aria-label'), addLabel);
        assert.equal($('friendsUidDisplay').textContent, '012 345 678 90');
        assert.equal($('friendAddButton').querySelectorAll('.selection-glint').length, 1);
        assert.ok($('friendAddButton').querySelector('svg')); assert.ok(document.querySelector('#friendsPage [data-action="copyUid"] svg'));
        assert.equal($('friendsIdFeedback').textContent.startsWith('invalid_'), false);
      }
    });
    await t.test('confirmed removal is persisted before its decorative exit finishes', async () => {
      $('friendUidInput').value = '82610170001'; await click('#friendAddButton');
      const node = row('82610170001'); let finish;
      node.getBoundingClientRect = () => ({ width: 300, height: 80, top: 0, left: 0 });
      node.animate = () => ({ finished: new Promise(resolve => { finish = resolve; }), cancel() {} });
      const media = globalThis.matchMedia; globalThis.matchMedia = () => ({ matches: false });
      try {
        await click('[data-action="removeFriend"][data-value="82610170001"]'); await click('#confirmAccept');
        assert.deepEqual(state.friends, []); assert.deepEqual(JSON.parse(env.localStorage.getItem('fitcat_friends')), []);
        assert.equal(node.classList.contains('is-removing'), true); assert.equal(node.inert, true);
        assert.ok(row('82610170001')); finish(); await tick(); await tick();
        assert.equal(row('82610170001'), null); assert.match($('friendsList').textContent, /Вместе легче/);
      } finally { finish?.(); globalThis.matchMedia = media; }
    });
  } finally { env.restoreTimers(); }
});
