import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';
import { audioFixture, microtasks } from './audio-fixture.mjs';
import { SOUND_STYLES, BASIC_SOUND_STYLES, SOUND_DEFAULTS } from '../js/core/sounds.js';
import { APPEARANCE_DEFAULTS, APPEARANCE_KEY } from '../js/core/appearance.js';

test('sound feedback integrates preview, autosave, volume, translation and reset in Appearance', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Meow', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }), lastDate: new Date().toDateString(), fitcat_wallet_v1: 'unchanged' });
  const f = audioFixture(), originalFetch = globalThis.fetch;
  window.AudioContext = f.Context;
  globalThis.fetch = (url, ...args) => String(url).includes('/assets/audio/') ? f.fetch(url) : originalFetch(url, ...args);
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await microtasks(); };
  const toggle = value => { $('appearanceSoundEnabled').checked = value; $('appearanceSoundEnabled').dispatchEvent(new Event('change', { bubbles: true })); };
  try {
    await import('../js/app.js');
    const { state } = await import('../js/core/store.js');
    await click('[data-action="showProfile"]'); await click('#profilePage [data-value="settingsPage"]'); await click('#openAppearance'); await click('#appearanceAudioTab');
    await t.test('sound tab has twenty independent choices and previews, disabled by default', () => {
      assert.equal($('appearanceAudioPanel').hidden, false); assert.equal($('appearancePreview').hidden, true);
      assert.equal($('appearanceSoundEnabled').checked, false); assert.equal($('appearanceSoundEnabled').disabled, false); assert.equal(f.stats.contexts.length, 0);
      assert.equal($('appearanceAudioPanel').querySelectorAll('[data-sound-card]').length, 20);
      assert.equal($('appearanceAudioPanel').querySelectorAll('[data-audio-preview]').length, 20);
      assert.equal($('appearanceAudioPanel').querySelectorAll('[data-pro-feature="sounds"]').length,14);
      assert.equal($('appearanceAudioPanel').querySelector('button button'), null);
      assert.equal($('appearanceSoundVolume').value, '25');
    });
    await t.test('preview while switched off does not change saved settings or selected style', async () => {
      const before = env.localStorage.getItem(APPEARANCE_KEY);
      await click('[data-audio-preview="drop"]');
      assert.equal(f.stats.plays.at(-1).buffer.style, 'drop'); assert.equal(state.appearance.soundEnabled, false); assert.equal(state.appearance.soundStyle, 'glass');
      assert.equal(env.localStorage.getItem(APPEARANCE_KEY), before); assert.equal($('appearanceAudioPanel').querySelector('[data-sound-card="drop"]').dataset.previewing, 'true');
      f.stats.plays.at(-1).finish(); assert.equal($('appearanceAudioPanel').querySelector('[data-sound-card="drop"]').dataset.previewing, 'false');
    });
    await t.test('a selected sound saves immediately, remains unique, and another preview leaves it selected', async () => {
      for (const style of BASIC_SOUND_STYLES) {
        await click(`[data-appearance-kind="soundStyle"][data-value="${style}"]`);
        assert.equal(state.appearance.soundStyle, style); assert.equal((JSON.parse(env.localStorage.getItem(APPEARANCE_KEY))??APPEARANCE_DEFAULTS).soundStyle, style);
        assert.equal($('appearanceAudioPanel').querySelectorAll('[data-selected="true"]').length, 1);
        assert.equal($('appearanceAudioPanel').querySelectorAll('[aria-pressed="true"]').length, 1);
      }
      await click('[data-audio-preview="glass"]'); assert.equal(state.appearance.soundStyle, 'air'); assert.equal(f.stats.plays.at(-1).buffer.style, 'glass');
    });
    await t.test('enable and volume controls autosave while continuous movement does not play per input event', async () => {
      toggle(true); await microtasks(); assert.equal(state.appearance.soundEnabled, true); assert.equal(JSON.parse(env.localStorage.getItem(APPEARANCE_KEY)).soundEnabled, true);
      const input = $('appearanceSoundVolume'), count = f.stats.plays.length;
      input.focus();
      for (let value = 26; value <= 70; value++) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
      assert.equal(f.stats.plays.length, count); assert.equal($('appearanceSoundVolumeOutput').textContent, '70%');
      input.dispatchEvent(new Event('change', { bubbles: true })); await microtasks();
      assert.equal(f.stats.plays.length, count + 1); assert.equal(state.appearance.soundVolume, 70); assert.equal(f.stats.contexts[0].master.gain.value, .7);
    });
    await t.test('zero volume is silent and disabling stops playback without erasing style or volume', async () => {
      const input = $('appearanceSoundVolume'); input.value = 0; input.dispatchEvent(new Event('change', { bubbles: true })); await microtasks();
      assert.equal(state.appearance.soundVolume, 0); for (const button of $('appearanceAudioPanel').querySelectorAll('[data-audio-preview]')) assert.equal(button.disabled, true);
      const count = f.stats.plays.length; await click('[data-audio-preview="air"]'); assert.equal(f.stats.plays.length, count);
      input.value = 40; input.dispatchEvent(new Event('change', { bubbles: true })); await microtasks(); toggle(false); await microtasks();
      assert.equal(state.appearance.soundStyle, 'air'); assert.equal(state.appearance.soundVolume, 40); assert.equal(state.appearance.soundEnabled, false); assert.ok(f.stats.stops.length);
    });
    await t.test('theme changes, clear glass and navigation preserve the audio choice', async () => {
      await click('#appearanceStyleTab'); assert.equal($('appearancePreview').hidden, false);
      await click('[data-appearance-kind="theme"][data-value="forest"]');
      const input = $('appearancePage').querySelector('[data-appearance-range="transparency"]'); input.value = 70; input.dispatchEvent(new Event('change', { bubbles: true }));
      await click('[data-action="appearanceBack"]'); await click('#openAppearance'); await click('#appearanceAudioTab');
      assert.equal(state.appearance.soundStyle, 'air'); assert.equal($('appearanceSoundVolume').value, '40'); assert.equal(document.documentElement.style['--appearance-glass-filter'], 'none');
    });
    await t.test('real app visibility and pagehide lifecycle pause audio until another interaction', async () => {
      await click('[data-audio-preview="air"]'); const before=f.stats.suspends;
      document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));await microtasks();
      assert.equal(f.stats.suspends,before+1);const count=f.stats.plays.length;
      document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await microtasks();assert.equal(f.stats.plays.length,count);
      await click('[data-audio-preview="air"]');assert.equal(f.stats.plays.length,count+1);
      window.dispatchEvent(new Event('pagehide'));await microtasks();assert.equal(f.stats.suspends,before+2);
      window.dispatchEvent(new Event('pageshow'));await click('[data-audio-preview="glass"]');assert.equal(f.stats.plays.length,count+2);
    });
    await t.test('labels and preview names translate to English and Chinese', () => {
      for (const [lang, title, listen] of [['en', 'Sound feedback', 'Preview: Glass'], ['cn', '声音反馈', '试听: 玻璃'], ['ru', 'Звуковой отклик', 'Прослушать: Стекло']]) {
        state.preferences.lang = lang; document.dispatchEvent(new Event('fitcat:language'));
        assert.equal($('appearanceAudioPanel').querySelector('[data-i18n="appearance_sound_title"]').textContent, title);
        assert.equal($('appearanceAudioPanel').querySelector('[data-audio-preview="glass"]').getAttribute('aria-label'), listen);
      }
    });
    await t.test('default reset clears audio customization and retains profile, diary and wallet', async () => {
      await click('#appearanceReset'); assert.deepEqual(state.appearance, APPEARANCE_DEFAULTS); assert.equal(state.profile.name, 'Meow'); assert.equal(env.localStorage.getItem('fitcat_wallet_v1'), 'unchanged');
      assert.equal($('appearanceSoundEnabled').checked, false); assert.equal($('appearanceSoundVolume').value, '25');
      assert.equal($('appearanceAudioPanel').querySelector('[data-sound-card="glass"]').dataset.selected, 'true');
    });
  } finally { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); globalThis.fetch = originalFetch; env.restoreTimers(); }
});

