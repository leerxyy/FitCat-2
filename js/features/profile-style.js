import { state, proAccess, setProfileStyle } from '../core/store.js';
import { PROFILE_STYLE_DEFAULTS, PROFILE_STYLE_KEY, PREMIUM_PROFILE_FRAMES, PREMIUM_PROFILE_COVERS, effectiveProfileStyle, normalizeProfileStyle, profileChoiceAllowed, profileCoverAsset } from '../core/profile-style.js';
import { t } from '../core/i18n.js';
import { $, initials, onAction, openDialog } from '../ui/components.js';
import { requirePro, renderPremium } from '../ui/premium.js';
import { reducedMotion, enter, MOTION } from '../ui/motion.js';
import { subscribeAmbientMotion } from '../ui/ambient.js';
import { cosmeticTimeline } from '../ui/cosmetic-timeline.js';

const photos = new WeakMap();
const inView = new WeakMap();
const liveScenes = new Set();
const errors = { frame: false, cover: false };
let initialized = false;
let motionPaused = false;
let lastMotion = { x: 0, y: 0 };
const effective = () => effectiveProfileStyle(state.profileStyle, proAccess());

function setData(node, key, value) {
  if (node && node.dataset[key] !== String(value)) node.dataset[key] = String(value);
}
function renderPhoto(node) {
  if (!node) return;
  const label = initials(state.profile?.name), previous = photos.get(node);
  if (previous?.photo === state.photo && previous?.label === label) return;
  photos.set(node, { photo: state.photo, label });
  const child = document.createElement(state.photo ? 'img' : 'span');
  if (state.photo) { child.src = state.photo; child.alt = ''; child.draggable = false; }
  else { child.className = 'profile-initials'; child.textContent = label; }
  node.replaceChildren(child);
}
function renderScene(scene, cover) {
  if (!scene) return;
  const changed = scene.dataset.cover !== cover;
  setData(scene, 'cover', cover);
  const image = scene.querySelector('.scene-image'), asset = profileCoverAsset(cover);
  if (asset && image.getAttribute('src') !== asset) image.setAttribute('src', asset);
  const artwork = asset ? `url("${asset}")` : 'none';
  if (scene.style.getPropertyValue('--cover-art') !== artwork) scene.style.setProperty('--cover-art', artwork);
  image.hidden = !asset;
  if (changed && !scene.closest('[hidden]')) enter(scene, { y: 0, duration: MOTION.screen });
}
function renderFrame(node, value) {
  if (!node) return;
  setData(node, 'frame', value);
}
function status(kind) {
  const node = $('profile' + (kind === 'frame' ? 'Frame' : 'Cover') + 'Status');
  node.dataset.error = String(errors[kind]);
  node.dataset.i18n = errors[kind] ? 'save_error' : 'profile_style_saved';
  node.textContent = t(node.dataset.i18n);
}
function renderPicker(kind, settings) {
  const dialog = $('profile' + (kind === 'frame' ? 'Frame' : 'Cover') + 'Modal');
  if (!dialog?.open) return;
  renderPhoto($(kind + 'PickerPhoto'));
  renderFrame($(kind + 'PickerFrame'), settings.frame);
  renderScene($(kind + 'PickerScene'), settings.cover);
  $(kind + 'PickerName').textContent = state.profile?.name || 'FitCat';
  $(kind + 'StyleSelected').textContent = t(kind === 'cover' && settings.cover === 'none' ? 'profile_style_no_cover' : `profile_${kind}_${settings[kind]}`);
  $(kind + 'StyleExpired').hidden = settings[kind] === state.profileStyle[kind];
  for (const button of dialog.querySelectorAll('[data-profile-style-kind]')) {
    const selected = button.dataset.value === settings[kind];
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    const label = button.querySelector('.style-sample-initials');
    if (label) label.textContent = initials(state.profile?.name);
  }
  status(kind);
}
function isVisible(node) { return node && inView.get(node) !== false; }
function paintMotion() {
  if (!liveScenes.size) return;
  const x = Math.max(-8, Math.min(8, lastMotion.x * .22));
  const y = Math.max(-6, Math.min(6, lastMotion.y * .16));
  for (const scene of liveScenes) {
    scene.style.setProperty('--cover-x', `${x.toFixed(2)}px`);
    scene.style.setProperty('--cover-y', `${y.toFixed(2)}px`);
  }
}
export function syncProfileStyleMotion() {
  if (!initialized) return;
  const moving = !motionPaused && !document.hidden && !reducedMotion();
  const screen = document.body.dataset.screen;
  const dialogs = document.querySelectorAll('dialog[open]');
  const open = dialogs[dialogs.length - 1];
  const frameOpen = open?.id === 'profileFrameModal', coverOpen = open?.id === 'profileCoverModal';
  const profileVisible = moving && screen === 'profilePage' && !open && isVisible($('profileIdentityCard'));
  const headerVisible = moving && screen === 'mainPage' && !open && isVisible($('headerAvatarWrap'));
  cosmeticTimeline.setLive($('profileAvatarFrame'), profileVisible, $('profileAvatarFrame').dataset.frame);
  cosmeticTimeline.setLive($('headerAvatarFrame'), headerVisible, $('headerAvatarFrame').dataset.frame);
  cosmeticTimeline.setLive($('framePickerFrame'), moving && frameOpen && isVisible($('frameStylePreview')), $('framePickerFrame').dataset.frame);
  // The cover picker animates its cover, rather than an additional avatar frame.
  cosmeticTimeline.setLive($('coverPickerFrame'), false);
  liveScenes.clear();
  for (const [id, visible] of [['profileCoverScene', profileVisible], ['framePickerScene', false], ['coverPickerScene', moving && coverOpen && isVisible($('coverStylePreview'))]]) {
    const scene = $(id), active = visible && PREMIUM_PROFILE_COVERS.includes(scene?.dataset.cover);
    cosmeticTimeline.setLive(scene, active, scene?.dataset.cover);
    if (active) liveScenes.add(scene);
  }
  paintMotion();
}
export function renderProfileStyle() {
  const settings = effective();
  renderFrame($('profileAvatarFrame'), settings.frame);
  renderFrame($('headerAvatarFrame'), settings.frame);
  setData($('profileIdentityCard'), 'hasCover', settings.cover !== 'none');
  renderScene($('profileCoverScene'), settings.cover);
  renderPicker('frame', settings); renderPicker('cover', settings);
  syncProfileStyleMotion();
}
function choose(kind, value) {
  const premium = (kind === 'frame' ? PREMIUM_PROFILE_FRAMES : PREMIUM_PROFILE_COVERS).includes(value);
  if (!profileChoiceAllowed(kind, value, true)) return;
  if (premium && !requirePro('profile-style')) return;
  try {
    if (state.profileStyle[kind] !== value) setProfileStyle({ ...state.profileStyle, [kind]: value });
    errors[kind] = false;
    renderProfileStyle();
    document.dispatchEvent(new CustomEvent('fitcat:profile-style', { detail: { kind } }));
  } catch (error) {
    console.error(error); errors[kind] = true; renderProfileStyle();
  }
}
export function initProfileStyle() {
  if (initialized) return;
  initialized = true;
  onAction('openProfileStyle', button => {
    const kind = button.dataset.value;
    if (!['frame', 'cover'].includes(kind) || !state.profile) return;
    openDialog(kind === 'frame' ? 'profileFrameModal' : 'profileCoverModal');
    renderProfileStyle(); renderPremium();
  });
  onAction('chooseProfileStyle', button => choose(button.dataset.profileStyleKind, button.dataset.value));
  onAction('resetProfileStyle', button => {
    const kind = button.dataset.value;
    if (['frame', 'cover'].includes(kind)) choose(kind, PROFILE_STYLE_DEFAULTS[kind]);
  });
  if (globalThis.IntersectionObserver) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) inView.set(entry.target, entry.isIntersecting);
      syncProfileStyleMotion();
    }, { threshold: .02 });
    for (const id of ['profileIdentityCard', 'headerAvatarWrap', 'frameStylePreview', 'coverStylePreview']) observer.observe($(id));
  }
  subscribeAmbientMotion((x, y) => { lastMotion = { x, y }; paintMotion(); }, () => liveScenes.size > 0,
    paused => { motionPaused = paused; syncProfileStyleMotion(); });
  for (const event of ['fitcat:dialogopen', 'fitcat:dialogclose']) document.addEventListener(event, syncProfileStyleMotion);
  // Ambient owns visibility, reduced-motion and pagehide/pageshow handling.
  window.addEventListener('storage', event => {
    if (event.key !== PROFILE_STYLE_KEY) return;
    try { state.profileStyle = normalizeProfileStyle(JSON.parse(event.newValue)); }
    catch { state.profileStyle = { ...PROFILE_STYLE_DEFAULTS }; }
    renderProfileStyle();
  });
}
