import { state, targets, proAccess } from '../core/store.js';
import { temperatureBonus, stepsBonus, calculateTargets, ACTIVITY_LEVELS, WORKOUT_CALORIES } from '../core/math.js';
import { t, number } from '../core/i18n.js';
import { $, onAction, changed, openDialog, closeDialog, toast, animateNumber } from '../ui/components.js';
import { revealRegion, enter } from '../ui/motion.js';
import { haptic } from '../ui/haptics.js';
import { initWeather, renderWeather, stopWeatherRequest, useManualTemperature, ensureDailyWeather } from './weather.js';
import { requirePro } from '../ui/premium.js';
import { initSelectionLens, syncSelectionLens } from '../ui/selection-lens.js';

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
  syncSelectionLens($('settingsLanguageControl'));
  for (const [toggle, flag, settings, label] of [
    ['smartWaterToggle', 'smartWaterEnabled', 'smartWaterSettings', 'smartWaterToggleLabel'],
    ['smartSearchToggle', 'smartSearchEnabled', 'smartSearchSettings', 'smartSearchToggleLabel'],
  ]) {
    const enabled = preferences[flag] && (flag !== 'smartWaterEnabled' || proAccess());
    $(toggle).checked = enabled;
    revealRegion($(settings), enabled);
    $(label).textContent = t(enabled ? 'on' : 'off');
  }
  $('waterBaseOnly').hidden = preferences.smartWaterEnabled && proAccess();
  $('smartWaterConditions').setAttribute('aria-pressed', String(preferences.smartWaterEnabled && proAccess()));
  $('tempSlider').value = preferences.currentTemp;
  $('stepsSlider').value = preferences.currentSteps;
  $('resultsSlider').value = preferences.smartSearchResults;
  $('resultsDisplay').textContent = number(preferences.smartSearchResults);
  renderSmartWater();
  renderWeather();
  renderWorkout();
  renderActivityOptions();
}

function renderWorkout() {
  const preferences = state.preferences; const enabled = preferences.workoutEnabled;
  $('workoutToggle').checked = $('activityWorkoutToggle').checked = enabled;
  $('workoutToggle').setAttribute('aria-expanded', String(enabled));
  $('workoutToggleLabel').textContent = t(enabled ? 'on' : 'off');
  $('workoutOffHint').hidden = enabled;
  if ($('workoutModal').open) revealRegion($('workoutSettings'), enabled);
  else $('workoutSettings').hidden = !enabled;
  $('activityWorkoutDetail').textContent = t(enabled ? 'workout_' + preferences.workoutIntensity : 'activity_workout_hint');
  $('activityWorkoutDetail').removeAttribute('data-i18n');
  document.querySelector('.activity-workout-card').classList.toggle('is-enabled', enabled);
  $('workoutIntensity').value = preferences.workoutIntensity;
  document.querySelectorAll('#workoutIntensityControl button').forEach(button => {
    const selected = button.dataset.value === preferences.workoutIntensity;
    button.classList.toggle('active', selected); button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected)); button.disabled = !enabled;
  });
  // Show the actual difference produced by the existing goal formula, including
  // its gain/loss multiplier, rather than presenting an estimate of calories burnt.
  const without = calculateTargets(state.profile, { ...preferences, workoutEnabled: false });
  const withWorkout = calculateTargets(state.profile, { ...preferences, workoutEnabled: enabled });
  animateNumber($('workoutCalorieBonus'), Math.max(0, withWorkout.kcal - without.kcal));
  animateNumber($('workoutWaterBonus'), Math.max(0, withWorkout.water - without.water));
}

function openWorkout() {
  renderWorkout(); openDialog('workoutModal');
  if (state.preferences.workoutEnabled) document.querySelectorAll('#workoutIntensityControl button').forEach((button, index) => enter(button, { y: 8, delay: index * 30 }));
}

