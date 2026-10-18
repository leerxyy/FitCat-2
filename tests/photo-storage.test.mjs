import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, setPhoto, state, exportSnapshot, importSnapshot, clearAccount } from '../js/core/store.js';

const profile = { name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' };
const photo = 'data:image/jpeg;base64,photo', edit = { source: 'data:image/jpeg;base64,source', frame: { zoom: 2, x: .4, y: -.1 } };
function storage() {
  const map = new Map([['fitnessProfile', JSON.stringify(profile)], ['other-app', 'keep']]);
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}

test('the editable original and frame survive reopening and a JSON backup round trip', () => {
  const adapter = storage(); loadState(adapter); setPhoto(photo, edit); loadState(adapter);
  assert.equal(state.photo, photo); assert.deepEqual(state.photoEdit, edit);
  const backup = structuredClone(exportSnapshot()); setPhoto(''); importSnapshot(backup);
  assert.equal(state.photo, photo); assert.deepEqual(state.photoEdit, edit);
  assert.deepEqual(JSON.parse(adapter.getItem('fitcat_photo_edit_v1')), edit);
});

test('a storage failure restores both old photo keys and leaves memory unchanged', () => {
  const adapter = storage(); loadState(adapter); setPhoto(photo, edit);
  const previous = new Map(adapter.map), write = adapter.setItem;
  let fail = true;
  adapter.setItem = (key, value) => { if (key === 'profilePhoto' && fail) { fail = false; throw new Error('quota'); } write(key, value); };
  assert.throws(() => setPhoto('data:image/jpeg;base64,new', { ...edit, frame: { zoom: 3, x: 0, y: 0 } }), /quota/);
  assert.deepEqual(adapter.map, previous); assert.equal(state.photo, photo); assert.deepEqual(state.photoEdit, edit);
});

test('legacy backups and malformed optional crop metadata cannot retain an unrelated original', () => {
  const adapter = storage(); loadState(adapter); setPhoto(photo, edit);
  importSnapshot({ profile, foods: [], weight: [], photo: 'data:image/png;base64,legacy' });
  assert.equal(state.photo, 'data:image/png;base64,legacy'); assert.equal(state.photoEdit, null);
  assert.equal(adapter.getItem('fitcat_photo_edit_v1'), null);
  for (const bad of [{ source: 'https://example.com/photo.jpg', frame: edit.frame }, { ...edit, frame: { zoom: Infinity, x: 0, y: 0 } }, { ...edit, frame: { zoom: 2, x: NaN, y: 0 } }]) {
    adapter.setItem('fitcat_photo_edit_v1', JSON.stringify(bad)); loadState(adapter); assert.equal(state.photoEdit, null);
  }
});

test('deleting a photo or the account also removes the editable original without clearing other apps', () => {
  const adapter = storage(); loadState(adapter); setPhoto(photo, edit); setPhoto('');
  assert.equal(state.photoEdit, null); assert.equal(adapter.getItem('fitcat_photo_edit_v1'), null); assert.equal(adapter.getItem('profilePhoto'), null);
  setPhoto(photo, edit); clearAccount();
  assert.equal(adapter.getItem('fitcat_photo_edit_v1'), null); assert.equal(adapter.getItem('profilePhoto'), null); assert.equal(adapter.getItem('other-app'), 'keep');
});
