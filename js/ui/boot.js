// Small classic entry point: show the brand before the module graph loads.
(() => {
  const root = document.documentElement;
  // Restore the rendering policy before the first frame; storage may be blocked.
  try { root.dataset.lowDetail = localStorage.getItem('fitcat_low_detail_mode_v1') === 'true' ? 'on' : 'off'; }
  catch { root.dataset.lowDetail = 'off'; }
  root.classList.add('app-starting'); root.setAttribute('aria-busy', 'true');
  let ready = false; let finished = false; let deadline;
  const unlock = () => {
    for (const id of ['appScroller', 'navDock']) {
      const node = document.getElementById(id); if (node) node.inert = false;
    }
  };
  const finish = () => {
    if (finished) return;
    finished = true; clearTimeout(deadline);
    document.dispatchEvent(new Event('fitcat:viewportrestore'));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove('app-starting', 'startup-failed'); root.removeAttribute('aria-busy');
      unlock();
      const splash = document.getElementById('startupScreen');
      if (!splash) return;
      splash.setAttribute('aria-hidden', 'true'); splash.classList.add('is-leaving');
      setTimeout(() => { splash.hidden = true; }, 420);
    }));
  };
  const fail = () => {
    if (finished) return;
    root.classList.add('startup-failed'); root.removeAttribute('aria-busy');
  };
  const loaded = () => {
    for (const id of ['appScroller', 'navDock']) {
      const node = document.getElementById(id); if (node) node.inert = !finished;
    }
  };
  document.addEventListener('DOMContentLoaded', loaded, { once: true });
  document.addEventListener('fitcat:ready', () => { ready = true; finish(); }, { once: true });
  document.addEventListener('fitcat:startup-error', fail);
  document.addEventListener('click', event => { if (event.target.closest?.('#startupRetry')) location.reload(); });
  window.addEventListener('pageshow', () => { if (ready) finish(); });
  deadline = setTimeout(fail, 5000);
})();
