import { phone, landscape, standalone } from './viewport.js';

export function initOrientation() {
  const guard = document.getElementById('orientationGuard');
  if (!guard || !phone()) return;
  const update = () => {
    if (document.hidden) return;
    if (landscape()) {
      document.activeElement?.blur?.();
      if (!guard.open) guard.showModal?.();
    } else if (guard.open) guard.close();
  };
  const lock = () => {
    if (!standalone() || typeof window.screen?.orientation?.lock !== 'function') return;
    // Permission/platform failures use the portrait guard. Do not force full screen.
    try { Promise.resolve(window.screen.orientation.lock('portrait')).catch(() => {}); } catch { /* Unsupported. */ }
  };
  guard.addEventListener('cancel', event => event.preventDefault());
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('orientationchange', update);
  window.screen?.orientation?.addEventListener?.('change', update);
  window.addEventListener('pageshow', () => { lock(); update(); });
  document.addEventListener('fitcat:viewport', update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lock(); update(); } });
  document.addEventListener('pointerdown', lock, { once: true });
  lock(); update();
}
