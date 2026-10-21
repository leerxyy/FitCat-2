import { state, proAccess } from '../core/store.js';
import { bmi, bmiCategory, localDate } from '../core/math.js';
import { t, locale, number } from '../core/i18n.js';
import { loadScript } from '../core/loader.js';
import { $, icon, escapeHTML, onAction, changed, confirmAction, promptValue, openDialog, closeDialog, afterDialogClose, toast, reducedMotion } from '../ui/components.js';
import { activeTab } from '../ui/navigation.js';
import { enter, play, cancelEntrance, visualState, tweenValue, captureLayout, animateList, MOTION } from '../ui/motion.js';
import { requirePro } from '../ui/premium.js';
import { initSelectionLens, syncSelectionLens } from '../ui/selection-lens.js';
import { haptic } from '../ui/haptics.js';
import { appearanceColor, effectiveAppearance } from '../core/appearance.js';
import { lowDetailMode } from '../ui/performance.js';

let weightChart;
let nutritionChart;
let statisticsView = 'weight';
let nutritionMetric = 'kcal';
let nutritionPeriod = '7';
let drawVersion = 0;
let finishPanelTransition;
let selectedRecord;
let deletingRecord = false;
let savingWeight = false;
let weightEntrySession = 0;
const views = ['weight', 'nutrition'];
const metrics = ['kcal', 'protein', 'fat', 'carbs'];
const dateFormats = new Map();
const historySignatures = new WeakMap();
const chartSignatures = new Map();

export function invalidateAnalyticsFormats() {
  dateFormats.clear(); historySignatures.delete($('weightHistoryList')); historySignatures.delete($('nutritionHistoryList'));
  chartSignatures.clear();
}

function replaceHistory(node, signature, build) {
  if (historySignatures.get(node) === signature) return;
  const snapshot = captureLayout(node);
  node.innerHTML = build();
  historySignatures.set(node, signature);
  animateList(node, snapshot);
}

function formatDate(date) {
  const parsed = new Date(date + 'T12:00:00');
  if (Number.isNaN(parsed.getTime())) return date;
  const withYear = parsed.getFullYear() !== new Date().getFullYear(), key = `${locale()}:${withYear}`;
  if (!dateFormats.has(key)) dateFormats.set(key, new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }));
  return dateFormats.get(key).format(parsed);
}

function dateLabel(date) {
  if (date === localDate()) return t('stats_today');
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  return date === localDate(yesterday) ? t('stats_yesterday') : formatDate(date);
}

function dateMarkup(date) {
  const label = dateLabel(date); const formatted = formatDate(date);
  return `<span class="stats-history-date"><strong>${escapeHTML(label)}</strong>${label !== formatted ? `<small>${escapeHTML(formatted)}</small>` : ''}</span>`;
}

function goalWeight() {
  return state.profile.targetWeight || (state.profile.startWeight || state.profile.weight) * .9;
}

function measurement(id, value, { unit = '', signed = false, digits = 1 } = {}) {
  const element = $(id); element.dataset.value = String(value);
  tweenValue(element, value, current => {
    element.textContent = `${signed && current > 0 ? '+' : ''}${number(current, digits)}${unit ? ' ' + unit : ''}`;
  });
}

function nutritionEntries() {
  const sorted = [...state.nutrition].sort((a, b) => a.date.localeCompare(b.date));
  if (nutritionPeriod === 'all') return sorted;
  const start = new Date(); start.setDate(start.getDate() - Number(nutritionPeriod) + 1);
  const first = localDate(start); const last = localDate();
  return sorted.filter(entry => entry.date >= first && entry.date <= last);
}

function hasNutritionData(entries) {
  return entries.some(entry => metrics.some(metric => Number(entry[metric]) > 0));
}

function recordMenu(kind, date) {
  return `<button type="button" class="icon-button stats-history-more" data-action="openStatsRecord" data-record-kind="${kind}" data-value="${escapeHTML(date)}" aria-haspopup="dialog" aria-controls="statsRecordModal" aria-label="${escapeHTML(t('stats_record_actions') + ': ' + formatDate(date))}">${icon('more')}</button>`;
}

