import { state, setAppearance } from '../core/store.js';
import { SOUND_DEFAULTS } from '../core/sounds.js';
import { t, number } from '../core/i18n.js';
import { $ } from '../ui/components.js';
import { soundSupported, configureInterfaceAudio, playInterfaceSound } from '../ui/sounds.js';

let volumeDraft = null, saveTimer = 0, saveError = false;
const current = () => ({ ...state.appearance, ...(volumeDraft === null ? {} : { soundVolume: volumeDraft }) });

export function renderAudioSettings() {
  const settings = current(), supported = soundSupported();
  $('settingsSoundEnabled').checked = settings.soundEnabled;
  $('settingsSoundEnabled').disabled = !supported;
  const input = $('settingsSoundVolume');
  if (input.value !== String(settings.soundVolume)) input.value = String(settings.soundVolume);
  input.disabled = !supported || !settings.soundEnabled;
  input.style.setProperty('--range-fill', `${settings.soundVolume}%`);
  $('settingsSoundVolumeOutput').textContent = `${number(settings.soundVolume)}%`;
  input.setAttribute('aria-valuetext', $('settingsSoundVolumeOutput').textContent);
  const status = $('settingsSoundStatus');
  status.hidden = supported && !saveError;
  status.dataset.error = String(saveError);
  status.textContent = saveError ? t('save_error') : supported ? '' : t('settings_sound_unavailable');
  configureInterfaceAudio(settings);
}

function save(patch) {
  try {
    setAppearance({ ...state.appearance, ...patch, soundStyle: SOUND_DEFAULTS.soundStyle });
    saveError = false;
    return true;
  } catch { saveError = true; return false; }
}

export function flushAudioSettings() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (volumeDraft === null) return true;
  const volume = volumeDraft; volumeDraft = null;
  const saved = save({ soundVolume: volume });
  renderAudioSettings();
  return saved;
}

export function initAudioSettings() {
  const toggle = $('settingsSoundEnabled'), volume = $('settingsSoundVolume');
  toggle.addEventListener('change', () => {
    const value = toggle.checked;
    if (!flushAudioSettings()) return;
    save({ soundEnabled: value }); renderAudioSettings();
    if (!saveError && value) void playInterfaceSound();
  });
  volume.addEventListener('input', () => {
    const value = Number(volume.value);
    if (!Number.isFinite(value) || !soundSupported() || !state.appearance.soundEnabled) return;
    volumeDraft = Math.round(Math.max(0, Math.min(100, value))); saveError = false;
    renderAudioSettings();
    clearTimeout(saveTimer); saveTimer = setTimeout(flushAudioSettings, 220);
  });
  volume.addEventListener('change', () => {
    if (volumeDraft === null && Number.isFinite(Number(volume.value))) volumeDraft = Math.round(Math.max(0, Math.min(100, Number(volume.value))));
    if (flushAudioSettings() && state.appearance.soundEnabled) void playInterfaceSound();
  });
  volume.addEventListener('focusout', flushAudioSettings);
  document.addEventListener('fitcat:screen', event => { if (event.detail !== 'settingsPage') flushAudioSettings(); else renderAudioSettings(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAudioSettings(); });
  window.addEventListener('pagehide', flushAudioSettings);
  document.addEventListener('fitcat:audio-status', event => {
    if (event.detail?.state !== 'unavailable' || $('settingsPage').hidden) return;
    $('settingsSoundStatus').hidden = false;
    $('settingsSoundStatus').textContent = t('settings_sound_error');
  });
  renderAudioSettings();
}