function renderSmartWater() {
  const preferences = state.preferences;
  const goal = targets().water;
  const base = Math.round((state.profile?.weight || 0) * 35);
  const enabled = Boolean(state.profile && preferences.smartWaterEnabled && proAccess());
  const temperature = enabled ? temperatureBonus(preferences.currentTemp) : 0;
  const steps = enabled ? stepsBonus(preferences.currentSteps) : 0;
  // The established target already includes training. Expose that contribution
  // so every displayed row adds up without changing the original calculation.
  const training = Math.max(0, goal - base - temperature - steps);
  const extra = Math.max(0, goal - base);
  const volume = value => `${number(value)} ${t('ml')}`;
  $('tempDisplay').textContent = `${number(preferences.currentTemp, preferences.waterTemperatureMode === 'auto' ? 1 : 0)}°C`;
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
  const selected = state.preferences.dailyActivity;
  document.querySelectorAll('.activity-daily-item').forEach(button => {
    button.classList.toggle('selected', Number(button.dataset.activity) === selected);
    button.setAttribute('aria-pressed', String(Number(button.dataset.activity) === selected));
  });
  $('activityLevelMeter').dataset.level = String(Math.max(0, ACTIVITY_LEVELS.indexOf(selected)) + 1);
}

function renderAbout() {
  const russian = state.preferences.lang === 'ru';
  const chinese = state.preferences.lang === 'cn';
  $('aboutContent').innerHTML = russian ? `
    <p>FitCat помогает вести дневник питания, воды, активности и изменений веса.</p>
    <h3>Данные</h3><p>Профиль, фото и дневник сохраняются в браузере на этом устройстве. Для функции друзей имя, дневные цели, сегодняшний список продуктов и вода синхронизируются с Firebase и доступны по твоему ID.</p>
    <p>При поиске продуктов и сканировании штрихкода приложение обращается к Open Food Facts. Сохранённые данные можно скачать и восстановить в настройках.</p>
    <h3>Погода</h3><p>В «Умной воде» можно включить автоматический прогноз или задать температуру вручную. Геолокация запрашивается по кнопке; координаты округляются до сотых градуса и передаются Open-Meteo. Выбранное место и дневной прогноз сохраняются на устройстве и входят в резервную копию. Фонового отслеживания нет. Погодная поправка фиксируется до следующего дня; пересчитать её можно вручную.</p><p>Погода: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>, среднее за 09:00–21:00 по времени устройства; данные <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Шаги в этой PWA вводятся вручную.</p>
    <h3>Расчёты</h3><p>Расчёты основаны на общих формулах из предыдущей версии FitCat и носят информационный характер. Приложение не является медицинским сервисом.</p>
    <h3>Открытые библиотеки</h3><ul><li>Chart.js — графики (MIT).</li><li>ZXing — сканер штрихкодов (Apache 2.0).</li><li>QuaggaJS — резервный сканер (MIT).</li><li>MediaPipe Hands — управление жестами (Apache 2.0).</li><li>Firebase — прогресс друзей.</li></ul><p>Данные продуктов: <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a>. Проверяй состав и значения по упаковке продукта.</p><p class="version">FitCat 3.18.0</p>` : chinese ? `
    <p>FitCat 用于记录饮食、饮水、活动和体重变化。</p><h3>数据</h3><p>个人资料、照片和日记保存在此设备的浏览器中。好友功能将姓名、每日目标、今日食物和饮水量同步到 Firebase，可通过你的 ID 查看。搜索和条码查询使用 Open Food Facts。</p><h3>天气</h3><p>仅点击定位按钮时请求位置。坐标四舍五入到小数点后两位后发送给 <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>，也可手动选择城市。计算设备时区 09:00–21:00 的平均气温，全天固定天气调整量；可手动重新计算。位置及预报保存在设备及备份中，不在后台追踪位置。本 PWA 的步数需手动输入。天气数据采用 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>。</p><h3>计算</h3><p>计算沿用原版 FitCat 的通用公式，仅供参考，不构成医疗建议。</p><h3>开源工具</h3><p>Chart.js、ZXing、QuaggaJS、MediaPipe Hands 和 Firebase。食物数据来自 Open Food Facts。</p><p class="version">FitCat 3.18.0</p>` : `
    <p>FitCat tracks food, water, activity and weight changes.</p><h3>Your data</h3><p>Your profile, photo and diary are stored in this device’s browser. For the friends feature, your name, daily targets, today’s foods and water are synced to Firebase and can be viewed using your ID. Food search and barcode lookup use Open Food Facts.</p><p>Export and restore your data in Settings.</p><h3>Weather</h3><p>Location access is requested only from the location button. Coordinates rounded to two decimals are sent to <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>; you can choose a city instead. The 09:00–21:00 forecast average uses the device timezone. The adjustment stays fixed for the day and can be recalculated manually. Your saved place and forecast are stored on-device and included in backups. No background location tracking. Steps are entered manually in this PWA. Weather data: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.</p><h3>Calculations</h3><p>Calculations retain the general formulas from the original FitCat source. They are informational and do not constitute medical advice.</p><h3>Open-source libraries</h3><p>Chart.js (MIT), ZXing (Apache 2.0), QuaggaJS (MIT), MediaPipe Hands (Apache 2.0) and Firebase. Product data: <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a>.</p><p class="version">FitCat 3.18.0</p>`;
}

