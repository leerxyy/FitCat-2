export function standalone(win = window, nav = navigator) {
  return nav.standalone === true || Boolean(win.matchMedia?.('(display-mode: standalone)').matches);
}

export function phone(win = window, nav = navigator) {
  if (/iPhone|iPod|Android.*Mobile/i.test(nav.userAgent || '')) return true;
  const shortSide = Math.min(win.screen?.width || Infinity, win.screen?.height || Infinity);
  return shortSide <= 600 && Boolean(win.matchMedia?.('(pointer: coarse)').matches);
}

// The CSS probe is independent of the shell's explicit pixel height. On an
// installed, full-width iPhone app the screen extent also survives a stale
// innerHeight at cold launch. Never apply that fallback to tabs or iPad windows.
export function layoutViewport(win = window, doc = document, nav = navigator) {
  const root = doc.documentElement;
  const width = win.innerWidth || root.clientWidth || win.visualViewport?.width || 0;
  const probe = doc.getElementById('viewportProbe');
  const measured = probe?.getBoundingClientRect?.().height || probe?.offsetHeight || 0;
  let height = measured || Math.max(win.innerHeight || 0, root.clientHeight || 0);
  if (/iPhone|iPod/i.test(nav.userAgent || '') && standalone(win, nav)) {
    const shortSide = Math.min(win.screen?.width || 0, win.screen?.height || 0);
    const longSide = Math.max(win.screen?.width || 0, win.screen?.height || 0);
    if (shortSide > 0 && longSide > shortSide) {
      if (Math.abs(width - shortSide) <= 2) height = longSide;
      else if (Math.abs(width - longSide) <= 2) height = shortSide;
    }
  }
  return { width, height: height || win.visualViewport?.height || 0 };
}

export function landscape(win = window, doc = document) {
  const nativeType = win.screen?.orientation?.type;
  if (nativeType?.startsWith('landscape')) return true;
  if (nativeType?.startsWith('portrait')) return false;
  if (typeof win.orientation === 'number') return Math.abs(win.orientation) === 90;
  const { width, height } = layoutViewport(win, doc);
  const shellHeight = Number.parseFloat(doc.documentElement.style.getPropertyValue('--app-height')) || 0;
  return width > Math.max(height, shellHeight);
}
