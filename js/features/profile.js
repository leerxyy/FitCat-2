import { state, setProfile, setPhoto, exportSnapshot, importSnapshot, clearAccount } from '../core/store.js';
import { t } from '../core/i18n.js';
import { localDate } from '../core/math.js';
import { $, icon, initials, onAction, changed, toast, confirmAction } from '../ui/components.js';
import { showScreen, showTab } from '../ui/navigation.js';
import { enter, MOTION } from '../ui/motion.js';
import { initProfileSwipe } from '../ui/profile-swipe.js';
import { initPhotoEditor } from '../ui/photo-editor.js';
import { initSelectionLens, syncSelectionLens } from '../ui/selection-lens.js';
import { haptic } from '../ui/haptics.js';
import { initProfileStyle, renderProfileStyle, syncProfileStyleMotion } from './profile-style.js';

const avatars = new WeakMap();
let photoVersion = 0;
let photoEditor;
let feedbackTimer, profileChanged = false;
const profileFields = { profileName: 'name', profileAge: 'age', profileHeight: 'height', profileWeight: 'weight', profileGender: 'gender', profileGoal: 'goal' };

function profileStatus(key = 'profile_auto_hint') {
  $('profileAutosave').dataset.state = key === 'save_error' ? 'error' : key === 'profile_auto_invalid' ? 'invalid' : 'saved';
  $('profileAutosaveText').dataset.i18n = key; $('profileAutosaveText').textContent = t(key);
}
export function flushProfileFeedback() {
  clearTimeout(feedbackTimer);
  if (!profileChanged) return;
  profileChanged = false;
  document.dispatchEvent(new CustomEvent('fitcat:change'));
}
function saveProfileField(input, showInvalid = false) {
  const key = profileFields[input?.id];
  if (!key || !state.profile) return;
  const raw = input.value.trim(); let value = raw, valid = Boolean(raw);
  if (key === 'gender') valid = ['female', 'male'].includes(raw);
  else if (key === 'goal') valid = ['lose', 'maintain', 'gain'].includes(raw);
  else if (key !== 'name') {
    value = Number(raw);
    const [min, max, step] = { age: [10, 100, 1], height: [100, 250, 1], weight: [30, 500, .1] }[key];
    valid = valid && Number.isFinite(value) && value >= min && value <= max && Math.abs(value / step - Math.round(value / step)) < 1e-7;
  }
  input.setAttribute('aria-invalid', String(!valid && showInvalid));
  if (!valid) { if (showInvalid) profileStatus('profile_auto_invalid'); return; }
  if (state.profile[key] === value) { if (showInvalid) profileStatus(); return; }
  try {
    setProfile({ ...state.profile, [key]: value });
    profileStatus('profile_auto_saved'); renderIdentity();
    profileChanged = true; clearTimeout(feedbackTimer); feedbackTimer = setTimeout(flushProfileFeedback, 180);
  } catch (error) { console.error(error); profileStatus('save_error'); }
}

function renderAvatar(element, initialLabel = '', animate = false) {
  const labelKey = state.photo ? '' : initialLabel;
  const previous = avatars.get(element);
  if (previous?.photo === state.photo && previous?.initialLabel === labelKey && element.children.length) return;
  avatars.set(element, { photo: state.photo, initialLabel: labelKey }); element.replaceChildren();
  if (state.photo) {
    const image = document.createElement('img'); image.src = state.photo; image.alt = ''; element.append(image);
  } else if (initialLabel) {
    const label = document.createElement('span'); label.className = 'profile-initials'; label.textContent = initialLabel; element.append(label);
  } else element.innerHTML = icon('user');
  if (animate) enter(element.firstElementChild || element.children[0], { y: 0, duration: MOTION.panel });
}

export function renderIdentity({ animatePhoto = false } = {}) {
  renderAvatar($('headerPhoto'));
  renderAvatar($('profilePhoto'), initials(state.profile?.name), animatePhoto);
  $('profilePhoto').setAttribute('aria-label', t('photo_hint'));
  $('profilePhotoDelete').hidden = !state.photo;
  $('profileUidDisplay').textContent = state.uid.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1 $2 $3 $4');
  $('profileAchievementsText').textContent = t('profile_achievements_soon');
  renderProfileStyle();
}