function updateControls() {
  if (!proAccess()) nutritionMetric = 'kcal';
  document.querySelectorAll('[data-nutrition]').forEach(button => {
    button.classList.toggle('active', button.dataset.nutrition === nutritionMetric);
    button.setAttribute('aria-pressed', String(button.dataset.nutrition === nutritionMetric));
  });
  $('nutritionPeriod').value = nutritionPeriod;
  $('nutritionChartTitle').textContent = t('stats_chart_' + nutritionPeriod).replace('{metric}', t(nutritionMetric === 'kcal' ? 'calories' : nutritionMetric));
}

export function renderAnalytics() {
  if (!state.profile) return;
  updateControls();
  const sorted = [...state.weight].sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0]?.weight ?? state.profile.startWeight ?? state.profile.weight;
  const current = sorted.at(-1)?.weight ?? state.profile.weight;
  measurement('currentWeightStat', current);
  measurement('startWeightStat', start, { unit: t('kg') });
  measurement('weightChangeStat', current - start, { unit: t('kg'), signed: true });
  measurement('toGoalStat', Math.abs(current - goalWeight()), { unit: t('kg') });
  $('weightGoalValue').textContent = `${number(goalWeight(), 1)} ${t('kg')}`;
  const bmiValue = bmi({ ...state.profile, weight: current });
  measurement('bmiValue', bmiValue);
  $('bmiCategory').textContent = t(bmiCategory(bmiValue));
  $('bmiCategory').dataset.category = bmiCategory(bmiValue);

  const historyContext = `${locale()}:${localDate()}`;
  replaceHistory($('weightHistoryList'), historyContext + JSON.stringify(sorted), () => [...sorted].reverse().map(entry => `<div class="history-item stats-history-row" data-history-date="${escapeHTML(entry.date)}" data-motion-key="weight-${escapeHTML(entry.date)}">${dateMarkup(entry.date)}<strong class="stats-history-value">${number(entry.weight, 1)} ${t('kg')}</strong>${recordMenu('weight', entry.date)}</div>`).join(''));
  $('weightHistoryList').hidden = !sorted.length;
  if (!sorted.length) { weightChart?.destroy(); weightChart = null; setChartStatus('weight', 'empty'); }

  const showPastMacros = proAccess(); const entries = nutritionEntries();
  replaceHistory($('nutritionHistoryList'), historyContext + showPastMacros + JSON.stringify(entries), () => entries.length ? [...entries].reverse().map(entry => {
    const details = showPastMacros || entry.date === localDate()
      ? `<small>${hasNutritionData([entry]) ? `${t('protein_short')} ${number(entry.protein)} · ${t('fat_short')} ${number(entry.fat)} · ${t('carbs_short')} ${number(entry.carbs)}` : escapeHTML(t('stats_no_meals'))}</small>`
      : `<button type="button" class="history-macro-lock" data-action="openMacroHistory" aria-label="${escapeHTML(t('pro_open_macros') + '. ' + t('pro_required'))}">${icon('lock')}<span>${escapeHTML(t('pro_macro_locked'))}</span></button>`;
    return `<div class="history-item stats-history-row" data-history-date="${escapeHTML(entry.date)}" data-motion-key="nutrition-${escapeHTML(entry.date)}">${dateMarkup(entry.date)}<div class="stats-history-value"><strong>${number(entry.kcal)} ${t('kcal')}</strong>${details}</div>${recordMenu('nutrition', entry.date)}</div>`;
  }).join('') : `<p class="stats-history-empty">${t('stats_empty_history')}</p>`);
  if (!hasNutritionData(entries)) { nutritionChart?.destroy(); nutritionChart = null; setChartStatus('nutrition', 'empty'); }
}

function stopPanelTransition() {
  finishPanelTransition?.(); finishPanelTransition = null;
  views.forEach(name => cancelEntrance($(name + 'StatisticsPanel')));
}

