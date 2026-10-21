// CSS animations keep one monotonic phase across header/profile/preview.
// Showing a previously display:none screen must not replay its first frame.
export function createCosmeticTimeline({ now = () => performance.now(), seed = Date.now() % 120000 } = {}) {
  const origin = now();
  const roots = new WeakMap();
  let elapsed = Math.max(0, seed);
  function phase() {
    elapsed = Math.max(elapsed, Math.max(0, seed) + Math.max(0, now() - origin));
    return elapsed;
  }
  function synchronize(node) {
    if (typeof node?.getAnimations !== 'function') return 0;
    const time = phase(); let count = 0;
    // One style flush when a visible cosmetic changes or resumes, never per frame.
    let animations;
    try { animations = node.getAnimations({ subtree: true }); }
    catch { return 0; }
    for (const animation of animations) {
      if (!animation.animationName?.startsWith('profile-')) continue;
      try { animation.currentTime = time; count++; }
      catch { /* Native infinite CSS animation remains available on older engines. */ }
    }
    return count;
  }
  function setLive(node, active, variant = '') {
    if (!node) return;
    const before = roots.get(node);
    if (node.dataset.live !== String(active)) node.dataset.live = String(active);
    roots.set(node, { active, variant });
    if (active && (!before?.active || before.variant !== variant)) synchronize(node);
  }
  return { phase, synchronize, setLive };
}
export const cosmeticTimeline = createCosmeticTimeline();