export function setSegment(target, value) {
  $(target).value = value;
  const container = $(target + 'Control');
  if (target === 'profileGender') container?.style.setProperty('--segment-index', value === 'male' ? 1 : 0);
  if (container) container.querySelectorAll('.segmented-option').forEach(button => {
    const active = button.dataset.value === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (container) syncSelectionLens(container);
}

function renderProfile() {
  if (!state.profile) return;
  for (const key of ['name', 'age', 'height', 'weight']) $('profile' + key[0].toUpperCase() + key.slice(1)).value = state.profile[key] ?? '';
  setSegment('profileGender', state.profile.gender === 'male' ? 'male' : 'female');
  setSegment('profileGoal', ['lose', 'maintain', 'gain'].includes(state.profile.goal) ? state.profile.goal : 'lose');
  renderIdentity();
  profileStatus();
  for (const id of Object.keys(profileFields)) $(id).removeAttribute('aria-invalid');
  $('profileTitle').focus({ preventScroll: true });
  $('profileForm').querySelectorAll('.card').forEach((card, index) => enter(card, { y: 10, delay: index * 45, duration: MOTION.screen }));
}

function backToToday() {
  flushProfileFeedback();
  document.activeElement?.blur?.();
  showTab('today'); showScreen('mainPage', { x: -28, y: 0, duration: MOTION.screen });
}

function collectProfile(prefix) {
  return {
    name: $(prefix + 'Name').value.trim(), age: Number($(prefix + 'Age').value),
    gender: $(prefix + 'Gender').value, height: Number($(prefix + 'Height').value), weight: Number($(prefix + 'Weight').value),
  };
}

async function uploadPhoto(file) {
  const request = ++photoVersion;
  if (!file || !file.type.startsWith('image/')) { toast(t('photo_error')); return; }
  if (file.size > 3 * 1024 * 1024) { toast(t('photo_too_large')); return; }
  let url, handedOff = false;
  try {
    url = URL.createObjectURL(file);
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    if (request !== photoVersion || !state.profile) return;
    const previousPhoto = state.photo;
    photoEditor.open({ image, valid: () => Boolean(state.profile) && state.photo === previousPhoto,
      release: () => URL.revokeObjectURL(url) });
    handedOff = true;
  } catch (error) { if (request === photoVersion) { console.error(error); toast(t('photo_error')); } }
  finally { if (url && !handedOff) URL.revokeObjectURL(url); }
}

async function editPhoto() {
  if (!state.photo) { $('photoInput').click(); return; }
  const request = ++photoVersion, previousPhoto = state.photo, edit = state.photoEdit;
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = edit?.source || previousPhoto; });
    if (request !== photoVersion || !state.profile || state.photo !== previousPhoto) return;
    photoEditor.open({ image, source: image.src, frame: edit?.frame,
      valid: () => Boolean(state.profile) && state.photo === previousPhoto });
  } catch (error) { if (request === photoVersion) { console.error(error); toast(t('photo_error')); } }
}

export function initProfile() {
  initProfileStyle();
  photoEditor = initPhotoEditor({ onChoose: () => $('photoInput').click(), onSave: (photo, edit) => {
    setPhoto(photo, edit); photoVersion++;
    renderIdentity({ animatePhoto: true }); toast(t('saved'));
  } });
  $('photoCropModal').addEventListener('close', () => { photoVersion++; });
  const select = (target, value) => { setSegment(target, value); if (target !== 'setupGender') { saveProfileField($(target)); flushProfileFeedback(); } };
  for (const [name, target] of [['selectSetupGender', 'setupGender'], ['selectProfileGender', 'profileGender'], ['selectProfileGoal', 'profileGoal']]) onAction(name, button => select(target, button.dataset.value));
  for (const [target, values, padding, gap] of [['profileGender', ['female', 'male'], 3, 0], ['profileGoal', ['lose', 'maintain', 'gain'], 0, 8]]) {
    initSelectionLens($(target + 'Control'), { padding, gap,
      getIndex: () => values.indexOf($(target).value),
      onSelect: index => { haptic(); select(target, values[index]); },
      isEnabled: () => document.body.dataset.screen === 'profilePage',
    });
  }
  $('setupForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('setupForm').reportValidity()) return;
    const profile = collectProfile('setup');
    if (!profile.name) { $('setupName').focus(); return; }
    state.profile = { ...profile, goal: 'lose', startWeight: profile.weight, targetWeight: Math.round(profile.weight * .9 * 10) / 10 };
    state.lastDate = new Date().toDateString(); changed(); renderIdentity(); showScreen('mainPage');
  });
  $('profileForm').addEventListener('submit', event => {
    event.preventDefault();
    for (const id of Object.keys(profileFields)) saveProfileField($(id), true);
    flushProfileFeedback();
  });
  for (const eventName of ['input', 'change', 'focusout', 'compositionend']) $('profileForm').addEventListener(eventName, event => {
    if (event.isComposing) return;
    saveProfileField(event.target, eventName === 'focusout' || eventName === 'change');
    if (eventName !== 'input') flushProfileFeedback();
  });
  onAction('showProfile', () => { if (state.profile) showScreen('profilePage', { x: 28, y: 0, duration: MOTION.screen }); });
  onAction('profileBackToToday', backToToday);
  initProfileSwipe($('profilePage'), backToToday);
  onAction('showPage', button => showScreen(button.dataset.value));
  document.addEventListener('fitcat:screen', event => {
    if (event.detail === 'profilePage') renderProfile();
    else { flushProfileFeedback(); photoVersion++; photoEditor.discard(); }
    syncProfileStyleMotion();
  });
  onAction('uploadPhoto', editPhoto);
  $('photoInput').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) uploadPhoto(file); event.target.value = ''; });
  onAction('deletePhoto', () => { photoVersion++; photoEditor.discard(); const hadPhoto = Boolean(state.photo); setPhoto(''); renderIdentity({ animatePhoto: true }); if (hadPhoto) toast(t('profile_photo_removed')); });
  onAction('copyUid', async () => {
    try { await navigator.clipboard.writeText(state.uid); toast(t('copied')); }
    catch { toast(`${t('my_id')}: ${state.uid}`); }
  });
  onAction('exportData', () => {
    const blob = new Blob([JSON.stringify(exportSnapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `FitCat-backup-${localDate()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  onAction('importData', () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0]; if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        if (!(await confirmAction(t('import_confirm')))) return;
        importSnapshot(backup); location.reload();
      } catch (error) { console.error(error); toast(t('invalid_backup')); }
    });
    input.click();
  });
  onAction('deleteAccount', async () => {
    if (!(await confirmAction(t('confirm_delete')))) return;
    photoVersion++;
    photoEditor.discard();
    clearAccount(); location.reload();
  });
}
