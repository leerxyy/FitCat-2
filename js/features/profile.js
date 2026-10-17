import { state, setPhoto, exportSnapshot, importSnapshot, clearAccount } from '../core/store.js';
import { t } from '../core/i18n.js';
import { localDate } from '../core/math.js';
import { $, icon, initials, onAction, changed, toast, confirmAction } from '../ui/components.js';
import { showScreen } from '../ui/navigation.js';

export function renderIdentity() {
  const header = $('headerPhoto');
  header.replaceChildren();
  if (state.photo) {
    const image = document.createElement('img'); image.src = state.photo; image.alt = '';
    header.append(image);
  } else header.innerHTML = icon('user');
  $('profileUidDisplay').textContent = state.uid;
  $('streakCount').textContent = state.streak;
}

export function setSegment(target, value) {
  $(target).value = value;
  const container = $(target + 'Control');
  if (container) container.querySelectorAll('.segmented-option').forEach(button => {
    const active = button.dataset.value === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderProfile() {
  if (!state.profile) return;
  for (const key of ['name', 'age', 'height', 'weight']) $('profile' + key[0].toUpperCase() + key.slice(1)).value = state.profile[key] ?? '';
  setSegment('profileGender', state.profile.gender);
  setSegment('profileGoal', state.profile.goal || 'lose');
  $('profilePhoto').replaceChildren();
  if (state.photo) {
    const image = document.createElement('img'); image.src = state.photo; image.alt = t('profile'); $('profilePhoto').append(image);
  } else {
    const label = document.createElement('span'); label.className = 'profile-initials'; label.textContent = initials(state.profile.name); $('profilePhoto').append(label);
  }
  $('profilePhoto').setAttribute('role', 'button'); $('profilePhoto').tabIndex = 0;
  $('profilePhoto').setAttribute('aria-label', t('photo_hint'));
}

function collectProfile(prefix) {
  return {
    name: $(prefix + 'Name').value.trim(), age: Number($(prefix + 'Age').value),
    gender: $(prefix + 'Gender').value, height: Number($(prefix + 'Height').value), weight: Number($(prefix + 'Weight').value),
  };
}

async function uploadPhoto(file) {
  if (!file || !file.type.startsWith('image/')) { toast(t('photo_error')); return; }
  if (file.size > 3 * 1024 * 1024) { toast(t('photo_too_large')); return; }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL('image/jpeg', .84)); renderIdentity(); renderProfile(); toast(t('saved'));
  } catch (error) { console.error(error); toast(t('photo_error')); }
  finally { URL.revokeObjectURL(url); }
}

export function initProfile() {
  for (const [name, target] of [['selectSetupGender', 'setupGender'], ['selectProfileGender', 'profileGender'], ['selectProfileGoal', 'profileGoal']]) {
    onAction(name, button => setSegment(target, button.dataset.value));
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
    if (!$('profileForm').reportValidity()) return;
    const profile = collectProfile('profile');
    if (!profile.name) { $('profileName').focus(); return; }
    state.profile = { ...state.profile, ...profile, goal: $('profileGoal').value };
    changed(); renderIdentity(); showScreen('mainPage'); toast(t('saved'));
  });
  onAction('showProfile', () => { renderProfile(); showScreen('profilePage'); });
  onAction('showPage', button => showScreen(button.dataset.value));
  document.addEventListener('fitcat:screen', event => { if (event.detail === 'profilePage') renderProfile(); });
  onAction('uploadPhoto', () => $('photoInput').click());
  $('profilePhoto').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('photoInput').click(); } });
  $('photoInput').addEventListener('change', event => { uploadPhoto(event.target.files[0]); event.target.value = ''; });
  onAction('deletePhoto', () => { setPhoto(''); renderIdentity(); renderProfile(); });
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
    clearAccount(); location.reload();
  });
}
