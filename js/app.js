import { state, loadState, rollDay, updateStreak, persist, proAccess } from './core/store.js';
import { translate } from './core/i18n.js';
import { $, initActions } from './ui/components.js';
import { initNavigation, showScreen, updateHeading, activeTab, resetNavigationGestures } from './ui/navigation.js';
import { initDiary, renderSummary, renderFoods, renderTemplates } from './features/diary.js';
import { initProfile, renderIdentity, flushProfileFeedback } from './features/profile.js';
import { initPreferences, renderPreferences } from './features/preferences.js';
import { initProducts, renderProducts } from './features/products.js';
import { initAnalytics, renderAnalytics, renderCharts } from './features/analytics.js';
import { initFriends, queuePublish, loadFriends } from './services/friends.js';
import { initGestures, stopGestures } from './features/gestures.js';
import { initPWA } from './ui/pwa.js';
import { initAmbient } from './ui/ambient.js';
import { initDock } from './ui/dock.js';
import { initOrientation } from './ui/orientation.js';
import { initHaptics } from './ui/haptics.js';
import { initSubscription, renderSubscription } from './features/subscription.js';
import { initWallet } from './features/wallet.js';
import { ensureDailyWeather } from './features/weather.js';
import { initSurfaces } from './ui/surfaces.js';
import { stopWeatherRequest } from './features/weather.js';
import { batchMotion } from './ui/motion.js';
import { initAppearance, renderAppearance } from './features/appearance.js';
import { effectiveAppearance } from './core/appearance.js';

let previousAccess;
let pendingRender;
function checkAccess() {
  const active = proAccess();
  if (active === previousAccess) return;
  previousAccess = active;
  if (!active) {
    stopWeatherRequest();
    stopGestures();
  }
  render(); queuePublish(); void ensureDailyWeather();
}

function render() {
  pendingRender?.(); pendingRender = null;
  const scroller = $('appScroller'); const top = scroller?.scrollTop;
  batchMotion(() => {
    renderAppearance();
    renderPreferences(); renderIdentity(); renderTemplates(); renderSubscription();
    if (state.profile) { renderSummary(); renderFoods(); renderAnalytics(); if (activeTab === 2) renderCharts(); }
  });
  if (scroller && Number.isFinite(top)) scroller.scrollTop = top;
}

function renderChange(event) {
  pendingRender?.(); pendingRender = null;
  const dialog = event.detail?.afterDialog && $(event.detail.afterDialog);
  if (dialog?.open) {
    const done = () => render();
    dialog.addEventListener('close', done, { once: true });
    pendingRender = () => dialog.removeEventListener('close', done);
  } else render();
  queuePublish(); void ensureDailyWeather();
}

function checkDay() {
  checkAccess();
  if (rollDay()) { updateStreak(); render(); queuePublish(); }
  updateHeading();
  void ensureDailyWeather();
}

function start() {
  loadState();
  previousAccess = proAccess();
  rollDay(); updateStreak();
  initActions(); const viewportReady = initDock(); initOrientation(); initHaptics(); initAppearance(); initAmbient(effectiveAppearance(state.appearance, proAccess())); initSurfaces(); initNavigation(); initDiary(); initProfile(); initPreferences();
  initProducts(); initAnalytics(); initFriends(); initGestures(); initWallet(); initSubscription();
  translate(); render(); updateHeading();
  showScreen(state.profile ? 'mainPage' : 'setupPage');
  document.addEventListener('fitcat:change', renderChange);
  document.addEventListener('fitcat:subscription', checkAccess);
  document.addEventListener('fitcat:wallet', checkAccess);
  document.addEventListener('fitcat:language', () => {
    translate(); render(); updateHeading(); renderProducts();
    if (activeTab === 3) loadFriends();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { resetNavigationGestures(); flushProfileFeedback(); } else checkDay(); });
  setInterval(checkDay, 60000);
  window.addEventListener('pagehide', () => { resetNavigationGestures(); try { flushProfileFeedback(); rollDay(); persist({ nutrition: Boolean(state.profile) }); } catch { /* Storage may be unavailable during page shutdown. */ } });
  queuePublish(); initPWA();
  void ensureDailyWeather();
  Promise.resolve(viewportReady).then(() => document.dispatchEvent(new Event('fitcat:ready')));
}

function boot() {
  try { start(); }
  catch (error) { document.dispatchEvent(new Event('fitcat:startup-error')); throw error; }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