function switchStatistics(name, { animate = true } = {}) {
  if (!views.includes(name)) return;
  const previous = statisticsView;
  const start = visualState($(previous + 'StatisticsPanel'), { opacity: 1, transform: 'translateX(0)' });
  const resume = !$(name + 'StatisticsPanel').hidden ? visualState($(name + 'StatisticsPanel'), { opacity: 1, transform: 'translateX(0)' }) : undefined;
  stopPanelTransition(); statisticsView = name;
  const incoming = $(name + 'StatisticsPanel');
  const outgoing = $(previous + 'StatisticsPanel');
  $('statisticsSwitch').style.setProperty('--statistics-index', views.indexOf(name));
  for (const view of views) {
    const chosen = view === name; const panel = $(view + 'StatisticsPanel');
    panel.hidden = !chosen; panel.inert = !chosen; panel.classList.toggle('active', chosen);
    if (chosen) panel.removeAttribute('aria-hidden'); else panel.setAttribute('aria-hidden', 'true');
    const button = $(`stats${view[0].toUpperCase() + view.slice(1)}Button`);
    button.classList.toggle('active', chosen); button.setAttribute('aria-selected', String(chosen));
    button.setAttribute('tabindex', chosen ? '0' : '-1');
  }
  syncSelectionLens($('statisticsSwitch'));
  if (previous !== name && animate && activeTab === 2 && !reducedMotion() && typeof incoming.animate === 'function') {
    const direction = name === 'nutrition' ? 1 : -1;
    const distance = (incoming.getBoundingClientRect?.().width || 390) + 24;
    outgoing.hidden = false; outgoing.classList.add('stats-panel-leaving');
    const leave = play(outgoing, [start, { transform: `translateX(${-direction * distance}px)` }], { duration: MOTION.screen });
    enter(incoming, { x: direction * distance, y: 0, duration: MOTION.screen, from: resume, fullDistance: true });
    const clean = () => { leave?.cancel(); outgoing.hidden = true; outgoing.classList.remove('stats-panel-leaving'); };
    finishPanelTransition = clean;
    if (leave) leave.finished.then(() => { if (finishPanelTransition === clean) { clean(); finishPanelTransition = null; } }, () => {});
    else { clean(); finishPanelTransition = null; }
  }
  renderCharts();
}

function chartOptions() {
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: reducedMotion() || lowDetailMode() ? 0 : MOTION.value, easing: 'easeOutCubic' },
    ...(lowDetailMode() ? { devicePixelRatio: Math.min(globalThis.devicePixelRatio || 1, 1.5) } : {}),
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#183348', padding: 11, cornerRadius: 11, displayColors: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9db9ce', maxTicksLimit: 5, maxRotation: 0, font: { size: 10 } }, border: { display: false } },
      y: { grid: { color: 'rgba(177,198,221,.08)' }, ticks: { color: '#9db9ce', maxTicksLimit: 5, font: { size: 10 } }, border: { display: false } },
    },
  };
}

function setChartStatus(name, status, retry = false) {
  const region = $(name + 'ChartStatus');
  $(name + 'ChartFrame').hidden = Boolean(status); region.hidden = !status;
  if (!status) { region.innerHTML = ''; return; }
  if (status !== 'empty') {
    region.innerHTML = `<p>${escapeHTML(status)}</p>${retry ? `<button type="button" class="text-button" data-action="retryCharts">${t('retry')}</button>` : ''}`;
    return;
  }
  const weight = name === 'weight';
  const outsidePeriod = !weight && !hasNutritionData(nutritionEntries()) && hasNutritionData(state.nutrition);
  const title = weight ? 'stats_empty_weight' : outsidePeriod ? 'stats_empty_period' : 'stats_empty_nutrition';
  const hint = weight ? 'stats_empty_weight_hint' : outsidePeriod ? 'stats_empty_period_hint' : 'stats_empty_nutrition_hint';
  region.innerHTML = `<span class="stats-empty-icon" aria-hidden="true">${icon(weight ? 'scale' : 'meal')}</span><h3>${t(title)}</h3><p>${t(hint)}</p>${!weight ? `<button type="button" class="btn-primary" data-action="openFood">${icon('plus')}<span>${t('add_food')}</span></button>` : ''}`;
}