export function initPreferences() {
  initWeather();
  document.addEventListener('fitcat:screen', event => {
    if (event.detail !== 'settingsPage') return;
    $('settingsTitle').focus({ preventScroll: true });
    $('settingsPage').querySelectorAll('.settings-layout > *').forEach((card, index) => enter(card, { y: 8, delay: index * 30 }));
  });
  $('hapticsToggle').addEventListener('change', event => { state.preferences.hapticsEnabled = event.target.checked; changed(); if (event.target.checked) haptic(); });
  onAction('testHaptics', () => { if (!haptic()) toast(t('haptics_unavailable')); });
  const setLanguage = value => {
    state.preferences.lang = value; changed();
    document.dispatchEvent(new Event('fitcat:language'));
  };
  onAction('setSetupLanguage', button => setLanguage(button.dataset.value)); onAction('setSettingsLanguage', button => setLanguage(button.dataset.value));
  const languages = ['ru', 'en', 'cn'];
  initSelectionLens($('settingsLanguageControl'), { padding: 3, gap: 3,
    getIndex: () => languages.indexOf(state.preferences.lang),
    onSelect: index => { haptic(); setLanguage(languages[index]); },
    isEnabled: () => document.body.dataset.screen === 'settingsPage',
  });
  onAction('openSmartWater', () => { renderPreferences(); openDialog('smartWaterModal'); void ensureDailyWeather(); });
  const setSmartWater = enabled => {
    if (!requirePro('smart-water')) { renderPreferences(); return; }
    state.preferences.smartWaterEnabled = enabled;
    if (!enabled) stopWeatherRequest();
    changed();
  };
  onAction('toggleSmartWaterConditions', () => setSmartWater(!state.preferences.smartWaterEnabled));
  onAction('closeSmartWater', () => closeDialog('smartWaterModal'));
  onAction('openSmartSearch', () => { renderPreferences(); openDialog('smartSearchModal'); });
  onAction('closeSmartSearch', () => closeDialog('smartSearchModal'));
  onAction('openAbout', () => { renderAbout(); openDialog('aboutModal'); });
  onAction('closeAbout', () => closeDialog('aboutModal'));
  onAction('selectDailyActivity', button => {
    const value = Number(button.dataset.activity); if (!ACTIVITY_LEVELS.includes(value)) return;
    if (state.preferences.dailyActivity === value) return;
    state.preferences.dailyActivity = value; changed();
  });
  onAction('openWorkout', openWorkout);
  onAction('selectWorkoutIntensity', button => {
    if (!state.preferences.workoutEnabled || !Object.hasOwn(WORKOUT_CALORIES, button.dataset.value)) return;
    state.preferences.workoutIntensity = button.dataset.value; changed();
  });
  $('activityWorkoutToggle').addEventListener('change', event => {
    state.preferences.workoutEnabled = event.target.checked; changed();
    if (state.preferences.workoutEnabled) openWorkout();
  });
  for (const [identifier, key] of [['smartWaterToggle','smartWaterEnabled'], ['smartSearchToggle','smartSearchEnabled'], ['workoutToggle','workoutEnabled']]) {
    $(identifier).addEventListener('change', event => {
      if (key === 'smartWaterEnabled') { setSmartWater(event.target.checked); return; }
      state.preferences[key] = event.target.checked;
      changed();
    });
  }
  for (const [identifier, key] of [['tempSlider','currentTemp'], ['stepsSlider','currentSteps'], ['resultsSlider','smartSearchResults']]) {
    $(identifier).addEventListener('input', event => {
      if (key !== 'smartSearchResults' && !requirePro('smart-water')) { renderPreferences(); return; }
      if (key === 'currentTemp') { useManualTemperature(event.target.value); return; }
      state.preferences[key] = Number(event.target.value); changed();
    });
  }
}
