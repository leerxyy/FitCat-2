import { t, locale } from '../core/i18n.js';
import { $, onAction } from './components.js';
import { switchViews, enter, MOTION } from './motion.js';
import { initNavLens } from './nav-lens.js';
import { resetSelectionLenses } from './selection-lens.js';
import { haptic } from './haptics.js';

const tabs = ['today', 'activity', 'analytics', 'friends'];
const titles = ['tab_today', 'tab_activity', 'analytics', 'friends_title'];
const subtitles = ['', 'activity_subtitle', 'analytics_subtitle', 'friends_subtitle'];
export let activeTab = 0;
let start = null;

export function resetNavigationGestures() { start = null; resetSelectionLenses(); }

export function showTab(tab) {
  const index = typeof tab === 'number' ? Math.max(0, Math.min(3, tab)) : tabs.indexOf(tab);
  if (index < 0) return;
  const direction = index >= activeTab ? 1 : -1;
  const didChange = index !== activeTab;
  if (didChange) { const scroller = $('appScroller'); if (scroller) scroller.scrollTop = 0; }
  activeTab = index;
  window.currentPage = index;
  switchViews([...document.querySelectorAll('[data-main-view]')], index, direction);
  const nav = $('bottomNav'); nav.style.setProperty('--active-index', index);
  nav.querySelectorAll('[data-tab]').forEach((button, i) => {
    button.classList.toggle('is-active', i === index);
    if (i === index) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  updateHeading();
  if (didChange) enter($('pageTitle').parentElement, { y: 4, duration: MOTION.screen });
  document.dispatchEvent(new CustomEvent('fitcat:tab', { detail: tabs[index] }));
}

export function updateHeading() {
  $('pageTitle').textContent = t(titles[activeTab]);
  const date = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('pageSubtitle').textContent = activeTab === 0 ? date[0].toUpperCase() + date.slice(1) : t(subtitles[activeTab]);
}

export function showScreen(id, { x = 0, y = 10, duration = MOTION.panel } = {}) {
  const previous = document.body.dataset.screen;
  for (const screen of document.querySelectorAll('[data-screen-view]')) screen.hidden = screen.id !== id;
  document.body.dataset.screen = id;
  $('bottomNav').hidden = id !== 'mainPage';
  $('navDock').hidden = id !== 'mainPage';
  document.dispatchEvent(new CustomEvent('fitcat:screen', { detail: id }));
  const scroller = $('appScroller'); if (scroller) scroller.scrollTop = 0;
  if (previous !== id) enter($(id), { x, y, duration });
}

export function initNavigation() {
  onAction('tab', button => showTab(button.dataset.tab));
  onAction('screen', button => showScreen(button.dataset.screen));
  initNavLens($('bottomNav'), { getIndex: () => activeTab, onSelect: index => { haptic(); showTab(index); } });
  $('swipeContainer').addEventListener('touchstart', event => {
    start = null;
    if (event.touches?.length !== 1 || document.querySelector('dialog[open]')) return;
    if (event.target.closest('button, input, select, textarea, canvas, summary, [role="slider"], [data-no-main-swipe]')) return;
    const touch = event.changedTouches[0]; start = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  $('swipeContainer').addEventListener('touchend', event => {
    if (!start || document.querySelector('dialog[open]')) { start = null; return; }
    if (event.touches?.length) { start = null; return; }
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start.id);
    if (!touch) { start = null; return; }
    const dx = touch.clientX - start.x; const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) showTab(activeTab + (dx < 0 ? 1 : -1));
    start = null;
  }, { passive: true });
  $('swipeContainer').addEventListener('touchcancel', resetNavigationGestures, { passive: true });
  showTab(0);
}
