import { state, proAccess } from '../core/store.js';
import { bmi, bmiCategory, clamp, localDate } from '../core/math.js';
import { t, locale, number } from '../core/i18n.js';
import { loadScript } from '../core/loader.js';
import { $, icon, escapeHTML, onAction, changed, confirmAction, promptValue, reducedMotion } from '../ui/components.js';
import { activeTab } from '../ui/navigation.js';
import { revealRegion } from '../ui/motion.js';
import { requirePro } from '../ui/premium.js';

let weightChart;
let nutritionChart;
let nutritionMetric = 'kcal';
let drawVersion = 0;

function formatDate(date) {
  const parsed = new Date(date + 'T12:00:00');
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(parsed);
}

export function renderAnalytics() {
  if (!state.profile) return;
  if (!proAccess()) nutritionMetric = 'kcal';
  document.querySelectorAll('[data-nutrition]').forEach(button => {
    button.classList.toggle('active', button.dataset.nutrition === nutritionMetric);
    button.setAttribute('aria-pressed', String(button.dataset.nutrition === nutritionMetric));
  });
  const sorted = [...state.weight].sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0]?.weight ?? state.profile.startWeight ?? state.profile.weight;
  const current = sorted.at(-1)?.weight ?? state.profile.weight;
  const goal = state.profile.targetWeight || state.profile.startWeight * .9;
  $('startWeightStat').textContent = `${number(start, 1)} ${t('kg')}`;
  $('currentWeightStat').textContent = `${number(current, 1)} ${t('kg')}`;
  const change = current - start;
  $('weightChangeStat').textContent = `${change > 0 ? '+' : ''}${number(change, 1)} ${t('kg')}`;
  $('toGoalStat').textContent = `${number(Math.abs(current - goal), 1)} ${t('kg')}`;
  const bmiValue = bmi(state.profile);
  $('bmiValue').textContent = number(bmiValue, 1);
  $('bmiCategory').textContent = t(bmiCategory(bmiValue));
  $('bmiMarker').style.left = `${clamp((bmiValue - 16) / 24) * 100}%`;
  $('bmiTooltip').textContent = t(bmiCategory(bmiValue));
  $('weightHistoryList').innerHTML = sorted.length ? sorted.reverse().map(entry => `<div class="history-item"><span>${escapeHTML(formatDate(entry.date))}</span><strong>${number(entry.weight, 1)} ${t('kg')}</strong><button type="button" class="icon-button close-button" data-action="deleteWeightEntry" data-value="${escapeHTML(entry.date)}" aria-label="${escapeHTML(t('delete') + ': ' + entry.date)}">${icon('x')}</button></div>`).join('') : emptyHistory();
  const showPastMacros = proAccess();
  $('nutritionHistoryList').innerHTML = state.nutrition.length ? [...state.nutrition].sort((a, b) => b.date.localeCompare(a.date)).map(entry => {
    const details = showPastMacros || entry.date === localDate()
      ? `<span class="muted">${t('protein_short')} ${number(entry.protein)} · ${t('fat_short')} ${number(entry.fat)} · ${t('carbs_short')} ${number(entry.carbs)}</span>`
      : `<button type="button" class="history-macro-lock" data-action="openMacroHistory" aria-label="${escapeHTML(t('pro_open_macros') + '. ' + t('pro_required'))}">${icon('lock')}<span>${escapeHTML(t('pro_macro_locked'))}</span></button>`;
    return `<div class="history-item"><span>${escapeHTML(formatDate(entry.date))}</span><strong class="nutrition-history-value">${number(entry.kcal)} ${t('kcal')}<br>${details}</strong><button type="button" class="icon-button close-button" data-action="deleteNutritionEntry" data-value="${escapeHTML(entry.date)}" aria-label="${escapeHTML(t('delete') + ': ' + entry.date)}">${icon('x')}</button></div>`;
  }).join('') : emptyHistory();
}

function emptyHistory() {
  return `<div class="empty-state"><strong>${t('no_history')}</strong><p>${t('no_history_hint')}</p></div>`;
}

function chartOptions() {
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: reducedMotion() ? 0 : 760, easing: 'easeOutCubic' },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#243342', padding: 10, cornerRadius: 9, displayColors: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#98A6B7', maxTicksLimit: 5, maxRotation: 0, font: { size: 10 } }, border: { display: false } },
      y: { grid: { color: 'rgba(177,198,221,.07)' }, ticks: { color: '#98A6B7', maxTicksLimit: 5, font: { size: 10 } }, border: { display: false } },
    },
  };
}

function setChartStatus(name, message, retry = false) {
  const status = $(name + 'ChartStatus');
  $(name + 'Chart').parentElement.hidden = Boolean(message);
  status.hidden = !message;
  status.innerHTML = message ? `${escapeHTML(message)}${retry ? `<button type="button" data-action="retryCharts">${t('retry')}</button>` : ''}` : '';
}

