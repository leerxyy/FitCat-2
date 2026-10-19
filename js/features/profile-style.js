import { state, proAccess, setProfileStyle } from '../core/store.js';
import { PROFILE_STYLE_DEFAULTS, PROFILE_STYLE_KEY, PREMIUM_PROFILE_FRAMES, PREMIUM_PROFILE_COVERS, ANIMATED_PROFILE_COVERS, effectiveProfileStyle, normalizeProfileStyle, profileChoiceAllowed, profileCoverAsset } from '../core/profile-style.js';
import { CITY_EFFECTS, cityEffectAssets, cityTrafficMarkup } from '../core/profile-city-effects.js';
import { CITY_COVER_PRICE, CITY_PROFILE_COVERS, PROFILE_CITY_CATALOG } from '../core/profile-cities.js';
import { COLLECTIBLE_FRAME_PRICE, COLLECTIBLE_PROFILE_FRAMES, collectibleFrameAsset } from '../core/profile-frames.js';
import { FRAME_GEOMETRY } from '../core/profile-frame-geometry.js';
import { collectibleEffectsMarkup } from '../core/profile-frame-effects.js';
import { appAssetURL, cssAssetURL } from '../core/asset-url.js';
import { t, number } from '../core/i18n.js';
import { $, initials, onAction, openDialog, toast } from '../ui/components.js';
import { getWallet, purchaseCoverWithCoins, purchaseFrameWithCoins, walletError } from './wallet.js';
import { WALLET_KEY } from '../core/wallet.js';
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
let previewCover = null, buyingCover = '', cityError = '';
let previewFrame = null, buyingFrame = '', frameError = '';
function ownedCovers() { try { return getWallet()?.ownedCovers() ?? []; } catch { return []; } }
function ownedFrames() { try { return getWallet()?.ownedFrames() ?? []; } catch { return []; } }
const effective = () => effectiveProfileStyle(state.profileStyle, proAccess(), ownedCovers(), ownedFrames());

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
  const city = CITY_PROFILE_COVERS.includes(cover);
  setData(scene, 'city', city);
  if (changed && city) {
    for (const [key, path] of Object.entries(cityEffectAssets(cover))) scene.style.setProperty('--city-' + key, cssAssetURL(path));
    CITY_EFFECTS[cover].fog.forEach((value, index) => scene.style.setProperty('--fog-' + ['far', 'mid', 'near'][index], String(value)));
    scene.querySelector('.city-traffic').innerHTML = cityTrafficMarkup(cover);
  }
  const image = scene.querySelector('.scene-image'), asset = profileCoverAsset(cover);
  if (asset && image.getAttribute('src') !== asset) image.setAttribute('src', asset);
  const artwork = asset ? cssAssetURL(asset) : 'none';
  if (scene.style.getPropertyValue('--cover-art') !== artwork) scene.style.setProperty('--cover-art', artwork);
  image.hidden = !asset;
  const width = CITY_PROFILE_COVERS.includes(cover) ? 1536 : 1040, height = CITY_PROFILE_COVERS.includes(cover) ? 1024 : 440;
  if (image.width !== width) image.width = width;
  if (image.height !== height) image.height = height;
  if (changed && !scene.closest('[hidden]')) enter(scene, { y: 0, duration: MOTION.screen });
}
function renderFrame(node, value) {
  if (!node) return;
  const changed = node.dataset.frame !== value, collectible = COLLECTIBLE_PROFILE_FRAMES.includes(value);
  setData(node, 'frame', value);
  setData(node, 'collectible', collectible);
  setData(node.parentElement, 'collectible', collectible);
  if (collectible && changed) {
    const geometry = FRAME_GEOMETRY[value];
    const artwork = collectibleFrameAsset(value, node.id === 'headerAvatarFrame');
    const image = node.querySelector('.collectible-art');
    if (image.getAttribute('src') !== appAssetURL(artwork)) image.setAttribute('src', appAssetURL(artwork));
    node.style.setProperty('--collectible-art', cssAssetURL(artwork));
    node.style.setProperty('--collectible-light', cssAssetURL(`assets/profile-frames/${value}-light.webp`));
    node.style.setProperty('--collectible-aura', cssAssetURL(`assets/profile-frames/${value}-aura.webp`));
    node.style.setProperty('--collectible-clear', `${geometry.clear * 2}%`);
    node.parentElement.style.setProperty('--collectible-hole', String(geometry.hole));
    node.querySelector('.collectible-details').innerHTML = node.id === 'headerAvatarFrame' ? '' : collectibleEffectsMarkup(value);
  }
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
  const displayedFrame = kind === 'frame' && previewFrame ? previewFrame : settings.frame;
  renderFrame($(kind + 'PickerFrame'), displayedFrame);
  setData($(kind + 'StylePreview'), 'collectible', COLLECTIBLE_PROFILE_FRAMES.includes(displayedFrame));
  const displayedCover = kind === 'cover' && previewCover ? previewCover : settings.cover;
  renderScene($(kind + 'PickerScene'), displayedCover);
  setData($(kind + 'StylePreview'), 'city', CITY_PROFILE_COVERS.includes(displayedCover));
  $(kind + 'PickerName').textContent = state.profile?.name || 'FitCat';
  $(kind + 'StyleSelected').textContent = t(kind === 'cover' && displayedCover === 'none' ? 'profile_style_no_cover' : `profile_${kind}_${kind === 'cover' ? displayedCover : displayedFrame}`);
  $(kind + 'StyleExpired').hidden = settings[kind] === state.profileStyle[kind] || (kind === 'cover' ? CITY_PROFILE_COVERS.includes(state.profileStyle.cover) : COLLECTIBLE_PROFILE_FRAMES.includes(state.profileStyle.frame));
  const owned = ownedCovers();
  const frames = ownedFrames();
  for (const button of dialog.querySelectorAll('[data-profile-style-kind]')) {
    const selected = button.dataset.value === settings[kind];
    button.classList.toggle('active', selected);
    button.classList.toggle('is-preview', (kind === 'cover' ? previewCover : previewFrame) === button.dataset.value);
    button.setAttribute('aria-pressed', String(selected));
    const label = button.querySelector('.style-sample-initials');
    if (label) label.textContent = initials(state.profile?.name);
    if (kind === 'cover' && CITY_PROFILE_COVERS.includes(button.dataset.value)) {
      const purchased = owned.includes(button.dataset.value), price = button.querySelector('[data-city-price]');
      setData(button, 'owned', purchased);
      price.textContent = purchased ? t('profile_city_owned') : number(CITY_COVER_PRICE);
      button.setAttribute('aria-label', `${t('profile_cover_' + button.dataset.value)}. ${purchased ? t('profile_city_owned') : t('profile_city_preview') + '. ' + number(CITY_COVER_PRICE) + ' FitCat Coins'}`);
    }
    if (kind === 'frame' && COLLECTIBLE_PROFILE_FRAMES.includes(button.dataset.value)) {
      const purchased = frames.includes(button.dataset.value);
      setData(button, 'owned', purchased);
      button.querySelector('[data-frame-price]').textContent = purchased ? t('profile_city_owned') : number(COLLECTIBLE_FRAME_PRICE);
      button.setAttribute('aria-label', `${t('profile_frame_' + button.dataset.value)}. ${purchased ? t('profile_city_owned') : t('profile_frame_preview') + '. ' + number(COLLECTIBLE_FRAME_PRICE) + ' FitCat Coins'}`);
    }
  }
  if (kind === 'cover') renderCityOffer(displayedCover, owned);
  else renderFrameOffer(displayedFrame, frames);
  status(kind);
}
function renderFrameOffer(frame, owned) {
  const collectible = COLLECTIBLE_PROFILE_FRAMES.includes(frame);
  $('collectibleFrameOffer').hidden = !collectible;
  if (!collectible) return;
  $('collectibleFrameTitle').textContent = t('profile_frame_' + frame);
  $('collectibleFrameDetail').textContent = t('profile_frame_' + frame + '_detail');
  $('collectibleFrameReturn').hidden = !previewFrame;
  const purchased = owned.includes(frame), installed = effective().frame === frame;
  $('collectibleFramePurchase').hidden = purchased;
  $('collectibleFrameOwned').hidden = !purchased;
  $('collectibleFrameOwned').textContent = t(installed ? 'profile_city_applied' : 'profile_city_owned');
  $('collectibleFrameApply').hidden = !purchased || installed;
  $('collectibleFrameApply').dataset.value = frame;
  $('collectibleFramePrice').textContent = number(COLLECTIBLE_FRAME_PRICE);
  $('collectibleFrameBuyLabel').textContent = t(buyingFrame ? 'profile_city_buying' : 'profile_city_buy');
  let balance = 0, corrupt = false;
  try { balance = getWallet()?.snapshot().balance ?? 0; } catch { corrupt = true; }
  $('collectibleFrameBalance').textContent = number(balance);
  const insufficient = !purchased && balance < COLLECTIBLE_FRAME_PRICE;
  $('collectibleFrameBuy').disabled = Boolean(buyingFrame) || insufficient || corrupt;
  $('collectibleFrameShortfall').hidden = !insufficient || corrupt;
  $('collectibleFrameShortfallAmount').textContent = number(Math.max(0, COLLECTIBLE_FRAME_PRICE - balance));
  $('collectibleFrameError').hidden = !frameError && !corrupt;
  $('collectibleFrameError').textContent = corrupt ? t('wallet_corrupt') : frameError;
}
function renderCityOffer(cover, owned) {
  const city = PROFILE_CITY_CATALOG[cover];
  $('cityCoverOffer').hidden = !city;
  if (!city) return;
  $('cityCoverTitle').textContent = t('profile_cover_' + cover);
  $('cityCoverDetail').textContent = t('profile_city_' + cover + '_detail');
  $('cityCoverCredit').textContent = t('profile_city_original');
  $('cityCoverReturn').hidden = !previewCover;
  const purchased = owned.includes(cover), button = $('cityCoverBuy');
  $('cityCoverPurchase').hidden = purchased;
  $('cityCoverOwned').hidden = !purchased;
  const installed = effective().cover === cover;
  $('cityCoverOwned').textContent = t(installed ? 'profile_city_applied' : 'profile_city_owned');
  $('cityCoverApply').hidden = !purchased || installed;
  $('cityCoverApply').dataset.value = cover;
  $('cityCoverPrice').textContent = number(CITY_COVER_PRICE);
  $('cityCoverBuyLabel').textContent = t(buyingCover ? 'profile_city_buying' : 'profile_city_buy');
  let balance = 0, corrupt = false;
  try { balance = getWallet()?.snapshot().balance ?? 0; } catch { corrupt = true; }
  $('cityCoverBalance').textContent = number(balance);
  const insufficient = !purchased && balance < CITY_COVER_PRICE;
  button.disabled = Boolean(buyingCover) || insufficient || corrupt;
  $('cityCoverShortfall').hidden = !insufficient || corrupt;
  $('cityCoverShortfallAmount').textContent = number(Math.max(0, CITY_COVER_PRICE - balance));
  $('cityCoverError').hidden = !cityError && !corrupt;
  $('cityCoverError').textContent = corrupt ? t('wallet_corrupt') : cityError;
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
    const scene = $(id), active = visible && ANIMATED_PROFILE_COVERS.includes(scene?.dataset.cover);
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
  setData($('profileIdentityCard'), 'cityCover', CITY_PROFILE_COVERS.includes(settings.cover));
  setData($('profileIdentityCard'), 'collectibleFrame', COLLECTIBLE_PROFILE_FRAMES.includes(settings.frame));
  renderScene($('profileCoverScene'), settings.cover);
  renderPicker('frame', settings); renderPicker('cover', settings);
  syncProfileStyleMotion();
}
function choose(kind, value) {
  if (kind === 'frame' && COLLECTIBLE_PROFILE_FRAMES.includes(value) && !ownedFrames().includes(value)) {
    previewFrame = value; frameError = ''; errors.frame = false; renderProfileStyle();
    $('profileFrameModal').scrollTo?.({ top: 0, behavior: reducedMotion() ? 'instant' : 'smooth' });
    return;
  }
  if (kind === 'cover' && CITY_PROFILE_COVERS.includes(value) && !ownedCovers().includes(value)) {
    previewCover = value; cityError = ''; errors.cover = false; renderProfileStyle();
    $('profileCoverModal').scrollTo?.({ top: 0, behavior: reducedMotion() ? 'instant' : 'smooth' });
    return;
  }
  const premium = (kind === 'frame' ? PREMIUM_PROFILE_FRAMES : PREMIUM_PROFILE_COVERS).includes(value);
  if (!profileChoiceAllowed(kind, value, true, ownedCovers(), ownedFrames())) return;
  if (premium && !requirePro('profile-style')) return;
  try {
    if (state.profileStyle[kind] !== value) setProfileStyle({ ...state.profileStyle, [kind]: value });
    if (kind === 'cover') { previewCover = null; cityError = ''; }
    else { previewFrame = null; frameError = ''; }
    errors[kind] = false;
    renderProfileStyle();
    document.dispatchEvent(new CustomEvent('fitcat:profile-style', { detail: { kind } }));
  } catch (error) {
    console.error(error); errors[kind] = true; renderProfileStyle();
  }
}
async function buyCollectibleFrame() {
  const frame = previewFrame;
  if (!COLLECTIBLE_PROFILE_FRAMES.includes(frame) || buyingFrame || $('collectibleFrameBuy').disabled) return;
  buyingFrame = frame; frameError = ''; renderProfileStyle();
  try {
    await purchaseFrameWithCoins(frame);
    setProfileStyle({ ...state.profileStyle, frame });
    previewFrame = null; errors.frame = false;
    document.dispatchEvent(new CustomEvent('fitcat:profile-style', { detail: { kind: 'frame' } }));
    toast(`${t('profile_frame_purchased')}: ${t('profile_frame_' + frame)}`);
  } catch (error) { frameError = walletError(error); }
  finally { buyingFrame = ''; renderProfileStyle(); }
}
async function buyCityCover() {
  const cover = previewCover;
  if (!CITY_PROFILE_COVERS.includes(cover) || buyingCover || $('cityCoverBuy').disabled) return;
  buyingCover = cover; cityError = ''; renderProfileStyle();
  try {
    await purchaseCoverWithCoins(cover);
    // Capture the requested cover: a second preview during the write cannot
    // redirect a debit. A failed style save leaves the paid receipt available.
    setProfileStyle({ ...state.profileStyle, cover });
    previewCover = null; errors.cover = false;
    document.dispatchEvent(new CustomEvent('fitcat:profile-style', { detail: { kind: 'cover' } }));
    toast(`${t('profile_city_purchased')}: ${t('profile_cover_' + cover)}`);
  } catch (error) { cityError = walletError(error); }
  finally { buyingCover = ''; renderProfileStyle(); }
}
export function initProfileStyle() {
  if (initialized) return;
  initialized = true;
  onAction('openProfileStyle', button => {
    const kind = button.dataset.value;
    if (!['frame', 'cover'].includes(kind) || !state.profile) return;
    if (kind === 'cover') { previewCover = null; cityError = ''; }
    else { previewFrame = null; frameError = ''; }
    openDialog(kind === 'frame' ? 'profileFrameModal' : 'profileCoverModal');
    renderProfileStyle(); renderPremium();
  });
  onAction('chooseProfileStyle', button => choose(button.dataset.profileStyleKind, button.dataset.value));
  onAction('buyCityCover', buyCityCover);
  onAction('buyCollectibleFrame', buyCollectibleFrame);
  onAction('applyCollectibleFrame', button => choose('frame', button.dataset.value));
  onAction('cancelFramePreview', () => { previewFrame = null; frameError = ''; renderProfileStyle(); });
  $('profileFrameModal').addEventListener('close', () => { previewFrame = null; frameError = ''; });
  onAction('applyCityCover', button => choose('cover', button.dataset.value));
  onAction('cancelCityPreview', () => { previewCover = null; cityError = ''; renderProfileStyle(); });
  $('profileCoverModal').addEventListener('close', () => { previewCover = null; cityError = ''; });
  document.addEventListener('fitcat:wallet', renderProfileStyle);
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
    if (event.key === WALLET_KEY || event.key === null) { renderProfileStyle(); return; }
    if (event.key !== PROFILE_STYLE_KEY) return;
    try { state.profileStyle = normalizeProfileStyle(JSON.parse(event.newValue)); }
    catch { state.profileStyle = { ...PROFILE_STYLE_DEFAULTS }; }
    renderProfileStyle();
  });
}
