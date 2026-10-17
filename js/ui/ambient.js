import { reducedMotion, finishValueMotion } from './motion.js';

// Parallax follows scroll on touch devices, and also the pointer on desktop.
// Only run the interpolation loop while the background is actually moving.
export function initAmbient() {
  const layer = document.getElementById('ambientLight');
  if (!layer) return;
  let frame = 0; let x = 0; let y = 0; let pointerX = 0; let pointerY = 0;
  let lastTime = 0; let paused = false;
  const preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
  const update = now => {
    frame = 0;
    if (paused || reducedMotion()) return;
    const targetX = pointerX;
    const targetY = pointerY - Math.tanh((window.scrollY || 0) / 1000) * 42;
    const elapsed = lastTime ? Math.min(64, now - lastTime) : 16;
    const blend = 1 - Math.exp(-elapsed / 160); lastTime = now;
    x += (targetX - x) * blend; y += (targetY - y) * blend;
    layer.style.setProperty('--parallax-x', `${x.toFixed(2)}px`);
    layer.style.setProperty('--parallax-y', `${y.toFixed(2)}px`);
    if (Math.abs(targetX - x) + Math.abs(targetY - y) > .08) frame = requestAnimationFrame(update);
    else lastTime = 0;
  };
  const schedule = () => { if (!frame && !paused && !reducedMotion()) frame = requestAnimationFrame(update); };
  const pause = hidden => {
    paused = hidden; document.documentElement.classList.toggle('motion-paused', hidden);
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    if (hidden || reducedMotion()) finishValueMotion();
    if (reducedMotion()) { pointerX = 0; pointerY = 0; x = 0; y = 0; layer.style.setProperty('--parallax-x', '0px'); layer.style.setProperty('--parallax-y', '0px'); }
    if (!hidden) schedule();
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pointermove', event => {
    if (!finePointer?.matches || event.pointerType === 'touch') return;
    pointerX = (event.clientX / Math.max(1, window.innerWidth) - .5) * 22;
    pointerY = (event.clientY / Math.max(1, window.innerHeight) - .5) * 16;
    schedule();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; schedule(); });
  document.addEventListener('visibilitychange', () => pause(document.hidden));
  window.addEventListener('pagehide', () => pause(true));
  window.addEventListener('pageshow', () => pause(document.hidden));
  const preferenceChanged = () => pause(document.hidden);
  if (preference?.addEventListener) preference.addEventListener('change', preferenceChanged);
  else preference?.addListener?.(preferenceChanged);
  pause(document.hidden);
}
