import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

const pointer = (target, type, x, y = 400, extra = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...extra })) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event); return event;
};

test('all five glass selectors preview freely and commit through the real autosave/navigation actions', async t => {
  const profile = { name: 'Meow', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain', startWeight: 80, targetWeight: 75 };
  const env = setupDOM({ fitnessProfile: JSON.stringify(profile), lastDate: new Date().toDateString() });
  const $ = id => document.getElementById(id);
  window.PointerEvent = class {};
  const layouts = new Map();
  for (const [id, width, height, padding, gap] of [['bottomNav', 372, 70, 6, 0], ['profileGenderControl', 254, 46, 3, 0], ['profileGoalControl', 320, 81, 0, 8], ['settingsLanguageControl', 310, 51, 3, 3], ['statisticsSwitch', 320, 53, 4, 0]]) {
    const track = $(id), buttons = track.querySelectorAll('button'), left = 20, top = 300;
    const size = (width - padding * 2 - gap * (buttons.length - 1)) / buttons.length;
    Object.assign(track, { offsetWidth: width, offsetHeight: height, getBoundingClientRect: () => ({ left, top, width, height }) });
    buttons.forEach((button, i) => Object.assign(button, { offsetLeft: padding + (size + gap) * i, offsetTop: padding, offsetWidth: size, offsetHeight: height - padding * 2 }));
    layouts.set(id, buttons.map(button => left + button.offsetLeft + button.offsetWidth / 2));
  }
  const click = async selector => {
    const element = document.querySelector(selector); assert.ok(element, selector);
    const event = new Event('click', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'detail', { value: 0 });
    element.dispatchEvent(event); await tick(); await tick();
  };
  const begin = (id, index) => pointer($(id), 'pointerdown', layouts.get(id)[index]);
  const move = (id, index, y = 590) => pointer(document, 'pointermove', layouts.get(id)[index], y);
  const end = (id, index, y = 590) => pointer(document, 'pointerup', layouts.get(id)[index], y);
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    const { openDialog, closeDialog } = await import('../js/ui/components.js');
    await t.test('every requested control owns one decorative lens while native buttons remain accessible', () => {
      for (const id of layouts.keys()) {
        assert.ok($(id).classList.contains('has-selection-lens'), id);
        assert.equal($(id).querySelectorAll('.selection-lens').length, 1, id);
        assert.equal($(id).querySelector('.selection-lens').getAttribute('aria-hidden'), 'true');
        assert.ok($(id).querySelector('.selection-lens-shine'));
      }
    });
    await click('[data-action="showProfile"]');
    await t.test('gender follows the finger off the track without saving previews or leaving Profile', async () => {
      assert.equal($('profileGenderControl').style['--lens-index'], '1');
      const before = env.localStorage.getItem('fitnessProfile'); let writes = 0;
      const write = env.localStorage.setItem;
      env.localStorage.setItem = (key, value) => { if (key === 'fitnessProfile') writes++; write(key, value); };
      try {
        begin('profileGenderControl', 1); move('profileGenderControl', .0, 700);
        assert.equal($('profileGenderControl').classList.contains('is-scrubbing'), true);
        assert.equal(state.profile.gender, 'male'); assert.equal(env.localStorage.getItem('fitnessProfile'), before);
        assert.equal($('profilePage').hidden, false); assert.equal(writes, 0);
        end('profileGenderControl', 0, 700); await tick();
        assert.equal(state.profile.gender, 'female'); assert.equal(writes, 1);
        assert.equal(JSON.parse(env.localStorage.getItem('fitnessProfile')).gender, 'female');
        assert.equal($('profileGenderControl').querySelectorAll('[aria-pressed="true"]').length, 1);
        assert.equal($('profileGenderControl').style['--lens-index'], '0');
      } finally { env.localStorage.setItem = write; }
    });
    await t.test('the goal lens crosses all three cards and saves only the released goal', async () => {
      begin('profileGoalControl', 1); move('profileGoalControl', 0); move('profileGoalControl', 2);
      assert.equal(state.profile.goal, 'maintain'); assert.equal($('profileGoal').value, 'maintain');
      end('profileGoalControl', 2); await tick();
      assert.equal(state.profile.goal, 'gain'); assert.equal(JSON.parse(env.localStorage.getItem('fitnessProfile')).goal, 'gain');
      assert.equal($('profileGoalControl').querySelector('[aria-pressed="true"]').dataset.value, 'gain');
      assert.equal($('profileGoalControl').style['--lens-index'], '2');
      assert.equal(state.profile.gender, 'female'); assert.equal(state.profile.targetWeight, 75);
    });
    await t.test('an open sheet, backgrounding and pagehide cancel any pending profile choice', async () => {
      for (const cancel of [() => { openDialog('walletDialog'); closeDialog('walletDialog'); },
        () => { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); document.hidden = false; },
        () => window.dispatchEvent(new Event('pagehide'))]) {
        begin('profileGoalControl', 2); move('profileGoalControl', 0); cancel(); end('profileGoalControl', 0); await tick();
        assert.equal(state.profile.goal, 'gain'); assert.equal($('profileGoalControl').style['--lens-index'], '2');
        assert.equal($('profileGoalControl').classList.contains('is-scrubbing'), false);
      }
    });
    await click('#profilePage [data-value="settingsPage"]');
    await t.test('language preview leaves text unchanged; releasing updates and saves the actual language', async () => {
      begin('settingsLanguageControl', 0); move('settingsLanguageControl', 2);
      assert.equal(state.preferences.lang, 'ru'); assert.equal($('settingsLanguageTitle').textContent, 'Язык приложения');
      end('settingsLanguageControl', 2); await tick();
      assert.equal(state.preferences.lang, 'cn'); assert.equal(env.localStorage.getItem('fitcat_lang'), 'cn');
      assert.equal($('settingsLanguageTitle').textContent, '应用语言'); assert.equal($('settingsLanguageControl').style['--lens-index'], '2');
      await click('#settingsLangEn span'); assert.equal(state.preferences.lang, 'en'); assert.equal($('settingsLanguageControl').style['--lens-index'], '1');
      await click('#settingsLangRu'); assert.equal($('settingsLanguageControl').style['--lens-index'], '0');
    });
    await click('#settingsBackButton'); await click('[data-tab="analytics"]');
    await t.test('Weight/Food previews keep the current panel and commit one accessible panel on release', async () => {
      begin('statisticsSwitch', 0); move('statisticsSwitch', 1);
      assert.equal($('weightStatisticsPanel').hidden, false); assert.equal($('nutritionStatisticsPanel').hidden, true);
      assert.equal($('statsWeightButton').getAttribute('aria-selected'), 'true');
      end('statisticsSwitch', 1); await tick();
      assert.equal($('weightStatisticsPanel').hidden, true); assert.equal($('nutritionStatisticsPanel').hidden, false);
      assert.equal($('statsNutritionButton').getAttribute('aria-selected'), 'true');
      assert.equal($('statisticsSwitch').style['--lens-index'], '1'); assert.equal($('bottomNav').style['--lens-index'], '2');
      const event = new Event('keydown', { bubbles: true, cancelable: true }); event.key = 'Home'; $('statisticsSwitch').dispatchEvent(event); await tick();
      assert.equal($('statisticsSwitch').style['--lens-index'], '0'); assert.equal(document.activeElement, $('statsWeightButton'));
    });
    await t.test('a second finger on another track cancels both previews without changing a page', async () => {
      begin('bottomNav', 2); move('bottomNav', 3);
      pointer($('statisticsSwitch'), 'pointerdown', layouts.get('statisticsSwitch')[0], 400, { pointerId: 2, isPrimary: false });
      end('bottomNav', 3); await tick();
      assert.equal($('analyticsPage').hidden, false); assert.equal($('bottomNav').style['--lens-index'], '2');
      assert.equal($('bottomNav').classList.contains('is-scrubbing'), false); assert.equal($('statisticsSwitch').classList.contains('is-scrubbing'), false);
    });
    await t.test('returning to Profile restores the lens from the auto-saved fields', async () => {
      await click('[data-action="showProfile"]');
      assert.equal($('profileGenderControl').style['--lens-index'], '0'); assert.equal($('profileGoalControl').style['--lens-index'], '2');
      assert.equal($('profileGender').value, 'female'); assert.equal($('profileGoal').value, 'gain');
      assert.equal($('saveProfileButton'), null); assert.equal($('profilePage').hidden, false);
    });
    await t.test('quick swipes commit all five selectors without a hold or intermediate move event', async () => {
      begin('profileGenderControl', 0); end('profileGenderControl', 1);
      assert.equal(state.profile.gender, 'male'); assert.equal(JSON.parse(env.localStorage.getItem('fitnessProfile')).gender, 'male');
      begin('profileGoalControl', 2); end('profileGoalControl', 0);
      assert.equal(state.profile.goal, 'lose'); assert.equal(JSON.parse(env.localStorage.getItem('fitnessProfile')).goal, 'lose');
      await click('#profilePage [data-value="settingsPage"]');
      begin('settingsLanguageControl', 0); end('settingsLanguageControl', 1);
      assert.equal(state.preferences.lang, 'en'); assert.equal(env.localStorage.getItem('fitcat_lang'), 'en');
      await click('#settingsBackButton');
      begin('bottomNav', 2); end('bottomNav', 0); assert.equal($('todayPage').hidden, false);
      begin('bottomNav', 0); end('bottomNav', 2); assert.equal($('analyticsPage').hidden, false);
      begin('statisticsSwitch', 0); end('statisticsSwitch', 1); assert.equal($('nutritionStatisticsPanel').hidden, false);
      for (const id of layouts.keys()) assert.equal($(id).classList.contains('is-lens-held'), false, id);
    });
  } finally { env.restoreTimers(); }
});
