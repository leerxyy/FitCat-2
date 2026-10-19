import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, activeProFixture } from './dom.mjs';
import { PROFILE_STYLE_KEY, PROFILE_STYLE_DEFAULTS } from '../js/core/profile-style.js';

test('profile cosmetics integrate selection, autosave, PRO+, photo identity and motion lifecycle', async t => {
  const photo = 'data:image/jpeg;base64,profile';
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' }), lastDate: new Date().toDateString(), profilePhoto: photo });
  const $ = id => document.getElementById(id);
  const click = async selector => { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const close = async id => { const node = $(id); const event = new Event('cancel', { cancelable: true }); node.dispatchEvent(event); await tick(); await tick(); assert.equal(node.open, false); };
  try {
    await import('../js/app.js');
    const { state, loadState } = await import('../js/core/store.js');
    const { renderProfileStyle, syncProfileStyleMotion } = await import('../js/features/profile-style.js');
    await click('[data-action="showProfile"]');
    await t.test('the frame and cover controls are separate from edit/delete and open swipe sheets', async () => {
      assert.ok($('profileFrameEdit')); assert.ok($('profileCoverEdit')); assert.ok($('profilePhotoEdit')); assert.ok($('profilePhotoDelete'));
      assert.equal($('profileFrameEdit').querySelector('use').getAttribute('href'), 'assets/icons/sprite.svg#avatar-frame');
      for (const [kind, id] of [['frame', 'profileFrameModal'], ['cover', 'profileCoverModal']]) {
        await click(kind === 'frame' ? '#profileFrameEdit' : '#profileCoverEdit');
        assert.equal($(id).open, true); assert.ok($(id).hasAttribute('data-swipe-close')); assert.ok($(id).querySelector('[data-sheet-handle]'));
        assert.equal($(id).querySelectorAll('.profile-style-choice').length, kind === 'cover' ? 12 : 13);
        assert.equal($(id).querySelectorAll('[data-pro-feature="profile-style"]').length, 3);
        assert.equal($(id).querySelector('[type="submit"]'), null); assert.equal($(id).querySelector('[data-close]'), null);
        await close(id);
      }
    });
    await t.test('a Basic frame saves immediately and appears on both actual avatars', async () => {
      await click('#profileFrameEdit'); await click('#frameChoice_jade');
      assert.equal($('profileFrameModal').open, true); assert.equal(state.profileStyle.frame, 'jade');
      assert.equal(JSON.parse(env.localStorage.getItem(PROFILE_STYLE_KEY)).frame, 'jade');
      assert.equal($('profileAvatarFrame').dataset.frame, 'jade'); assert.equal($('headerAvatarFrame').dataset.frame, 'jade');
      assert.equal($('framePickerFrame').dataset.frame, 'jade'); assert.equal($('frameStyleSelected').textContent, 'Нефрит');
      assert.equal($('framePickerPhoto').querySelector('img').src, photo);
      assert.equal($('profilePhoto').querySelector('img').src, photo); assert.equal($('headerPhoto').querySelector('img').src, photo);
      loadState(env.localStorage); renderProfileStyle(); assert.equal(state.profileStyle.frame, 'jade');
      await close('profileFrameModal');
    });
    await t.test('cover choice is confined to the profile and may be cleared independently', async () => {
      const background = document.documentElement.dataset.background;
      await click('#profileCoverEdit'); await click('#coverChoice_forest');
      assert.equal(state.profileStyle.cover, 'forest'); assert.equal(state.profileStyle.frame, 'jade');
      assert.equal($('profileCoverScene').dataset.cover, 'forest');
      assert.equal($('profileCoverScene').querySelector('img').getAttribute('src'), 'assets/profile-covers/forest.webp');
      assert.equal($('coverStyleSelected').textContent, 'Лес'); assert.equal(document.documentElement.dataset.background, background);
      await click('#profileCoverNone'); assert.equal(state.profileStyle.cover, 'none'); assert.equal($('profileIdentityCard').dataset.hasCover, 'false');
      await click('#profileCoverModal [data-action="resetProfileStyle"]'); assert.equal(state.profileStyle.cover, 'mist'); assert.equal(state.profileStyle.frame, 'jade');
      await close('profileCoverModal');
    });
    await t.test('a locked premium choice opens the relevant subscription window and never writes the choice', async () => {
      await click('#profileFrameEdit'); const before = env.localStorage.getItem(PROFILE_STYLE_KEY); await click('#frameChoice_spectrum');
      assert.equal($('profileFrameModal').open, false); assert.equal($('subscriptionDialog').open, true);
      assert.equal($('proFeatureTitle').textContent, 'Оформление профиля');
      assert.equal(env.localStorage.getItem(PROFILE_STYLE_KEY), before); assert.equal(state.profileStyle.frame, 'jade');
      await close('subscriptionDialog');
    });
    await t.test('PRO+ unlocks all premium frames and covers; expiry and renewal preserve the saved selection', async () => {
      for (const [key, value] of Object.entries(activeProFixture())) env.localStorage.setItem(key, value);
      document.dispatchEvent(new Event('fitcat:subscription')); await tick();
      await click('#profileFrameEdit'); await click('#frameChoice_spectrum'); await close('profileFrameModal');
      await click('#profileCoverEdit'); await click('#coverChoice_cosmos');
      assert.deepEqual(state.profileStyle, { frame: 'spectrum', cover: 'cosmos' });
      assert.equal($('coverPickerScene').dataset.cover, 'cosmos');
      await close('profileCoverModal'); env.localStorage.removeItem('fitcat_subscription_v1');
      document.dispatchEvent(new Event('fitcat:subscription')); await tick();
      assert.equal($('profileAvatarFrame').dataset.frame, 'ice'); assert.equal($('profileCoverScene').dataset.cover, 'mist');
      assert.deepEqual(state.profileStyle, { frame: 'spectrum', cover: 'cosmos' });
      for (const [key, value] of Object.entries(activeProFixture())) env.localStorage.setItem(key, value);
      document.dispatchEvent(new Event('fitcat:subscription')); await tick();
      assert.equal($('profileAvatarFrame').dataset.frame, 'spectrum'); assert.equal($('profileCoverScene').dataset.cover, 'cosmos');
    });
    await t.test('save failures show a recoverable error and retain the last good appearance', async () => {
      await click('#profileFrameEdit'); const previous = structuredClone(state.profileStyle), write = env.localStorage.setItem, error = console.error;
      env.localStorage.setItem = (key, value) => { if (key === PROFILE_STYLE_KEY) throw new Error('quota'); write(key, value); }; console.error = () => {};
      try { await click('#frameChoice_silver'); assert.deepEqual(state.profileStyle, previous); assert.equal($('profileFrameStatus').dataset.error, 'true'); }
      finally { env.localStorage.setItem = write; console.error = error; }
      await click('#frameChoice_orbit'); assert.equal(state.profileStyle.frame, 'orbit'); assert.equal($('profileFrameStatus').dataset.error, 'false');
      await close('profileFrameModal');
    });
    await t.test('reopening the frame picker aligns its native animations with the current shared phase', async () => {
      const originalMedia = globalThis.matchMedia, animation = { animationName: 'profile-rim-turn', currentTime: 0 };
      let reads = 0;
      $('framePickerFrame').getAnimations = () => { reads++; return [animation]; };
      globalThis.matchMedia = () => ({ matches: false });
      try {
        document.dispatchEvent(new Event('visibilitychange'));
        await click('#profileFrameEdit'); const first = animation.currentTime; assert.ok(first > 0); assert.equal(reads, 1);
        renderProfileStyle(); assert.equal(reads, 1, 'an ordinary render must not seek a running frame');
        await close('profileFrameModal'); animation.currentTime = 0;
        await click('#profileFrameEdit'); assert.equal(reads, 2); assert.ok(animation.currentTime >= first);
        await close('profileFrameModal');
      } finally { globalThis.matchMedia = originalMedia; delete $('framePickerFrame').getAnimations; }
    });
    await t.test('only the visible hero runs, and all cosmetics sleep when hidden or reduced motion is enabled', async () => {
      const originalMedia = globalThis.matchMedia;
      globalThis.matchMedia = () => ({ matches: false });
      try {
        syncProfileStyleMotion(); assert.equal($('profileAvatarFrame').dataset.live, 'true'); assert.equal($('headerAvatarFrame').dataset.live, 'false');
        assert.equal($('profileCoverScene').dataset.live, 'true');
        const animation = state.appearance.animation;
        state.appearance.animation = false; document.dispatchEvent(new Event('fitcat:change'));
        assert.equal(document.documentElement.dataset.backgroundAnimation, 'off'); assert.equal($('profileCoverScene').dataset.live, 'true');
        state.appearance.animation = animation; document.dispatchEvent(new Event('fitcat:change'));
        await click('#profileCoverEdit'); assert.equal($('profileAvatarFrame').dataset.live, 'false');
        assert.equal($('profileCoverScene').dataset.live, 'false'); assert.equal($('coverPickerScene').dataset.live, 'true');
        assert.equal($('coverPickerFrame').dataset.live, 'false');
        for (const frame of document.querySelectorAll('.style-frame-sample .avatar-frame')) assert.equal(frame.dataset.live, 'false');
        Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
        assert.equal($('coverPickerScene').dataset.live, 'false');
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      } finally { globalThis.matchMedia = originalMedia; }
      syncProfileStyleMotion(); assert.equal($('coverPickerScene').dataset.live, 'false'); await close('profileCoverModal');
    });
    await t.test('translations preserve the choices and a reset does not touch photo or profile data', async () => {
      const before = JSON.stringify(state.profile), chosen = structuredClone(state.profileStyle);
      await click('#profileFrameEdit');
      for (const [language, title] of [['en', 'Avatar frames'], ['cn', '头像边框'], ['ru', 'Рамки профиля']]) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        assert.equal($('profileFrameTitle').textContent, title); assert.deepEqual(state.profileStyle, chosen);
      }
      await click('#profileFrameModal [data-action="resetProfileStyle"]');
      assert.equal(state.profileStyle.frame, PROFILE_STYLE_DEFAULTS.frame); assert.equal(state.profileStyle.cover, chosen.cover);
      assert.equal(state.photo, photo); assert.equal(JSON.stringify(state.profile), before); await close('profileFrameModal');
    });
  } finally { env.restoreTimers(); }
});
