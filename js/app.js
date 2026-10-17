import { state, loadState, rollDay, updateStreak, persist } from './core/store.js';
import { translate } from './core/i18n.js';
import { $, initActions } from './ui/components.js';
import { initNavigation, showScreen, updateHeading, activeTab } from './ui/navigation.js';
import { initDiary, renderSummary, renderFoods, renderTemplates } from './features/diary.js';
import { initProfile, renderIdentity } from './features/profile.js';
import { initPreferences, renderPreferences } from './features/preferences.js';
import { initProducts, renderProducts } from './features/products.js';
import { initAnalytics, renderAnalytics, renderCharts } from './features/analytics.js';
import { initFriends, queuePublish, loadFriends } from './services/friends.js';
import { initGestures } from './features/gestures.js';
import { initPWA } from './ui/pwa.js';

function render() {
  renderPreferences(); renderIdentity(); renderTemplates();
  if (state.profile) { renderSummary(); renderFoods(); renderAnalytics(); if (activeTab === 2) renderCharts(); }
}

function checkDay() {
  if (rollDay()) { updateStreak(); render(); queuePublish(); }
  updateHeading();
}

function start() {
  loadState();
  rollDay(); updateStreak();
  initActions(); initNavigation(); initDiary(); initProfile(); initPreferences();
  initProducts(); initAnalytics(); initFriends(); initGestures();
  translate(); render(); updateHeading();
  showScreen(state.profile ? 'mainPage' : 'setupPage');
  document.addEventListener('fitcat:change', () => { render(); queuePublish(); });
  document.addEventListener('fitcat:language', () => {
    translate(); render(); updateHeading(); renderProducts();
    if (activeTab === 3) loadFriends();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  setInterval(checkDay, 60000);
  window.addEventListener('pagehide', () => { try { rollDay(); persist({ nutrition: Boolean(state.profile) }); } catch { /* Storage may be unavailable during page shutdown. */ } });
  queuePublish(); initPWA();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
