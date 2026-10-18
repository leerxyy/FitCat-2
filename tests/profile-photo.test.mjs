import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('avatar uploads preserve typed fields and only the latest photo intent can be saved', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' }),
    profilePhoto: 'data:image/png;base64,old', lastDate: new Date().toDateString(), 'unrelated-app': 'keep' });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const originalImage = globalThis.Image; const originalCreate = URL.createObjectURL; const originalRevoke = URL.revokeObjectURL;
  const images = [], canvases = [], revoked = []; let urlCount = 0, reloads = 0;
  const createElement = document.createElement.bind(document);
  globalThis.Image = class { constructor() { this.naturalWidth = 1200; this.naturalHeight = 800; images.push(this); } };
  URL.createObjectURL = () => 'blob:photo-' + (++urlCount); URL.revokeObjectURL = url => revoked.push(url);
  location.reload = () => { reloads++; };
  document.createElement = tag => {
    const node = createElement(tag);
    if (tag === 'canvas') {
      node.getContext = () => ({ drawImage(image) { node.image = image; } });
      node.toDataURL = () => 'data:image/jpeg;base64,' + node.image.src.split(':')[1]; canvases.push(node);
    }
    return node;
  };
  const choose = async file => { $('photoInput').files = file ? [file] : []; $('photoInput').dispatchEvent(new Event('change')); await tick(); };
  const file = { type: 'image/jpeg', size: 1000 };
  try {
    await import('../js/app.js'); const { state } = await import('../js/core/store.js');
    await click('[data-action="showProfile"]'); $('profileName').value = 'Черновик'; $('profileAge').value = '24';
    await t.test('a successful upload updates both avatars, keeps the draft and revokes its object URL', async () => {
      await choose(file); assert.equal(images.length, 1); images[0].onload(); await tick(); await tick();
      assert.equal(state.photo, 'data:image/jpeg;base64,photo-1'); assert.equal(env.localStorage.getItem('profilePhoto'), state.photo);
      assert.equal($('profilePhoto').querySelector('img').src, state.photo); assert.equal($('headerPhoto').querySelector('img').src, state.photo);
      assert.equal($('profileName').value, 'Черновик'); assert.equal($('profileAge').value, '24'); assert.equal($('profilePhotoDelete').hidden, false);
      assert.equal(canvases[0].width, 512); assert.equal(canvases[0].height, 341); assert.ok(revoked.includes('blob:photo-1'));
    });
    await t.test('cancelling the picker and invalid or oversized files cannot replace the existing image', async () => {
      const photo = state.photo; const count = urlCount; await choose(null);
      await choose({ type: 'text/plain', size: 20 }); await choose({ type: 'image/png', size: 4 * 1024 * 1024 });
      assert.equal(state.photo, photo); assert.equal(urlCount, count); assert.equal(images.length, 1);
      assert.equal($('profileName').value, 'Черновик');
    });
    await t.test('an older load completing after a newer selection cannot overwrite it', async () => {
      await choose(file); await choose(file); assert.equal(images.length, 3);
      images[2].onload(); await tick(); const latest = state.photo; assert.equal(latest, 'data:image/jpeg;base64,photo-3');
      images[1].onload(); await tick(); assert.equal(state.photo, latest);
      assert.ok(revoked.includes('blob:photo-2')); assert.ok(revoked.includes('blob:photo-3'));
    });
    await t.test('deleting during a pending replacement wins over the late load and retains edited fields', async () => {
      await choose(file); assert.equal(images.length, 4); await click('#profilePhotoDelete');
      assert.equal(state.photo, ''); assert.equal(env.localStorage.getItem('profilePhoto'), null); assert.equal($('profilePhotoDelete').hidden, true);
      images[3].onload(); await tick(); assert.equal(state.photo, ''); assert.equal(env.localStorage.getItem('profilePhoto'), null);
      assert.equal($('profileName').value, 'Черновик'); assert.equal($('profileAge').value, '24'); assert.ok(revoked.includes('blob:photo-4'));
    });
    await t.test('an image decode failure releases its URL and leaves the existing state intact', async () => {
      const originalError = console.error; const errors = []; console.error = error => errors.push(error);
      try {
        await choose(file); images[4].onerror(new Error('decode failed')); await tick(); await tick();
        assert.equal(state.photo, ''); assert.equal(errors.length, 1); assert.ok(revoked.includes('blob:photo-5'));
        assert.match($('toast').textContent, /Не удалось открыть фото/);
      } finally { console.error = originalError; }
    });
    await t.test('a pending photo cannot recreate storage after confirmed account deletion', async () => {
      await choose(file); await click('#profilePage [data-action="deleteAccount"]'); await click('#confirmAccept');
      assert.equal(reloads, 1); assert.equal(env.localStorage.getItem('fitnessProfile'), null);
      images[5].onload(); await tick(); assert.equal(env.localStorage.getItem('profilePhoto'), null);
      assert.equal(env.localStorage.getItem('unrelated-app'), 'keep'); assert.ok(revoked.includes('blob:photo-6'));
    });
  } finally {
    for (const image of images) image.onload?.();
    globalThis.Image = originalImage; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; env.restoreTimers();
  }
});
