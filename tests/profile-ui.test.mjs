import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('profile autosaves valid fields and choices without a Save button or losing photo controls', async t => {
  const profile = { name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain', startWeight: 52, targetWeight: 59 };
  const env = setupDOM({ fitnessProfile: JSON.stringify(profile), fitcat_myUid: '01234567890', lastDate: new Date().toDateString(),
    fitcat_streak: '2', fitcat_lastOpen: new Date().toDateString(), profilePhoto: 'data:image/png;base64,old' });
  const $ = id => document.getElementById(id);
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); await tick(); };
  const input = async (id, value, type = 'input', composing = false) => {
    $(id).value = value; const event = new Event(type, { bubbles: true }); Object.defineProperty(event, 'isComposing', { value: composing });
    $(id).dispatchEvent(event); await tick();
  };
  const touch = (target, type, x, y) => {
    const point = { identifier: 7, clientX: x, clientY: y }; const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [point] }, changedTouches: { value: [point] } });
    target.dispatchEvent(event); return event;
  };
  let copied = ''; navigator.clipboard.writeText = async value => { copied = value; };
  try {
    await import('../js/app.js');
    const { state, loadState } = await import('../js/core/store.js');
    const { renderIdentity } = await import('../js/features/profile.js');
    await t.test('opening shows actual data, no Save button, distinct photo controls and three inline goal icons', async () => {
      await click('[data-tab="friends"]'); await click('[data-action="showProfile"]');
      assert.equal($('profilePage').hidden, false); assert.equal($('navDock').hidden, true); assert.equal(document.activeElement, $('profileTitle'));
      for (const [key, value] of Object.entries({ profileName: 'Meow', profileAge: '20', profileHeight: '165', profileWeight: '52', profileGender: 'male', profileGoal: 'maintain' })) assert.equal($(key).value, value);
      assert.equal($('profileUidDisplay').textContent, '012 345 678 90'); assert.match($('profileAchievementsText').textContent, /из 8 получено/);
      assert.equal($('saveProfileButton'), null); assert.equal($('profileForm').querySelector('button[type="submit"]'), null);
      assert.equal($('profilePhotoDelete').hidden, false); assert.equal($('profilePhotoEdit').parentElement, $('profilePhotoDelete').parentElement);
      assert.equal($('profilePhoto').querySelector('button'), null); assert.ok($('profilePhotoDelete').querySelector('svg'));
      for (const name of ['waist', 'dumbbell', 'muscle']) {
        const svg = $('profileGoalControl').querySelector(`[data-goal-icon="${name}"]`);
        assert.ok(svg); assert.equal(svg.getAttribute('viewBox'), '0 0 24 24'); assert.equal(svg.querySelector('use'), null);
        assert.ok(svg.querySelector('path').getAttribute('d').length > 20);
      }
      assert.equal($('profileGoalControl').querySelector('[data-goal-icon="muscle"]').querySelectorAll('path').length, 3);
      await click('#profilePage [data-action="copyUid"]'); assert.equal(copied, '01234567890');
    });
    await t.test('gender and goal persist immediately while leaving one selected choice and its glint', async () => {
      await click('#profileGenderControl [data-value="female"]'); await click('#profileGoalControl [data-value="gain"]');
      assert.equal(state.profile.gender, 'female'); assert.equal(state.profile.goal, 'gain');
      const saved = JSON.parse(env.localStorage.getItem('fitnessProfile')); assert.equal(saved.goal, 'gain'); assert.equal(saved.gender, 'female');
      assert.equal(saved.startWeight, 52); assert.equal(saved.targetWeight, 59);
      assert.equal($('profileGenderControl').querySelectorAll('[aria-pressed="true"]').length, 1);
      assert.equal($('profileGoalControl').querySelectorAll('[aria-pressed="true"]').length, 1);
      assert.equal($('profileGenderControl').style['--segment-index'], '0'); assert.equal($('profilePage').hidden, false);
    });
    await t.test('valid typing persists synchronously without requiring blur, Enter or leaving the profile', async () => {
      await input('profileName', '  Новое имя  '); await input('profileAge', 23); await input('profileHeight', 171); await input('profileWeight', 56);
      assert.deepEqual(state.profile, { ...profile, name: 'Новое имя', age: 23, gender: 'female', height: 171, weight: 56, goal: 'gain' });
      assert.deepEqual(JSON.parse(env.localStorage.getItem('fitnessProfile')), state.profile);
      assert.equal($('profileName').value, '  Новое имя  '); assert.equal($('profilePage').hidden, false);
      assert.match($('profileAutosaveText').textContent, /Сохранено/);
      await click('#profilePhotoDelete'); assert.equal(state.photo, ''); assert.equal(env.localStorage.getItem('profilePhoto'), null);
      assert.equal($('profilePhotoDelete').hidden, true); assert.equal($('profileName').value, '  Новое имя  '); assert.equal($('profileWeight').value, '56');
      let picks = 0; const count = () => { picks++; }; $('photoInput').addEventListener('click', count);
      await click('#profilePhotoEdit'); await click('#profilePhoto'); assert.equal(picks, 2); $('photoInput').removeEventListener('click', count);
    });
    await t.test('empty, partial, out-of-range and fractional integer fields never overwrite the last valid values', async () => {
      const saved = structuredClone(state.profile);
      for (const [id, value] of [['profileAge', 9], ['profileName', '   '], ['profileHeight', 80], ['profileWeight', ''], ['profileAge', 23.5]]) {
        await input(id, value, 'change'); assert.equal($(id).getAttribute('aria-invalid'), 'true');
        assert.deepEqual(state.profile, saved); assert.deepEqual(JSON.parse(env.localStorage.getItem('fitnessProfile')), saved);
      }
      await input('profileName', '输入中', 'input', true); assert.equal(state.profile.name, saved.name);
      await input('profileName', '完成', 'compositionend'); assert.equal(state.profile.name, '完成');
      await input('profileName', saved.name); await input('profileAge', saved.age); await input('profileHeight', saved.height); await input('profileWeight', 56.5, 'change');
      assert.equal(state.profile.weight, 56.5); assert.equal($('profileWeight').getAttribute('aria-invalid'), 'false');
    });
    await t.test('a write failure shows an error and retains the previous profile until a successful edit', async () => {
      const write = env.localStorage.setItem, previousError = console.error; const before = structuredClone(state.profile); console.error = () => {};
      env.localStorage.setItem = (key, value) => { if (key === 'fitnessProfile') throw new Error('quota'); write(key, value); };
      try {
        await input('profileName', 'Не записано'); assert.deepEqual(state.profile, before);
        assert.deepEqual(JSON.parse(env.localStorage.getItem('fitnessProfile')), before); assert.equal($('profileAutosave').dataset.state, 'error');
      } finally { env.localStorage.setItem = write; console.error = previousError; }
      await input('profileName', before.name); await input('profileAge', 24); assert.equal(state.profile.age, 24);
    });
    await t.test('a quick rightward swipe returns to Today with the most recent typed value already saved', async () => {
      await click('#profileBackButton'); await click('[data-tab="friends"]'); await click('[data-action="showProfile"]');
      await input('profileName', 'Сохранено свайпом'); const region = $('profileDataTitle');
      touch(region, 'touchstart', 60, 300); const move = touch(region, 'touchmove', 160, 305); const end = touch(region, 'touchend', 210, 309); await tick();
      assert.equal(move.defaultPrevented, true); assert.equal(end.defaultPrevented, true); assert.equal($('todayPage').hidden, false); assert.equal($('mainPage').hidden, false);
      assert.equal(document.querySelector('[data-tab="today"]').getAttribute('aria-current'), 'page');
      assert.equal(JSON.parse(env.localStorage.getItem('fitnessProfile')).name, 'Сохранено свайпом');
      loadState(env.localStorage); await click('[data-action="showProfile"]'); assert.equal($('profileName').value, 'Сохранено свайпом');
    });
    await t.test('achievements replace the streak display without mutating history; translations retain typed fields and glints', async () => {
      $('profileName').value = 'Текущий ввод';
      for (const count of [1, 2, 5, 21]) {
        state.streak = count; renderIdentity(); assert.equal(state.streak, count);
        assert.equal($('profileStreakText'), null); assert.equal($('streakCount'), null);
        assert.match($('profileAchievementsText').textContent, /из 8 получено/);
      }
      assert.ok(document.querySelector('.profile-achievements use[href$="#achievement"]'));
      for (const [language, title] of [['en', 'Personal details'], ['cn', '个人资料'], ['ru', 'Личные данные']]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        assert.equal($('profileDataTitle').textContent, title);
        assert.match($('profileAchievementsText').textContent, {ru:/из 8 получено/,en:/of 8 earned/,cn:/已获得/}[language]); assert.equal($('profileName').value, 'Текущий ввод');
        assert.equal($('profileGoalControl').querySelectorAll('svg').length, 3); assert.equal($('profileGoalControl').querySelectorAll('.selection-glint').length, 3);
        assert.equal($('profileGenderControl').querySelectorAll('.selection-glint').length, 2); assert.equal($('profileUidDisplay').textContent, '012 345 678 90');
      }
    });
    await t.test('settings navigation and cancelling account deletion leave saved data intact', async () => {
      await click('#profilePage [data-action="showPage"][data-value="settingsPage"]'); assert.equal($('settingsPage').hidden, false);
      assert.equal($('navDock').hidden, true); await click('#settingsBackButton'); await click('[data-action="showProfile"]');
      const before = env.localStorage.getItem('fitnessProfile'); await click('#profilePage [data-action="deleteAccount"]'); await click('#confirmDialog [data-close]');
      assert.equal(env.localStorage.getItem('fitnessProfile'), before); assert.equal($('profilePage').hidden, false);
    });
  } finally { env.restoreTimers(); }
});
