// Keep the dock independent from the scrolling content and the iOS keyboard.
export function initDock() {
  const dock = document.getElementById('navDock');
  const viewport = window.visualViewport;
  if (!dock || !viewport) return;
  let fullHeight = Math.max(window.innerHeight || 0, viewport.height || 0);
  let width = window.innerWidth || viewport.width || 0;
  let keyboard = false; let frame = 0;
  const editable = element => {
    if (element?.isContentEditable || element?.tagName === 'TEXTAREA') return true;
    return element?.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'hidden'].includes(element.type || element.getAttribute?.('type'));
  };
  const update = () => {
    frame = 0;
    const currentWidth = window.innerWidth || viewport.width || 0;
    if (Math.abs(currentWidth - width) > 80) { width = currentWidth; fullHeight = Math.max(window.innerHeight || 0, viewport.height || 0); keyboard = false; }
    const focused = editable(document.activeElement);
    if (!focused && !keyboard) fullHeight = Math.max(window.innerHeight || 0, viewport.height || 0);
    const lostHeight = fullHeight - viewport.height;
    if ((viewport.scale || 1) <= 1.05) {
      if (focused && lostHeight > 120) keyboard = true;
      else if (lostHeight < 80) keyboard = false;
    }
    dock.classList.toggle('keyboard-open', keyboard);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  viewport.addEventListener('resize', schedule, { passive: true });
  viewport.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  update();
}
