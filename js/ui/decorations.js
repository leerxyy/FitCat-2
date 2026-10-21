// Visibility, not a perpetual animation loop, controls decorative work. The
// glass tint and blur are never touched by this controller.
const REGIONS = '.card, .sheet, .bottom-nav, .app-header, .appearance-preview, .appearance-effect-tile, .gesture-instruction, .gesture-shortcuts';
const DECORATIVE = /^(?:fitcat-choice-|fitcat-scanner-|fitcat-meal-|appearance-|glass-|progress-|button-sheen|developer-|gesture-demo-|plus-ribbon-)/;
let current;

export function initDecorationVisibility(doc = document, view = window) {
  current?.dispose();
  const regions = new Set(), inView = new WeakMap(), removers = [];
  const preference = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const origin = view.performance?.now?.() || 0, seed = Date.now() % 120000;
  let disposed = false, pending = false;
  const clock = () => seed + Math.max(0, (view.performance?.now?.() || 0) - origin);

  function resumePhase(node) {
    let animations;
    try { animations = node.getAnimations?.({ subtree: true }) || []; }
    catch { return; }
    const time = clock();
    for (const animation of animations) {
      if (!DECORATIVE.test(animation.animationName || '')) continue;
      try { animation.currentTime = time; } catch { /* Older WebKit keeps its native phase. */ }
    }
  }
  function sync() {
    if (disposed) return;
    const open = [...doc.querySelectorAll('dialog[open]')].at(-1);
    const enabled = !doc.hidden && !preference?.matches && doc.documentElement.dataset.lowDetail !== 'on';
    for (const node of regions) {
      const dialog = node.closest('dialog');
      const live = Boolean(enabled && inView.get(node) !== false && !node.closest('[hidden], [inert], .view-leaving, .stats-panel-leaving')
        && (open ? dialog === open : !dialog));
      const value = live ? 'true' : 'false';
      if (node.dataset.effectsLive === value) continue;
      node.dataset.effectsLive = value;
      if (live) resumePhase(node);
    }
  }
  const observer = view.IntersectionObserver ? new view.IntersectionObserver(entries => {
    for (const entry of entries) inView.set(entry.target, entry.isIntersecting);
    sync();
  }, { threshold: 0 }) : null;

  function register() {
    for (const node of doc.querySelectorAll(REGIONS)) {
      if (regions.has(node)) continue;
      regions.add(node);
      if (observer) { inView.set(node, false); observer.observe(node); }
    }
    for (const node of regions) if (!node.isConnected) { observer?.unobserve(node); regions.delete(node); }
  }
  function schedule() {
    if (pending || disposed) return;
    pending = true;
    queueMicrotask(() => { pending = false; if (!disposed) { register(); sync(); } });
  }
  function on(target, name, handler) {
    target?.addEventListener?.(name, handler);
    removers.push(() => target?.removeEventListener?.(name, handler));
  }
  // Sync immediately when a dialog opens; resume only after close has completed.
  for (const name of ['fitcat:dialogopen', 'fitcat:dialogclose', 'visibilitychange', 'fitcat:performance']) on(doc, name, sync);
  for (const name of ['fitcat:tab', 'fitcat:screen', 'fitcat:appearance-tab', 'fitcat:change', 'fitcat:appearance']) on(doc, name, schedule);
  on(preference, 'change', sync);
  on(view, 'pagehide', () => {
    for (const node of regions) node.dataset.effectsLive = 'false';
  });
  on(view, 'pageshow', schedule);
  if (!observer) on(doc, 'scroll', schedule);
  register(); sync();
  current = { sync, dispose() { disposed = true; observer?.disconnect(); for (const remove of removers) remove(); regions.clear(); } };
  return current;
}
