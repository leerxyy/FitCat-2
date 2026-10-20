import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_STYLE_KEY, PROFILE_STYLE_DEFAULTS, PROFILE_FRAMES, PROFILE_COVERS, PREMIUM_PROFILE_FRAMES, PREMIUM_PROFILE_COVERS, CITY_PROFILE_COVERS, normalizeProfileStyle, effectiveProfileStyle, profileChoiceAllowed, profileCoverAsset } from '../js/core/profile-style.js';
import { state, loadState, setProfileStyle, setPhoto, exportSnapshot, importSnapshot, clearAccount } from '../js/core/store.js';
import { PURCHASABLE_PROFILE_COVERS } from '../js/core/profile-cities.js';

const profile = { name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' };
function storage(initial = {}) {
  const map = new Map(Object.entries({ fitnessProfile: JSON.stringify(profile), 'another-app': 'keep', ...initial }));
  const writes = [];
  return { map, writes, getItem: key => map.get(key) ?? null, setItem: (key, value) => { writes.push(key); map.set(key, String(value)); }, removeItem: key => map.delete(key) };
}

test('both profile collections have five usable Basic choices and three exclusive PRO+ choices', () => {
  for (const [kind, all, premium] of [['frame', PROFILE_FRAMES, PREMIUM_PROFILE_FRAMES], ['cover', PROFILE_COVERS, PREMIUM_PROFILE_COVERS]]) {
    const expected = kind === 'cover' ? 12 : 8;
    assert.equal(all.length, expected); assert.equal(new Set(all).size, expected); assert.equal(premium.length, 3);
    assert.equal(all.filter(value => profileChoiceAllowed(kind, value, false)).length, 5);
    for (const value of all) assert.equal(profileChoiceAllowed(kind, value, true, PURCHASABLE_PROFILE_COVERS), true);
    for (const value of premium) assert.equal(profileChoiceAllowed(kind, value, false), false);
  }
  assert.equal(profileChoiceAllowed('cover', 'none'), true);
  assert.equal(profileChoiceAllowed('frame', 'none'), false);
  assert.equal(profileChoiceAllowed('unknown', 'mist', true), false);
});
test('malformed IDs and arbitrary URLs never reach a cosmetic asset or CSS selector', () => {
  for (const value of [undefined, null, '', 'https://evil.test/x', { frame: '<script>', cover: 'url(javascript:evil)' }, { frame: {}, cover: [] }]) {
    assert.deepEqual(normalizeProfileStyle(value), PROFILE_STYLE_DEFAULTS);
  }
  assert.deepEqual(normalizeProfileStyle({ frame: 'jade', cover: 'none', css: 'bad' }), { frame: 'jade', cover: 'none' });
  assert.equal(profileCoverAsset('../secrets'), ''); assert.equal(profileCoverAsset('none'), '');
  assert.equal(profileCoverAsset('aurora'), 'assets/profile-covers/aurora.webp');
  assert.equal(profileCoverAsset('mist', true), 'assets/profile-covers/mist-thumb.webp');
});
test('an older installation gains defaults without modifying its profile, photo or diary', () => {
  const adapter = storage({ todayFoods: '[]', profilePhoto: 'data:image/jpeg;base64,existing' });
  const before = new Map(adapter.map); loadState(adapter);
  assert.deepEqual(state.profileStyle, PROFILE_STYLE_DEFAULTS);
  for (const [key, value] of before) assert.equal(adapter.getItem(key), value);
  assert.equal(adapter.getItem(PROFILE_STYLE_KEY), null);
});
test('an immediate cosmetic save writes one key and survives a reload independently of the photo', () => {
  const adapter = storage(); loadState(adapter); setPhoto('data:image/jpeg;base64,original');
  const before = new Map(adapter.map); adapter.writes.length = 0;
  setProfileStyle({ frame: 'jade', cover: 'lake' });
  assert.deepEqual(adapter.writes, [PROFILE_STYLE_KEY]);
  for (const [key, value] of before) assert.equal(adapter.getItem(key), value);
  loadState(adapter); assert.deepEqual(state.profileStyle, { frame: 'jade', cover: 'lake' });
  assert.equal(state.photo, 'data:image/jpeg;base64,original');
});
test('a failed cosmetic write leaves the previous memory and stored choice intact', () => {
  const adapter = storage(); loadState(adapter); setProfileStyle({ frame: 'silver', cover: 'forest' });
  const before = structuredClone(state.profileStyle), saved = adapter.getItem(PROFILE_STYLE_KEY), write = adapter.setItem;
  adapter.setItem = (key, value) => { if (key === PROFILE_STYLE_KEY) throw new Error('quota'); write(key, value); };
  assert.throws(() => setProfileStyle({ frame: 'quartz', cover: 'ocean' }), /quota/);
  assert.deepEqual(state.profileStyle, before); assert.equal(adapter.getItem(PROFILE_STYLE_KEY), saved);
});
test('expiry temporarily falls back to Basic and renewal restores both original premium choices', () => {
  const chosen = { frame: 'spectrum', cover: 'cosmos' };
  assert.deepEqual(effectiveProfileStyle(chosen, false), PROFILE_STYLE_DEFAULTS);
  assert.deepEqual(effectiveProfileStyle(chosen, true), chosen);
  assert.deepEqual(chosen, { frame: 'spectrum', cover: 'cosmos' });
  assert.deepEqual(effectiveProfileStyle({ frame: 'jade', cover: 'cosmos' }, false), { frame: 'jade', cover: 'mist' });
});
test('photo replacement or removal does not erase the chosen avatar frame and cover', () => {
  const adapter = storage(); loadState(adapter); setProfileStyle({ frame: 'orbit', cover: 'summits' });
  setPhoto('data:image/png;base64,new'); setPhoto('');
  assert.deepEqual(state.profileStyle, { frame: 'orbit', cover: 'summits' });
  loadState(adapter); assert.deepEqual(state.profileStyle, { frame: 'orbit', cover: 'summits' });
});
test('JSON backup restores cosmetics and old backups preserve the current appearance', () => {
  const adapter = storage(); loadState(adapter); setProfileStyle({ frame: 'quartz', cover: 'dunes' });
  const backup = structuredClone(exportSnapshot());
  setProfileStyle(PROFILE_STYLE_DEFAULTS); importSnapshot(backup);
  assert.deepEqual(state.profileStyle, { frame: 'quartz', cover: 'dunes' });
  const old = structuredClone(backup); delete old.profileStyle; importSnapshot(old);
  assert.deepEqual(state.profileStyle, { frame: 'quartz', cover: 'dunes' });
});
test('a failed restore rolls back all storage and cosmetic state together', () => {
  const adapter = storage(); loadState(adapter); setProfileStyle({ frame: 'graphite', cover: 'forest' });
  const backup = structuredClone(exportSnapshot()); backup.profileStyle = { frame: 'silver', cover: 'lake' }; backup.profile.name = 'Changed';
  const before = new Map(adapter.map), previous = structuredClone(state), write = adapter.setItem; let fail = true;
  adapter.setItem = (key, value) => { if (key === PROFILE_STYLE_KEY && fail) { fail = false; throw new Error('quota'); } write(key, value); };
  assert.throws(() => importSnapshot(backup), /quota/);
  assert.deepEqual(state, previous); assert.deepEqual(adapter.map, before);
});
test('account deletion removes cosmetic settings without clearing another application', () => {
  const adapter = storage(); loadState(adapter); setProfileStyle({ frame: 'silver', cover: 'lake' }); clearAccount();
  assert.equal(adapter.getItem(PROFILE_STYLE_KEY), null); assert.equal(adapter.getItem('another-app'), 'keep');
});
