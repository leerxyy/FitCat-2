import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('settings redesign preserves actions, language and PRO access with no redundant Done buttons', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' }),
    hapticsEnabled: 'false', lastDate: new Date().toDateString() });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  try {
    await import('../js/app.js'); const { state } = await import('../js/core/store.js');
    await click('[data-action="showProfile"]'); await click('#profilePage [data-value="settingsPage"]');
    await t.test('native data tiles, list rows, selected-language sheen and settings back navigation are present', () => {
      assert.equal(document.activeElement, $('settingsTitle')); assert.equal($('navDock').hidden, true);
      assert.equal($('settingsPage').querySelectorAll('.settings-data-action').length, 2);
      for (const action of ['exportData', 'importData', 'showProductsManager', 'openAbout', 'openAppearance']) {
        const button = $('settingsPage').querySelector(`[data-action="${action}"]`); assert.equal(button.tagName, 'BUTTON'); assert.ok(button.querySelector('svg'));
      }
      assert.equal($('settingsPage').querySelectorAll('.settings-language').length, 3);
      assert.equal($('settingsPage').querySelectorAll('.selection-glint').length, 5);
      assert.equal($('settingsPage').querySelector('button[data-i18n="done"]'), null);
    });
    await t.test('language changes save immediately and keep the selected highlight, labels and embedded icons', async () => {
      for (const [id, language, title] of [['En', 'en', 'App language'], ['Cn', 'cn', '应用语言'], ['Ru', 'ru', 'Язык приложения']]) {
        await click(`#settingsLang${id} span`); assert.equal(state.preferences.lang, language); assert.equal(env.localStorage.getItem('fitcat_lang'), language);
        assert.equal($('settingsLanguageTitle').textContent, title); assert.equal($('settingsPage').querySelectorAll('.settings-language.active').length, 1);
        assert.equal($('settingsPage').querySelectorAll('.selection-glint').length, 5); assert.equal($('settingsPage').querySelectorAll('.settings-icon').length, 7);
      }
    });
    await t.test('the vibration preference persists without Done; its test button follows the toggle', async () => {
      assert.equal($('hapticsToggle').checked, false); assert.equal($('hapticsTest').disabled, true);
      $('hapticsToggle').checked = true; $('hapticsToggle').dispatchEvent(new Event('change')); await tick();
      assert.equal(env.localStorage.getItem('hapticsEnabled'), 'true'); assert.equal($('hapticsTest').disabled, false);
      $('hapticsToggle').checked = false; $('hapticsToggle').dispatchEvent(new Event('change')); await tick(); assert.equal($('hapticsTest').disabled, true);
    });
    await t.test('the gesture row and its RGB badge still request PRO on Basic', async () => {
      const button = $('gestureToggleBtn'); assert.equal(button.tagName, 'BUTTON'); assert.ok(button.querySelector('.pro-feature-badge'));
      await click('#gestureToggleBtn .pro-feature-text'); assert.equal($('subscriptionDialog').open, true); assert.equal(button.getAttribute('aria-pressed'), 'false');
      await click('#subscriptionDialog [data-sheet-handle]');
    });
    await t.test('products and About keep their routes, and the back arrow returns to the main screen', async () => {
      await click('#settingsPage [data-action="showProductsManager"]'); assert.equal($('productsPage').hidden, false);
      await click('#productsPage [data-value="settingsPage"]'); await click('#settingsPage [data-action="openAbout"]'); assert.equal($('aboutModal').open, true);
      await click('#aboutModal [data-sheet-handle]'); await click('#settingsBackButton'); assert.equal($('mainPage').hidden, false); assert.equal($('navDock').hidden, false);
    });
    await t.test('auto-saved sheets have no Done; transaction and record submissions remain explicit', async () => {
      for (const id of ['smartWaterModal', 'workoutModal', 'settingsPage']) assert.equal($(id).querySelector('[data-i18n="done"]'), null);
      assert.equal($('saveProfileButton'), null); assert.equal(document.querySelector('[data-action="applyDailyActivity"]'), null);
      for (const id of ['weightEntryForm', 'productEditForm', 'foodForm']) assert.ok($(id).querySelector('button[type="submit"]'), id);
      assert.ok($('photoCropSave')); assert.ok($('smartWaterModal').querySelector('[data-sheet-handle]')); assert.ok($('workoutModal').querySelector('[data-sheet-handle]'));
    });
  } finally { env.restoreTimers(); }
});