export async function renderCharts() {
  if (activeTab !== 2 || !state.profile) return;
  if (!proAccess()) nutritionMetric = 'kcal';
  const version = ++drawVersion;
  if (!state.weight.length) { weightChart?.destroy(); weightChart = null; setChartStatus('weight', t('no_history_hint')); }
  if (!state.nutrition.length) { nutritionChart?.destroy(); nutritionChart = null; setChartStatus('nutrition', t('no_history_hint')); }
  if (!state.weight.length && !state.nutrition.length) return;
  let Chart;
  try { Chart = await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', 'Chart'); }
  catch {
    if (version !== drawVersion) return;
    if (state.weight.length) setChartStatus('weight', t('network_error'), true);
    if (state.nutrition.length) setChartStatus('nutrition', t('network_error'), true);
    return;
  }
  if (version !== drawVersion || activeTab !== 2) return;
  if (!proAccess()) nutritionMetric = 'kcal';
  if (state.weight.length) {
    weightChart?.destroy(); setChartStatus('weight', '');
    const entries = [...state.weight].sort((a, b) => a.date.localeCompare(b.date));
    const context = $('weightChart').getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 220); gradient.addColorStop(0, 'rgba(22,207,243,.20)'); gradient.addColorStop(1, 'rgba(22,207,243,0)');
    weightChart = new Chart(context, {
      type: 'line', data: { labels: entries.map(entry => formatDate(entry.date)), datasets: [
        { label: t('weight'), data: entries.map(entry => entry.weight), borderColor: '#16CFF3', borderWidth: 2, backgroundColor: gradient, fill: true, tension: .35, pointRadius: entries.length > 20 ? 0 : 3, pointBackgroundColor: '#16CFF3', pointBorderWidth: 0 },
        { label: t('target'), data: entries.map(() => state.profile.targetWeight || state.profile.startWeight * .9), borderColor: '#8494A8', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false },
      ] }, options: chartOptions(),
    });
  }
  if (state.nutrition.length) {
    nutritionChart?.destroy(); setChartStatus('nutrition', '');
    const entries = [...state.nutrition].sort((a, b) => a.date.localeCompare(b.date));
    const options = chartOptions(); options.scales.y.beginAtZero = true;
    nutritionChart = new Chart($('nutritionChart').getContext('2d'), {
      type: 'bar', data: { labels: entries.map(entry => formatDate(entry.date)), datasets: [{ label: t(nutritionMetric === 'kcal' ? 'calories' : nutritionMetric), data: entries.map(entry => entry[nutritionMetric] || 0), backgroundColor: 'rgba(22,207,243,.55)', hoverBackgroundColor: '#16CFF3', borderRadius: 5, maxBarThickness: 26 }] }, options,
    });
  }
}

export function initAnalytics() {
  $('weightDate').value = localDate();
  onAction('setWeightGoal', async () => {
    const result = await promptValue(t('enter_goal'), state.profile.targetWeight || '', 'number');
    if (result == null || !Number.isFinite(Number(result)) || Number(result) < 30 || Number(result) > 500) return;
    state.profile.targetWeight = Number(result); changed();
  });
  const addWeight = async () => {
    const weight = Number($('newWeight').value); const date = $('weightDate').value || localDate();
    if (!Number.isFinite(weight) || weight < 30 || weight > 500) { $('newWeight').reportValidity(); return; }
    const index = state.weight.findIndex(entry => entry.date === date);
    if (index >= 0 && !(await confirmAction(t('overwrite_weight')))) return;
    if (index >= 0) state.weight[index] = { date, weight }; else state.weight.push({ date, weight });
    changed(); $('newWeight').value = '';
  };
  onAction('addWeightEntry', addWeight);
  $('newWeight').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addWeight(); } });
  onAction('deleteWeightEntry', async button => {
    if (!(await confirmAction(t('delete_record')))) return;
    state.weight = state.weight.filter(entry => entry.date !== button.dataset.value); changed();
  });
  onAction('deleteNutritionEntry', async button => {
    if (!(await confirmAction(t('delete_record')))) return;
    state.nutrition = state.nutrition.filter(entry => entry.date !== button.dataset.value); changed();
  });
  onAction('switchNutritionChart', button => {
    if (!['kcal', 'protein', 'fat', 'carbs'].includes(button.dataset.value)) return;
    if (button.dataset.value !== 'kcal' && !requirePro('macro-history')) return;
    nutritionMetric = button.dataset.value;
    document.querySelectorAll('[data-nutrition]').forEach(item => {
      item.classList.toggle('active', item.dataset.nutrition === nutritionMetric);
      item.setAttribute('aria-pressed', String(item.dataset.nutrition === nutritionMetric));
    });
    renderCharts();
  });
  onAction('openMacroHistory', () => {
    if (!requirePro('macro-history')) return;
    nutritionMetric = 'protein'; renderAnalytics(); renderCharts();
    $('nutritionChart').scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  });
  onAction('toggleJournal', button => {
    const name = button.dataset.value; const content = $(name + 'Content');
    const visible = button.getAttribute('aria-expanded') !== 'true'; revealRegion(content, visible);
    button.setAttribute('aria-expanded', String(visible)); localStorage.setItem(`journal_${name}_collapsed`, String(!visible));
  });
  for (const name of ['weightHistory', 'nutritionHistory']) {
    $(name + 'Content').hidden = localStorage.getItem(`journal_${name}_collapsed`) === 'true';
    const button = document.querySelector(`[data-action="toggleJournal"][data-value="${name}"]`); button?.setAttribute('aria-expanded', String(!$(name + 'Content').hidden));
  }
  onAction('showBMITooltip', () => { $('bmiCategory').textContent = t(bmiCategory(bmi(state.profile))); });
  onAction('retryCharts', renderCharts);
  document.addEventListener('fitcat:tab', event => { if (event.detail === 'analytics') renderCharts(); });
}
