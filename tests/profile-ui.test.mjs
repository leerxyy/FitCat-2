import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit } from './dom.mjs';

test('profile redesign keeps existing data, native photo actions, draft fields and explicit saving', async t => {
  const profile = { name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain', startWeight: 52, targetWeight: 59 };
  const env = setupDOM({ fitnessProfile: JSON.stringify(profile), fitcat_myUid: '01234567890', lastDate: new Date().toDateString(),
    fitcat_streak: '2', fitcat_lastOpen: new Date().toDateString(), profilePhoto: 'data:image/png;base64,old' });
  const $ = id => document.getElementById(id);
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); await tick(); };
  const touch = (target, type, x, y) => {
    const point = { identifier: 7, clientX: x, clientY: y }; const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [point] }, changedTouches: { value: [point] } });
    target.dispatchEvent(event); return event;
  };
  let copied = ''; navigator.clipboard.writeText = async value => { copied = value; };
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    const { renderIdentity } = await import('../js/features/profile.js');
    await t.test('opening shows actual profile values and the two photo controls are separate native circle buttons', async () => {
      await click('[data-tab="friends"]'); await click('[data-action="showProfile"]');
      assert.equal($('profilePage').hidden, false); assert.equal($('navDock').hidden, true); assert.equal(document.activeElement, $('profileTitle'));
      for (const [key, value] of Object.entries({ profileName: 'Meow', profileAge: '20', profileHeight: '165', profileWeight: '52', profileGender: 'male', profileGoal: 'maintain' })) assert.equal($(key).value, value);
      assert.equal($('profileUidDisplay').textContent, '012 345 678 90'); assert.match($('profileStreakText').textContent, /2 дня подряд/);
      assert.equal($('profilePhotoDelete').hidden, false); assert.equal($('profilePhotoDelete').tagName, 'BUTTON');
      assert.equal($('profilePhotoEdit').parentElement, $('profilePhotoDelete').parentElement);
      assert.equal($('profilePhotoDelete').closest('button'), $('profilePhotoDelete')); assert.equal($('profilePhoto').querySelector('button'), null);
      assert.ok($('profilePhotoDelete').querySelector('svg')); assert.ok($('profilePhotoEdit').querySelector('svg'));
      await click('#profilePage [data-action="copyUid"]'); assert.equal(copied, '01234567890');
    });
    await t.test('gender and goal remain draft choices until Save and leave exactly one selected option per group', async () => {
      await click('#profileGenderControl [data-value="female"]'); await click('#profileGoalControl [data-value="gain"]');
      assert.equal($('profileGender').value, 'female'); assert.equal($('profileGoal').value, 'gain');
      assert.equal($('profileGenderControl').querySelectorAll('[aria-pressed="true"]').length, 1);
      assert.equal($('profileGoalControl').querySelectorAll('[aria-pressed="true"]').length, 1);
      assert.equal($('profileGenderControl').style['--segment-index'], '0');
      assert.equal(state.profile.gender, 'male'); assert.equal(state.profile.goal, 'maintain');
    });
    await t.test('deleting a photo updates both avatars and the saved photo without overwriting typed fields', async () => {
      for (const [id, value] of Object.entries({ profileName: '  Новое имя  ', profileAge: 23, profileHeight: 171, profileWeight: 56 })) $(id).value = value;
      await click('#profilePhotoDelete'); assert.equal(state.photo, ''); assert.equal(env.localStorage.getItem('profilePhoto'), null);
      assert.equal($('profilePhotoDelete').hidden, true); assert.equal($('profilePhoto').querySelector('img'), null); assert.equal($('headerPhoto').querySelector('img'), null);
      assert.equal($('profileName').value, '  Новое имя  '); assert.equal($('profileAge').value, '23');
      assert.equal($('profileGender').value, 'female'); assert.equal($('profileGoal').value, 'gain');
      let picker = 0; const count = () => { picker++; }; $('photoInput').addEventListener('click', count);
      await click('#profilePhotoEdit'); await click('#profilePhoto'); assert.equal(picker, 2); $('photoInput').removeEventListener('click', count);
    });
    await t.test('validation prevents an invalid save; a valid save retains goals and opens Today', async () => {
      $('profileAge').value = 9; submit($('profileForm')); await tick(); assert.equal($('profilePage').hidden, false); assert.equal(state.profile.name, 'Meow');
      $('profileAge').value = 23; $('profileName').value = '   '; submit($('profileForm')); await tick(); assert.equal(state.profile.name, 'Meow');
      $('profileName').value = '  Новое имя  '; submit($('profileForm')); await tick(); await tick();
      assert.deepEqual(state.profile, { ...profile, name: 'Новое имя', age: 23, gender: 'female', height: 171, weight: 56, goal: 'gain' });
      assert.deepEqual(JSON.parse(env.localStorage.getItem('fitnessProfile')), state.profile);
      assert.equal($('mainPage').hidden, false); assert.equal($('profilePage').hidden, true); assert.equal($('navDock').hidden, false);
      assert.equal(document.querySelector('[data-tab="today"]').getAttribute('aria-current'), 'page');
      assert.equal($('todayPage').hidden, false); assert.equal($('appScroller').scrollTop, 0);
    });
    await t.test('a rightward swipe from a profile opened on another tab returns to Today without saving draft changes', async () => {
      await click('[data-tab="friends"]'); await click('[data-action="showProfile"]');
      $('profileName').value = 'Несохранённое'; const region = $('profileDataTitle');
      touch(region, 'touchstart', 60, 300); const move = touch(region, 'touchmove', 160, 305); const end = touch(region, 'touchend', 210, 309); await tick();
      assert.equal(move.defaultPrevented, true); assert.equal(end.defaultPrevented, true);
      assert.equal($('mainPage').hidden, false); assert.equal($('todayPage').hidden, false); assert.equal($('navDock').hidden, false);
      assert.equal(document.querySelector('[data-tab="today"]').getAttribute('aria-current'), 'page');
      assert.equal(state.profile.name, 'Новое имя'); assert.equal(JSON.parse(env.localStorage.getItem('fitnessProfile')).name, 'Новое имя');
      await click('[data-action="showProfile"]'); assert.equal($('profileName').value, 'Новое имя');
      await click('#profileBackButton'); assert.equal($('todayPage').hidden, false);
    });
    await t.test('translations and streak plurals update without resetting input or removing icons and glints', async () => {
      await click('[data-action="showProfile"]'); $('profileName').value = 'Черновик';
      for (const [value, text] of [[1, '1 день подряд'], [2, '2 дня подряд'], [5, '5 дней подряд'], [21, '21 день подряд']]) {
        state.streak = value; renderIdentity(); assert.equal($('profileStreakText').textContent, text);
      }
      state.streak = 2;
      for (const [language, title] of [['en', 'Personal details'], ['cn', '个人资料'], ['ru', 'Личные данные']]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        assert.equal($('profileDataTitle').textContent, title); assert.equal($('profileName').value, 'Черновик');
        assert.equal($('profileGoalControl').querySelectorAll('svg').length, 3); assert.equal($('profileGoalControl').querySelectorAll('.selection-glint').length, 3);
        assert.equal($('profileGenderControl').querySelectorAll('.selection-glint').length, 2); assert.equal($('profileUidDisplay').textContent, '012 345 678 90');
        assert.equal($('profileBackButton').getAttribute('aria-label').startsWith('profile_'), false);
      }
    });
    await t.test('the settings gear works and cancelling account deletion leaves saved data intact', async () => {
      await click('#profilePage [data-action="showPage"][data-value="settingsPage"]'); assert.equal($('settingsPage').hidden, false);
      assert.equal($('navDock').hidden, true); await click('[data-action="showPage"][data-value="mainPage"]');
      await click('[data-action="showProfile"]'); const before = env.localStorage.getItem('fitnessProfile');
      await click('#profilePage [data-action="deleteAccount"]'); assert.equal($('confirmDialog').open, true);
      await click('#confirmDialog [data-close]'); assert.equal(env.localStorage.getItem('fitnessProfile'), before);
      assert.equal($('profilePage').hidden, false);
    });
  } finally { env.restoreTimers(); }
});