test('delegated audio responds to genuine controls and completed selection swipes without duplicates', async () => {
  const env = setupDOM(), f = audioFixture(), originalFetch = globalThis.fetch, originalPerformance = globalThis.performance;
  const { state } = await import('../js/core/store.js'); state.appearance = { ...APPEARANCE_DEFAULTS, soundEnabled: true };
  window.AudioContext = f.Context; globalThis.fetch = f.fetch; globalThis.performance = { now: f.now };
  const handlers = {}, add = document.addEventListener.bind(document);
  document.addEventListener = (type, handler, options) => { handlers[type] = handler; add(type, handler, options); };
  const { initInterfaceAudio, pauseInterfaceAudio } = await import('../js/ui/sounds.js'); const controller = initInterfaceAudio();
  const button = document.createElement('button'); document.body.append(button);
  try {
    handlers.click({ isTrusted: false, target: button }); await microtasks(); assert.equal(f.stats.plays.length, 0);
    handlers.click({ isTrusted: true, target: button }); handlers.submit({ isTrusted: true }); await microtasks(); assert.equal(f.stats.plays.length, 1);
    f.advance(); button.disabled = true; handlers.click({ isTrusted: true, target: button }); await microtasks(); assert.equal(f.stats.plays.length, 1); button.disabled = false;
    const preview = document.createElement('button'); preview.dataset.audioPreview = 'drop'; document.body.append(preview);
    handlers.click({ isTrusted: true, target: preview }); await microtasks(); assert.equal(f.stats.plays.length, 1);
    handlers['fitcat:selection']({ detail: { trusted: false } }); await microtasks(); assert.equal(f.stats.plays.length, 1);
    handlers['fitcat:selection']({ detail: { trusted: true } }); await microtasks(); assert.equal(f.stats.plays.length, 2);
    f.advance(); handlers.click({ isTrusted: true, target: button, defaultPrevented: true }); await microtasks(); assert.equal(f.stats.plays.length, 2);
    document.hidden = true; void pauseInterfaceAudio(); await microtasks(); assert.equal(f.stats.suspends, 1);
    document.hidden = false; f.advance(); handlers.click({ isTrusted: true, target: button }); await microtasks(); assert.equal(f.stats.plays.length, 3); assert.equal(f.stats.resumes, 2);
  } finally { controller.dispose(); env.restoreTimers(); globalThis.fetch = originalFetch; globalThis.performance = originalPerformance; }
});
