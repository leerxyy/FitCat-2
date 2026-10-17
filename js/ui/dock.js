// Keep the dock in the app shell, independent from the scrolling content and
// iOS's sometimes stale fixed-bottom viewport after keyboard dismissal.
export function initDock() {
  const dock = document.getElementById('navDock');
  if (!dock) return;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let fullHeight = window.innerHeight || root.clientHeight || viewport?.height || 0;
  let width = window.innerWidth || root.clientWidth || viewport?.width || 0;
  let keyboard = false; let frame = 0; let settled = false;
  const timers = new Set();
  const editable = element => {
    if (element?.isContentEditable || element?.tagName === 'TEXTAREA') return true;
    return element?.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'hidden', 'color'].includes(element.type || element.getAttribute?.('type'));
  };
  const update = () => {
    frame = 0;
    // Pinch zoom keeps its own viewport and scroll position.
    if ((viewport?.scale || 1) > 1.05) return;
    const height = window.innerHeight || root.clientHeight || viewport?.height || fullHeight;
    const visible = viewport?.height || height;
    const currentWidth = window.innerWidth || root.clientWidth || viewport?.width || width;
    const focused = Boolean(editable(document.activeElement));
    if (Math.abs(currentWidth - width) > 80) {
      width = currentWidth; fullHeight = height; keyboard = false;
    }
    const lostHeight = fullHeight - Math.min(height, visible);
    if (focused && lostHeight > 120) keyboard = true;
    else if (lostHeight < 80 || (!focused && settled)) keyboard = false;
    // Freeze the shell during keyboard animation. Do not adopt a leftover
    // VisualViewport offset/height when the input has lost focus.
    if (!keyboard) fullHeight = height;
    if (fullHeight > 0) {
      root.style.setProperty('--app-height', `${fullHeight}px`);
      root.style.setProperty('--visible-height', `${keyboard ? visible : fullHeight}px`);
      root.style.setProperty('--visible-top', `${keyboard ? Math.max(0, viewport?.offsetTop || 0) : 0}px`);
    }
    dock.classList.toggle('keyboard-open', keyboard);
    if (!keyboard) {
      // Only undo browser root pan; preserve the app/dialog's scroll position.
      const scroller = document.scrollingElement || root;
      if (window.scrollX || window.scrollY || scroller.scrollTop || scroller.scrollLeft) {
        window.scrollTo(0, 0); scroller.scrollTop = 0; scroller.scrollLeft = 0;
      }
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const clearTimers = () => { for (const timer of timers) clearTimeout(timer); timers.clear(); };
  const restore = () => {
    clearTimers(); schedule();
    // Some WebKit releases deliver final keyboard metrics after focusout.
    for (const delay of [120, 650]) {
      const timer = setTimeout(() => { timers.delete(timer); if (delay === 650) settled = true; schedule(); }, delay);
      timers.add(timer);
    }
  };
  viewport?.addEventListener('resize', schedule, { passive: true });
  viewport?.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pageshow', restore);
  window.addEventListener('orientationchange', restore);
  document.addEventListener('focusin', () => {
    if (editable(document.activeElement)) { settled = false; clearTimers(); schedule(); }
    else restore();
  });
  document.addEventListener('focusout', restore);
  document.addEventListener('fitcat:dialogclose', restore);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) restore(); });
  window.addEventListener('pagehide', () => { clearTimers(); cancelAnimationFrame(frame); frame = 0; });
  update();
}
