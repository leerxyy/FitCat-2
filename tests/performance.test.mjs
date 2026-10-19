import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, state, persist, setLowDetailMode, setAppearance, exportSnapshot, importSnapshot, clearAccount } from '../js/core/store.js';
import { APPEARANCE_DEFAULTS, THEME_PRESETS } from '../js/core/appearance.js';
import { setupDOM, tick } from './dom.mjs';
import { localDate } from '../js/core/math.js';
import { number } from '../js/core/i18n.js';

const profile = { name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' };
const key = 'fitcat_low_detail_mode_v1';
function storage(seed = {}) {
  const data = new Map(Object.entries(seed)), writes = [];
  return { data, writes, getItem: name => data.get(name) ?? null, setItem(name, value) { writes.push(name); data.set(name, String(value)); }, removeItem: name => data.delete(name) };
}

test('LDM is free, defaults off, persists independently of themes and survives a reload', () => {
  const adapter = storage({ fitnessProfile: JSON.stringify(profile), unrelated: 'keep' }); loadState(adapter);
  assert.equal(state.preferences.lowDetailMode, false); setLowDetailMode(true);
  setAppearance({ ...THEME_PRESETS.ocean, transparency: 70, deviceTilt: true });
  loadState(adapter); assert.equal(state.preferences.lowDetailMode, true); assert.equal(state.appearance.transparency, 70); assert.equal(state.appearance.deviceTilt, true);
  setAppearance(APPEARANCE_DEFAULTS); assert.equal(state.preferences.lowDetailMode, true);
  setLowDetailMode(false); loadState(adapter); assert.equal(state.preferences.lowDetailMode, false); assert.equal(adapter.getItem('unrelated'), 'keep');
});

test('a failed LDM save retains the previous flag; backups preserve it and old backups keep the current setting', () => {
  const adapter = storage({ fitnessProfile: JSON.stringify(profile) }); loadState(adapter); setLowDetailMode(true); persist();
  const backup = structuredClone(exportSnapshot()); setLowDetailMode(false); importSnapshot(backup); assert.equal(state.preferences.lowDetailMode, true);
  importSnapshot({ profile, foods: [], weight: [] }); assert.equal(state.preferences.lowDetailMode, true);
  const write = adapter.setItem;
  adapter.setItem = (name, value) => { if (name === key) throw new Error('quota'); write(name, value); };
  assert.throws(() => setLowDetailMode(false), /quota/); assert.equal(state.preferences.lowDetailMode, true); assert.equal(adapter.getItem(key), 'true');
  adapter.setItem = write; clearAccount(); assert.equal(adapter.getItem(key), null);
});

test('unchanged diary saves make no repeated storage writes, but changed fields and external changes still commit', () => {
  const adapter = storage({ fitnessProfile: JSON.stringify(profile) }); loadState(adapter); persist(); adapter.writes.length = 0;
  persist(); assert.deepEqual(adapter.writes, []);
  state.water += 250; persist(); assert.deepEqual(adapter.writes, ['waterAmount']);
  adapter.writes.length = 0; adapter.data.set('waterAmount', '0'); persist(); assert.deepEqual(adapter.writes, ['waterAmount']);
  assert.equal(adapter.getItem('waterAmount'), '250');
});
test('number formatter reuse keeps locale and rounding while avoiding constructors on each animated value', () => {
  const Original = Intl.NumberFormat; let created = 0;
  Intl.NumberFormat = class extends Original { constructor(...args) { super(...args); created++; } };
  try {
    state.preferences.lang = 'ru';
    for (let i = 0; i < 1000; i++) assert.equal(number(1234.5678, 3), '1\u00a0234,568');
    assert.equal(created, 1); state.preferences.lang = 'en'; assert.equal(number(1234.5678, 3), '1,234.568'); assert.equal(created, 2);
  } finally { Intl.NumberFormat = Original; state.preferences.lang = 'ru'; }
});

test('LDM controls, cosmetics and journal caches preserve the real UI data', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify(profile), lastDate: new Date().toDateString(),
    weightHistory: JSON.stringify([{ date: localDate(), weight: 52 }]),
    nutritionHistory: JSON.stringify([{ date: localDate(), kcal: 100, protein: 5, fat: 3, carbs: 12 }]) });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const toggle = async (id, enabled) => { $(id).checked = enabled; $(id).dispatchEvent(new Event('change')); await tick(); };
  const close = async id => { $(id).dispatchEvent(new Event('cancel', { cancelable: true })); await tick(); await tick(); };
  try {
    await import('../js/app.js');
    const { renderAnalytics } = await import('../js/features/analytics.js');
    const { renderPreferences } = await import('../js/features/preferences.js');
    await t.test('both accessible switches save immediately on Basic and share the same state', async () => {
      await click('[data-action="showProfile"]'); await click('#profilePage [data-value="settingsPage"]');
      assert.equal($('settingsLdmToggle').checked, false); assert.equal($('appearanceLdmToggle').checked, false);
      const appearance = structuredClone(state.appearance);
      await toggle('settingsLdmToggle', true);
      assert.equal(env.localStorage.getItem(key), 'true'); assert.equal(document.documentElement.dataset.lowDetail, 'on'); assert.equal($('appearanceLdmToggle').checked, true);
      assert.equal($('subscriptionDialog').open, false); assert.deepEqual(state.appearance, appearance);
      await toggle('appearanceLdmToggle', false); assert.equal($('settingsLdmToggle').checked, false); assert.equal(document.documentElement.dataset.lowDetail, 'off');
    });
    await t.test('a quota error rolls the visual switch back without dropping the current design', async () => {
      const write = env.localStorage.setItem;
      env.localStorage.setItem = (name, value) => { if (name === key) throw new Error('quota'); write.call(env.localStorage, name, value); };
      await toggle('settingsLdmToggle', true); assert.equal($('settingsLdmToggle').checked, false); assert.equal(document.documentElement.dataset.lowDetail, 'off');
      env.localStorage.setItem = write;
    });
    await t.test('unchanged history keeps its nodes, with correct invalidation for edits and language', () => {
      renderAnalytics(); const weight = $('weightHistoryList').children[0], nutrition = $('nutritionHistoryList').children[0];
      renderAnalytics(); assert.equal($('weightHistoryList').children[0], weight); assert.equal($('nutritionHistoryList').children[0], nutrition);
      state.nutrition[0].kcal = 222; renderAnalytics(); assert.notEqual($('nutritionHistoryList').children[0], nutrition); assert.match($('nutritionHistoryList').textContent, /222/);
      assert.equal($('weightHistoryList').children[0], weight); state.preferences.lang = 'en'; renderAnalytics(); assert.notEqual($('weightHistoryList').children[0], weight); state.preferences.lang = 'ru'; renderAnalytics();
    });
    await t.test('all limited frames keep the entire static art and aperture in LDM, then restore animated pieces', async () => {
      await click('#settingsBackButton'); await click('[data-action="showProfile"]'); await click('#profileFrameEdit');
      const wallet = env.localStorage.getItem('fitcat_wallet_v1');
      for (const frame of ['kitsune', 'pearlguard', 'seraph']) {
        await click('#frameChoice_' + frame);
        const node = $('framePickerFrame'), aperture = node.parentElement.style.getPropertyValue('--limited-avatar-aperture');
        assert.ok(node.querySelectorAll('.limited-piece').length > 0);
        await toggle('settingsLdmToggle', true);
        assert.equal(node.dataset.quality, 'static'); assert.equal(node.dataset.live, 'false'); assert.equal(node.querySelector('.collectible-details').children.length, 0);
        assert.match(node.querySelector('.collectible-art').getAttribute('src'), new RegExp('/' + frame + '\\.webp$'));
        assert.equal(node.parentElement.style.getPropertyValue('--limited-avatar-aperture'), aperture);
        await toggle('settingsLdmToggle', false); assert.ok(node.querySelectorAll('.limited-piece').length > 0); assert.match(node.querySelector('.collectible-art').getAttribute('src'), /-body\.webp$/);
      }
      assert.equal(env.localStorage.getItem('fitcat_wallet_v1'), wallet); await close('profileFrameModal');
    });
    await t.test('limited cover previews keep a complete image and rebuild atmosphere after LDM', async () => {
      await click('#profileCoverEdit');
      for (const cover of ['scarlet', 'atlantis', 'cathedral']) {
        await click('#coverChoice_' + cover); const scene = $('coverPickerScene'), path = scene.querySelector('.scene-image').getAttribute('src');
        assert.ok(scene.querySelector('.scene-limited').children.length > 0);
        await toggle('settingsLdmToggle', true); assert.equal(scene.querySelector('.scene-limited').children.length, 0); assert.equal(scene.querySelector('.scene-image').getAttribute('src'), path);
        await toggle('settingsLdmToggle', false); assert.ok(scene.querySelector('.scene-limited').children.length > 0); assert.equal(scene.querySelector('.scene-image').getAttribute('src'), path);
      }
      await close('profileCoverModal');
      renderPreferences(); assert.equal(state.preferences.lowDetailMode, false);
    });
  } finally { env.restoreTimers(); }
});