export async function renderCharts() {
  const version = ++drawVersion;
  if (activeTab !== 2 || !state.profile || document.body.dataset.screen !== 'mainPage') return;
  updateControls();
  const name = statisticsView;
  const entries = name === 'weight' ? [...state.weight].sort((a, b) => a.date.localeCompare(b.date)) : nutritionEntries();
  const signature = JSON.stringify([entries, locale(), localDate(), nutritionMetric, goalWeight(), effectiveAppearance(state.appearance, proAccess()).accent, lowDetailMode()]);
  if ((name === 'weight' ? weightChart : nutritionChart) && chartSignatures.get(name) === signature) return;
  if (!entries.length || (name === 'nutrition' && !hasNutritionData(entries))) {
    if (name === 'weight') { weightChart?.destroy(); weightChart = null; }
    else { nutritionChart?.destroy(); nutritionChart = null; }
    setChartStatus(name, 'empty'); return;
  }
  if (!(name === 'weight' ? weightChart : nutritionChart)) setChartStatus(name, t('stats_loading_chart'));
  let Chart;
  try { Chart = await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', 'Chart'); }
  catch { if (version === drawVersion && activeTab === 2 && statisticsView === name) setChartStatus(name, t('network_error'), true); return; }
  if (version !== drawVersion || activeTab !== 2 || statisticsView !== name || document.body.dataset.screen !== 'mainPage') return;
  // Expiry can occur while the chart library is loading.
  updateControls(); setChartStatus(name, '');
  const chartAccent = effectiveAppearance(state.appearance, proAccess()).accent;
  if (name === 'weight') {
    weightChart?.destroy();
    const context = $('weightChart').getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 240); gradient.addColorStop(0, appearanceColor(chartAccent,.22)); gradient.addColorStop(1, appearanceColor(chartAccent,0));
    weightChart = new Chart(context, {
      type: 'line', data: { labels: entries.map(entry => formatDate(entry.date)), datasets: [
        { label: `${t('stats_weight')}, ${t('kg')}`, data: entries.map(entry => entry.weight), borderColor: appearanceColor(chartAccent), borderWidth: 2, backgroundColor: gradient, fill: true, tension: .35, pointRadius: entries.length > 20 ? 0 : 3, pointHitRadius: 18, pointBackgroundColor: appearanceColor(chartAccent), pointBorderWidth: 0 },
        { label: t('target'), data: entries.map(() => goalWeight()), borderColor: '#8494A8', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false },
      ] }, options: chartOptions(),
    });
  } else {
    nutritionChart?.destroy();
    const options = chartOptions(); options.scales.y.beginAtZero = true; options.scales.y.ticks.precision = 0;
    nutritionChart = new Chart($('nutritionChart').getContext('2d'), {
      type: 'bar', data: { labels: entries.map(entry => formatDate(entry.date)), datasets: [{ label: `${t(nutritionMetric === 'kcal' ? 'calories' : nutritionMetric)}, ${t(nutritionMetric === 'kcal' ? 'kcal' : 'g')}`, data: entries.map(entry => entry[nutritionMetric] || 0), backgroundColor: appearanceColor(chartAccent,.65), hoverBackgroundColor: appearanceColor(chartAccent), borderRadius: 6, maxBarThickness: 26 }] }, options,
    });
  }
  chartSignatures.set(name, signature);
}

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T12:00:00');
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === date;
}

