import { state, targets } from '../core/store.js';
import { temperatureBonus, stepsBonus } from '../core/math.js';
import { t, number } from '../core/i18n.js';
import { $, onAction, changed, openDialog, closeDialog, toast, animateNumber } from '../ui/components.js';
import { revealRegion } from '../ui/motion.js';
import { haptic } from '../ui/haptics.js';

let candidateActivity;

export function renderPreferences() {
  const preferences = state.preferences;
  $('hapticsToggle').checked = preferences.hapticsEnabled;
  $('hapticsTest').disabled = !preferences.hapticsEnabled;
  for (const group of ['setup', 'settings']) {
    for (const [suffix, value] of [['Ru','ru'], ['En','en'], ['Cn','cn']]) {
      const button = $(group + 'Lang' + suffix);
      button.classList.toggle('active', preferences.lang === value);
      button.setAttribute('aria-pressed', String(preferences.lang === value));
    }
  }
  for (const [toggle, flag, settings, label] of [
    ['smartWaterToggle', 'smartWaterEnabled', 'smartWaterSettings', 'smartWaterToggleLabel'],
    ['smartSearchToggle', 'smartSearchEnabled', 'smartSearchSettings', 'smartSearchToggleLabel'],
    ['workoutToggle', 'workoutEnabled', 'workoutSettings', 'workoutToggleLabel'],
  ]) {
    $(toggle).checked = preferences[flag];
    revealRegion($(settings), preferences[flag]);
    $(label).textContent = t(preferences[flag] ? 'on' : 'off');
  }
  $('waterBaseOnly').hidden = preferences.smartWaterEnabled;
  $('tempSlider').value = preferences.currentTemp;
  $('stepsSlider').value = preferences.currentSteps;
  $('resultsSlider').value = preferences.smartSearchResults;
  $('resultsDisplay').textContent = number(preferences.smartSearchResults);
  renderSmartWater();
  $('workoutIntensity').value = preferences.workoutIntensity;
  document.querySelectorAll('#workoutIntensityControl button').forEach(button => {
    button.classList.toggle('active', button.dataset.value === preferences.workoutIntensity);
    button.setAttribute('aria-pressed', String(button.dataset.value === preferences.workoutIntensity));
  });
  renderActivityOptions();
}

function renderSmartWater() {
  const preferences = state.preferences;
  const goal = targets().water;
  const base = Math.round((state.profile?.weight || 0) * 35);
  const enabled = Boolean(state.profile && preferences.smartWaterEnabled);
  const temperature = enabled ? temperatureBonus(preferences.currentTemp) : 0;
  const steps = enabled ? stepsBonus(preferences.currentSteps) : 0;
  // The established target already includes training. Expose that contribution
  // so every displayed row adds up without changing the original calculation.
  const training = Math.max(0, goal - base - temperature - steps);
  const extra = Math.max(0, goal - base);
  const volume = value => `${number(value)} ${t('ml')}`;
  $('tempDisplay').textContent = `${number(preferences.currentTemp)}°C`;
  $('stepsDisplay').textContent = number(preferences.currentSteps);
  $('tempSlider').style.setProperty('--range-fill', `${Math.max(0, Math.min(100, (preferences.currentTemp + 10) * 2))}%`);
  $('stepsSlider').style.setProperty('--range-fill', `${Math.max(0, Math.min(100, preferences.currentSteps / 200))}%`);
  $('tempSlider').setAttribute('aria-valuetext', $('tempDisplay').textContent);
  $('stepsSlider').setAttribute('aria-valuetext', `${number(preferences.currentSteps)} ${t('steps')}`);
  $('baseWaterNorm').textContent = volume(base);
  $('tempBonus').textContent = $('tempBonusChip').textContent = `+${volume(temperature)}`;
  $('stepsBonus').textContent = $('stepsBonusChip').textContent = `+${volume(steps)}`;
  $('smartWaterWorkoutBonus').textContent = `+${volume(training)}`;
  $('totalWaterNorm').textContent = volume(goal);
  animateNumber($('smartWaterGoal'), goal / 1000, 2);
  $('smartWaterExtraAmount').textContent = `+${volume(extra)}`;
  $('smartWaterExtraLine').hidden = !extra;
  $('smartWaterBaseLabel').hidden = Boolean(extra);
  $('smartWaterTempRow').hidden = !enabled;
  $('smartWaterStepsRow').hidden = !enabled;
  $('smartWaterWorkoutRow').hidden = !training;
}

function renderActivityOptions() {
  const selected = candidateActivity ?? state.preferences.dailyActivity;
  document.querySelectorAll('.activity-daily-item').forEach(button => {
    button.classList.toggle('selected', Number(button.dataset.activity) === selected);
    button.setAttribute('aria-pressed', String(Number(button.dataset.activity) === selected));
  });
}

