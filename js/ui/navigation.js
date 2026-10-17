import { t, locale } from '../core/i18n.js';
import { $, onAction } from './components.js';

const tabs = ['today', 'activity', 'analytics', 'friends'];
const titles = ['tab_today', 'tab_activity', 'analytics', 'friends_title'];
const subtitles = ['', 'activity_subtitle', 'analytics_subtitle', 'friends_subtitle'];
export let activeTab = 0;

export function showTab(tab) {
  const index = typeof tab === 'number' ? Math.max(0, Math.min(3, tab)) : tabs.indexOf(tab);
  if (index < 0) return;
  activeTab = index;
  window.currentPage = index;
  document.querySelectorAll('[data-main-view]').forEach((view, i) => { view.hidden = i !== index; view.classList.toggle('active', i === index); });
  const nav = $('bottomNav'); nav.style.setProperty('--active-index', index);
  nav.querySelectorAll('[data-tab]').forEach((button, i) => {
    button.classList.toggle('is-active', i === index);
    if (i === index) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  updateHeading();
  document.dispatchEvent(new CustomEvent('fitcat:tab', { detail: tabs[index] }));
}

export function updateHeading() {
  $('pageTitle').textContent = t(titles[activeTab]);
  const date = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('pageSubtitle').textContent = activeTab === 0 ? date[0].toUpperCase() + date.slice(1) : t(subtitles[activeTab]);
}

export function showScreen(id) {
  for (const screen of document.querySelectorAll('[data-screen-view]')) screen.hidden = screen.id !== id;
  document.body.dataset.screen = id;
  $('bottomNav').hidden = id !== 'mainPage';
  document.dispatchEvent(new CustomEvent('fitcat:screen', { detail: id }));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function initNavigation() {
  onAction('tab', button => showTab(button.dataset.tab));
  onAction('screen', button => showScreen(button.dataset.screen));
  let start = null;
  $('swipeContainer').addEventListener('touchstart', event => {
    if (event.target.closest('button, input, select, textarea, canvas, summary, [role="slider"]')) return;
    const touch = event.changedTouches[0]; start = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  $('swipeContainer').addEventListener('touchend', event => {
    if (!start || document.querySelector('dialog[open]')) { start = null; return; }
    const touch = event.changedTouches[0]; const dx = touch.clientX - start.x; const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) showTab(activeTab + (dx < 0 ? 1 : -1));
    start = null;
  }, { passive: true });
  showTab(0);
}
