import { state, setAppearance } from '../core/store.js';
import { t } from '../core/i18n.js';
import { $ } from '../ui/components.js';
import { soundSupported, configureInterfaceAudio, playInterfaceSound } from '../ui/sounds.js';

let saveError = false;

export function renderAudioSettings() {
  const supported = soundSupported();
  $('settingsSoundEnabled').checked = state.appearance.soundEnabled;
  $('settingsSoundEnabled').disabled = !supported;
  const status = $('settingsSoundStatus');
  status.hidden = supported && !saveError;
  status.dataset.error = String(saveError);
  status.textContent = saveError ? t('save_error') : supported ? '' : t('settings_sound_unavailable');
  configureInterfaceAudio(state.appearance);
}

export function initAudioSettings() {
  $('settingsSoundEnabled').addEventListener('change', event => {
    const enabled = event.target.checked;
    try { setAppearance({ ...state.appearance, soundEnabled: enabled }); saveError = false; }
    catch { saveError = true; }
    renderAudioSettings();
    if (!saveError && enabled) void playInterfaceSound();
  });
  document.addEventListener('fitcat:screen', event => { if (event.detail === 'settingsPage') renderAudioSettings(); });
  document.addEventListener('fitcat:audio-status', event => {
    if (event.detail?.state !== 'unavailable' || $('settingsPage').hidden) return;
    $('settingsSoundStatus').hidden = false;
    $('settingsSoundStatus').textContent = t('settings_sound_error');
  });
  renderAudioSettings();
}