function renderAbout() {
  const russian = state.preferences.lang === 'ru';
  const chinese = state.preferences.lang === 'cn';
  $('aboutContent').innerHTML = russian ? `
    <p>FitCat помогает вести дневник питания, воды, активности и изменений веса.</p>
    <h3>Данные</h3><p>Профиль, фото и дневник сохраняются в браузере на этом устройстве. Для функции друзей имя, дневные цели, сегодняшний список продуктов и вода синхронизируются с Firebase и доступны по твоему ID.</p>
    <p>При поиске продуктов и сканировании штрихкода приложение обращается к Open Food Facts. Сохранённые данные можно скачать и восстановить в настройках.</p>
    <h3>Расчёты</h3><p>Расчёты основаны на общих формулах из предыдущей версии FitCat и носят информационный характер. Приложение не является медицинским сервисом.</p>
    <h3>Открытые библиотеки</h3><ul><li>Chart.js — графики (MIT).</li><li>ZXing — сканер штрихкодов (Apache 2.0).</li><li>QuaggaJS — резервный сканер (MIT).</li><li>MediaPipe Hands — управление жестами (Apache 2.0).</li><li>Firebase — прогресс друзей.</li></ul><p>Данные продуктов: <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a>. Проверяй состав и значения по упаковке продукта.</p><p class="version">FitCat 3.4.3</p>` : chinese ? `
    <p>FitCat 用于记录饮食、饮水、活动和体重变化。</p><h3>数据</h3><p>个人资料、照片和日记保存在此设备的浏览器中。好友功能将姓名、每日目标、今日食物和饮水量同步到 Firebase，可通过你的 ID 查看。搜索和条码查询使用 Open Food Facts。</p><h3>计算</h3><p>计算沿用原版 FitCat 的通用公式，仅供参考，不构成医疗建议。</p><h3>开源工具</h3><p>Chart.js、ZXing、QuaggaJS、MediaPipe Hands 和 Firebase。食物数据来自 Open Food Facts。</p><p class="version">FitCat 3.4.3</p>` : `
    <p>FitCat tracks food, water, activity and weight changes.</p><h3>Your data</h3><p>Your profile, photo and diary are stored in this device’s browser. For the friends feature, your name, daily targets, today’s foods and water are synced to Firebase and can be viewed using your ID. Food search and barcode lookup use Open Food Facts.</p><p>Export and restore your data in Settings.</p><h3>Calculations</h3><p>Calculations retain the general formulas from the original FitCat source. They are informational and do not constitute medical advice.</p><h3>Open-source libraries</h3><p>Chart.js (MIT), ZXing (Apache 2.0), QuaggaJS (MIT), MediaPipe Hands (Apache 2.0) and Firebase. Product data: <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a>.</p><p class="version">FitCat 3.4.3</p>`;
}

export function initPreferences() {
  $('hapticsToggle').addEventListener('change', event => { state.preferences.hapticsEnabled = event.target.checked; changed(); if (event.target.checked) haptic(); });
  onAction('testHaptics', () => { if (!haptic()) toast(t('haptics_unavailable')); });
  const setLanguage = button => {
    state.preferences.lang = button.dataset.value; changed();
    document.dispatchEvent(new Event('fitcat:language'));
  };
  onAction('setSetupLanguage', setLanguage); onAction('setSettingsLanguage', setLanguage);
  onAction('openSmartWater', () => { renderPreferences(); openDialog('smartWaterModal'); });
  onAction('closeSmartWater', () => closeDialog('smartWaterModal'));
  onAction('openSmartSearch', () => { renderPreferences(); openDialog('smartSearchModal'); });
  onAction('closeSmartSearch', () => closeDialog('smartSearchModal'));
  onAction('openAbout', () => { renderAbout(); openDialog('aboutModal'); });
  onAction('closeAbout', () => closeDialog('aboutModal'));
  onAction('selectDailyActivity', button => { candidateActivity = Number(button.dataset.activity); renderActivityOptions(); });
  onAction('applyDailyActivity', () => {
    state.preferences.dailyActivity = candidateActivity ?? state.preferences.dailyActivity; changed(); toast(t('saved'));
  });
  onAction('selectWorkoutIntensity', button => { state.preferences.workoutIntensity = button.dataset.value; changed(); });
  document.addEventListener('fitcat:tab', event => {
    if (event.detail === 'activity') { candidateActivity = state.preferences.dailyActivity; renderActivityOptions(); }
  });
  for (const [identifier, key] of [['smartWaterToggle','smartWaterEnabled'], ['smartSearchToggle','smartSearchEnabled'], ['workoutToggle','workoutEnabled']]) {
    $(identifier).addEventListener('change', event => { state.preferences[key] = event.target.checked; changed(); });
  }
  for (const [identifier, key] of [['tempSlider','currentTemp'], ['stepsSlider','currentSteps'], ['resultsSlider','smartSearchResults']]) {
    $(identifier).addEventListener('input', event => { state.preferences[key] = Number(event.target.value); changed(); });
  }
}