export function initAnalytics() {
  document.addEventListener('fitcat:performance', () => { renderAnalytics(); renderCharts(); });
  $('weightDate').value = localDate();
  onAction('switchStatistics', button => switchStatistics(button.dataset.statistics));
  initSelectionLens($('statisticsSwitch'), { padding: 4,
    getIndex: () => views.indexOf(statisticsView),
    onSelect: index => { haptic(); switchStatistics(views[index]); },
    isEnabled: () => document.body.dataset.screen === 'mainPage' && activeTab === 2,
  });
  $('statisticsSwitch').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (views.indexOf(statisticsView) + (event.key === 'ArrowRight' ? 1 : -1) + 2) % 2;
    switchStatistics(views[index]); $(`stats${index ? 'Nutrition' : 'Weight'}Button`).focus({ preventScroll: true });
  });
  onAction('setWeightGoal', async () => {
    const result = await promptValue(t('enter_goal'), state.profile.targetWeight || '', 'number');
    if (result == null || !Number.isFinite(Number(result)) || Number(result) < 30 || Number(result) > 500) return;
    state.profile.targetWeight = Number(result); changed();
  });
  onAction('openWeightEntry', () => {
    if ($('weightEntryModal').open) return;
    weightEntrySession++; $('newWeight').value = ''; $('weightDate').value = localDate();
    $('newWeight').placeholder = number([...state.weight].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weight ?? state.profile.weight, 1);
    openDialog('weightEntryModal');
  });
  $('weightEntryModal').addEventListener('close', () => { weightEntrySession++; });
  $('weightEntryForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (savingWeight || !$('weightEntryModal').open) return;
    const weight = Number($('newWeight').value); const date = $('weightDate').value;
    if (!Number.isFinite(weight) || weight < 30 || weight > 500 || !validDate(date) || !$('weightEntryForm').reportValidity()) return;
    const session = weightEntrySession; savingWeight = true; $('saveWeightEntry').disabled = true;
    try {
      if (state.weight.some(entry => entry.date === date) && !(await confirmAction(t('overwrite_weight')))) return;
      if (session !== weightEntrySession || !$('weightEntryModal').open) return;
      // Find by date after confirmation, since a restore or another edit can change ordering.
      const index = state.weight.findIndex(entry => entry.date === date);
      if (index >= 0) state.weight[index] = { date, weight }; else state.weight.push({ date, weight });
      changed({ afterDialog: 'weightEntryModal' }); closeDialog('weightEntryModal'); toast(t('saved'));
    } finally { savingWeight = false; $('saveWeightEntry').disabled = false; }
  });
  onAction('openStatsRecord', button => {
    const kind = button.dataset.recordKind; const date = button.dataset.value;
    if (!['weight', 'nutrition'].includes(kind) || !state[kind].some(entry => entry.date === date) || deletingRecord) return;
    selectedRecord = { kind, date };
    const entry = state[kind].find(row => row.date === date);
    $('statsRecordTitle').dataset.i18n = kind === 'weight' ? 'stats_weight_history' : 'stats_nutrition_history';
    $('statsRecordTitle').textContent = t($('statsRecordTitle').dataset.i18n);
    $('statsRecordDescription').textContent = `${formatDate(date)} · ${number(kind === 'weight' ? entry.weight : entry.kcal, kind === 'weight' ? 1 : 0)} ${t(kind === 'weight' ? 'kg' : 'kcal')}`;
    openDialog('statsRecordModal');
  });
  $('statsRecordModal').addEventListener('close', () => { selectedRecord = null; });
  onAction('deleteStatsRecord', async () => {
    if (!selectedRecord || deletingRecord || !$('statsRecordModal').open) return;
    const { kind, date } = selectedRecord; deletingRecord = true;
    try {
      await new Promise(resolve => { afterDialogClose('statsRecordModal', resolve); closeDialog('statsRecordModal'); });
      if (!(await confirmAction(t('delete_record')))) return;
      state[kind] = state[kind].filter(entry => entry.date !== date); changed(); toast(t('stats_record_deleted'));
    } finally { deletingRecord = false; }
  });
  onAction('switchNutritionChart', button => {
    if (!metrics.includes(button.dataset.value)) return;
    if (button.dataset.value !== 'kcal' && !requirePro('macro-history')) return;
    nutritionMetric = button.dataset.value; updateControls();
    if (statisticsView !== 'nutrition') switchStatistics('nutrition'); else renderCharts();
  });
  $('nutritionPeriod').addEventListener('change', () => {
    if (!['7', '30', 'all'].includes($('nutritionPeriod').value)) { $('nutritionPeriod').value = nutritionPeriod; return; }
    nutritionPeriod = $('nutritionPeriod').value; renderAnalytics(); renderCharts();
    enter($('nutritionChartStatus').hidden ? $('nutritionChartFrame') : $('nutritionChartStatus'), { y: 7 });
  });
  onAction('openMacroHistory', () => {
    if (!requirePro('macro-history')) return;
    nutritionMetric = 'protein'; updateControls();
    if (statisticsView !== 'nutrition') switchStatistics('nutrition'); else renderCharts();
  });
  onAction('retryCharts', renderCharts);
  document.addEventListener('fitcat:tab', event => {
    if (event.detail === 'analytics') renderCharts();
    else { drawVersion++; stopPanelTransition(); }
  });
  document.addEventListener('fitcat:screen', event => {
    if (event.detail === 'mainPage' && activeTab === 2) renderCharts();
    else { drawVersion++; stopPanelTransition(); }
  });
}
