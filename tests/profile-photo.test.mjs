import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('avatar framing previews the actual crop and commits only an explicit, current photo choice', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' }),
    profilePhoto: 'data:image/png;base64,old', lastDate: new Date().toDateString(), 'unrelated-app': 'keep' });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const originalImage = globalThis.Image, originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const images = [], canvases = [], revoked = []; let urlCount = 0, reloads = 0;
  const createElement = document.createElement.bind(document);
  globalThis.Image = class { constructor() { this.naturalWidth = 2400; this.naturalHeight = 1600; images.push(this); } };
  URL.createObjectURL = () => 'blob:photo-' + (++urlCount); URL.revokeObjectURL = url => revoked.push(url);
  location.reload = () => { reloads++; };
  document.createElement = tag => {
    const node = createElement(tag);
    if (tag === 'canvas') {
      node.getContext = () => ({ fillRect() {}, drawImage(image, ...args) { node.image = image; node.drawArgs = args; } });
      node.toDataURL = () => 'data:image/jpeg;base64,' + Buffer.from(`${node.image.src};${node.width}x${node.height};${node.drawArgs}`).toString('base64');
      canvases.push(node);
    }
    return node;
  };
  const choose = async file => { $('photoInput').files = file ? [file] : []; $('photoInput').dispatchEvent(new Event('change')); await tick(); };
  const file = { type: 'image/jpeg', size: 1000 };
  const decode = async image => { image.onload(); await tick(); await tick(); };
  const zoom = value => { $('photoCropZoom').value = value; $('photoCropZoom').dispatchEvent(new Event('input')); };
  const pointer = (type, x, y, id = 1) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: id }, pointerType: { value: 'touch' }, button: { value: 0 } });
    $('photoCropStage').dispatchEvent(event); return event;
  };
  $('photoCropStage').getBoundingClientRect = () => ({ width: 200, height: 200, left: 0, top: 0 });
  try {
    await import('../js/app.js'); const { state, loadState } = await import('../js/core/store.js');
    await click('[data-action="showProfile"]'); $('profileName').value = 'Черновик'; $('profileAge').value = '24';
    await t.test('a legacy photo opens for adjustment and cancelling never writes or resets draft fields', async () => {
      await click('#profilePhotoEdit'); assert.equal(images.at(-1).src, state.photo); await decode(images.at(-1));
      assert.equal($('photoCropModal').open, true); zoom(2); await click('#photoCropModal [data-close]');
      assert.equal(state.photo, 'data:image/png;base64,old'); assert.equal(state.photoEdit, null);
      assert.equal($('profileName').value, 'Черновик'); assert.equal($('profileAge').value, '24');
    });
    await t.test('dragging and zoom update both round previews; only Save applies the square crop to both avatars', async () => {
      const old = state.photo; await choose(file); const image = images.at(-1); await decode(image);
      assert.equal(state.photo, old); assert.equal($('photoCropModal').open, true); assert.ok(!revoked.includes(image.src));
      zoom(2); pointer('pointerdown', 100, 100); const move = pointer('pointermove', 180, 100); pointer('pointerup', 180, 100);
      assert.equal(move.defaultPrevented, true); assert.equal($('photoCropModal').open, true);
      const previews = $('photoCropModal').querySelectorAll('[data-crop-image]'); assert.equal(previews.length, 3);
      for (const preview of previews) { assert.equal(preview.style.width, '300%'); assert.ok(Math.abs(parseFloat(preview.style.left) + 60) < 1e-8); assert.equal(preview.getAttribute('src'), image.src); }
      await click('#photoCropSave');
      assert.equal($('photoCropModal').open, false); assert.notEqual(state.photo, old); assert.equal(env.localStorage.getItem('profilePhoto'), state.photo);
      assert.equal($('profilePhoto').querySelector('img').src, state.photo); assert.equal($('headerPhoto').querySelector('img').src, state.photo);
      assert.equal(canvases[0].width, 512); assert.equal(canvases[0].height, 512); assert.deepEqual(canvases[0].drawArgs, [480, 400, 800, 800, 0, 0, 512, 512]);
      assert.equal(canvases[1].width, 1280); assert.equal(canvases[1].height, 853); assert.equal(state.photoEdit.frame.zoom, 2);
      assert.ok(revoked.includes(image.src)); assert.equal($('profileName').value, 'Черновик'); assert.equal($('profileAge').value, '24');
    });
    await t.test('reopening after loading saved state uses the uncropped original and saved position', async () => {
      const saved = state.photo, edit = structuredClone(state.photoEdit); loadState(env.localStorage);
      await click('#profilePhoto'); const image = images.at(-1); assert.equal(image.src, edit.source);
      image.naturalWidth = 1280; image.naturalHeight = 853; await decode(image); assert.equal($('photoCropZoom').value, '2');
      pointer('pointerdown', 100, 100); pointer('pointermove', 30, 140); pointer('pointerup', 30, 140); zoom(3);
      await click('#photoCropModal [data-close]'); assert.equal(state.photo, saved); assert.deepEqual(state.photoEdit, edit);
      assert.equal($('photoCropStage').classList.contains('is-dragging'), false);
    });
    await t.test('picker cancellation, invalid files and oversize files leave the existing photo intact', async () => {
      const old = state.photo, count = images.length; await choose(null);
      await choose({ type: 'text/plain', size: 20 }); await choose({ type: 'image/png', size: 4 * 1024 * 1024 });
      assert.equal(state.photo, old); assert.equal(images.length, count); assert.equal($('profileName').value, 'Черновик');
    });
    await t.test('an older decode cannot replace the newest editor image or commit without confirmation', async () => {
      const old = state.photo; await choose(file); const older = images.at(-1); await choose(file); const newer = images.at(-1);
      await decode(newer); await decode(older); assert.equal(state.photo, old);
      assert.equal($('photoCropStage').querySelector('img').getAttribute('src'), newer.src); assert.ok(revoked.includes(older.src));
      await click('#photoCropSave'); assert.ok(Buffer.from(state.photo.split(',')[1], 'base64').toString().startsWith(newer.src)); assert.ok(revoked.includes(newer.src));
    });
    await t.test('pinching, keyboard adjustment and reset keep the sheet open and synchronize previews', async () => {
      await choose(file); await decode(images.at(-1));
      pointer('pointerdown', 60, 100, 1); pointer('pointerdown', 140, 100, 2); pointer('pointermove', 180, 100, 2);
      assert.ok(Math.abs(Number($('photoCropZoom').value) - 1.5) < 1e-8); pointer('pointerup', 180, 100, 2); pointer('pointerup', 60, 100, 1);
      const key = new Event('keydown', { cancelable: true }); Object.defineProperty(key, 'key', { value: 'ArrowLeft' }); $('photoCropStage').dispatchEvent(key); assert.equal(key.defaultPrevented, true);
      await click('#photoCropModal [data-action="resetPhotoCrop"]'); assert.equal($('photoCropZoom').value, '1');
      assert.equal($('photoCropModal').open, true); await click('#photoCropModal [data-close]');
    });
    await t.test('cancel and Escape release temporary images and also cancel pending replacements', async () => {
      const old = state.photo; await choose(file); const shown = images.at(-1); await decode(shown);
      let picks = 0; const count = () => { picks++; }; $('photoInput').addEventListener('click', count);
      await click('#photoCropModal [data-action="chooseCropPhoto"]'); assert.equal(picks, 1); $('photoInput').removeEventListener('click', count);
      await choose(file); const pending = images.at(-1);
      $('photoCropModal').dispatchEvent(new Event('cancel', { cancelable: true })); await tick(); await decode(pending);
      assert.equal($('photoCropModal').open, false); assert.equal(state.photo, old);
      assert.ok(revoked.includes(shown.src)); assert.ok(revoked.includes(pending.src));
    });
    await t.test('a failed save leaves both old keys intact, retains the editor and allows retry', async () => {
      await choose(file); await decode(images.at(-1)); const old = state.photo, edit = structuredClone(state.photoEdit);
      const write = env.localStorage.setItem, originalError = console.error; let fail = true; console.error = () => {};
      env.localStorage.setItem = (key, value) => { if (key === 'profilePhoto' && fail) { fail = false; throw new Error('quota'); } write(key, value); };
      try {
        await click('#photoCropSave'); assert.equal(state.photo, old); assert.deepEqual(state.photoEdit, edit); assert.equal($('photoCropModal').open, true);
        assert.equal(env.localStorage.getItem('profilePhoto'), old); assert.deepEqual(JSON.parse(env.localStorage.getItem('fitcat_photo_edit_v1')), edit);
        await click('#photoCropSave'); assert.equal($('photoCropModal').open, false); assert.notEqual(state.photo, old);
      } finally { env.localStorage.setItem = write; console.error = originalError; }
    });
    await t.test('deleting during a pending replacement wins over the late load and retains edited fields', async () => {
      await choose(file); const pending = images.at(-1); await click('#profilePhotoDelete'); await decode(pending);
      assert.equal(state.photo, ''); assert.equal(state.photoEdit, null); assert.equal(env.localStorage.getItem('profilePhoto'), null);
      assert.equal(env.localStorage.getItem('fitcat_photo_edit_v1'), null); assert.equal($('photoCropModal').open, false); assert.equal($('profilePhotoDelete').hidden, true);
      assert.equal($('profileName').value, 'Черновик'); assert.equal($('profileAge').value, '24'); assert.ok(revoked.includes(pending.src));
    });
    await t.test('a decode error releases its URL and does not create a photo', async () => {
      const originalError = console.error; console.error = () => {};
      try { await choose(file); const image = images.at(-1); image.onerror(new Error('decode failed')); await tick();
        assert.equal(state.photo, ''); assert.ok(revoked.includes(image.src)); assert.match($('toast').textContent, /Не удалось открыть фото/);
      } finally { console.error = originalError; }
    });
    await t.test('a pending photo cannot recreate either photo key after account deletion', async () => {
      await choose(file); const pending = images.at(-1); await click('#profilePage [data-action="deleteAccount"]'); await click('#confirmAccept'); await decode(pending);
      assert.equal(reloads, 1); assert.equal(env.localStorage.getItem('fitnessProfile'), null); assert.equal(env.localStorage.getItem('profilePhoto'), null);
      assert.equal(env.localStorage.getItem('fitcat_photo_edit_v1'), null); assert.equal(env.localStorage.getItem('unrelated-app'), 'keep'); assert.ok(revoked.includes(pending.src));
    });
  } finally {
    globalThis.Image = originalImage; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; env.restoreTimers();
  }
});
