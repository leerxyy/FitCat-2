import { reducedMotion, finishValueMotion } from './motion.js';
import { APPEARANCE_DEFAULTS, normalizeAppearance } from '../core/appearance.js';

let currentAmbient;
export function requestDeviceTilt() {
  if (!currentAmbient) return Promise.reject(new Error('tilt_unavailable'));
  return currentAmbient.requestTilt();
}
export function disableDeviceTilt() { currentAmbient?.stopTilt(); }

// Keep the interpolation loop asleep when the image is still. Page/layout
// transforms are never touched: only the background and isolated preview move.
export function initAmbient(initial = APPEARANCE_DEFAULTS) {
  const layer = document.getElementById('ambientLight');
  if (!layer) return;
  const root = document.documentElement, scroller = document.getElementById('appScroller');
  const preview = document.getElementById('appearancePreview');
  let settings = normalizeAppearance(initial);
  let frame = 0, x = 0, y = 0, pointerX = 0, pointerY = 0, lastTime = 0, paused = false;
  let tiltEnabled = false, tiltListening = false, tiltOrigin, permissionVersion = 0;
  const preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
  const bounded = (value, limit) => Math.min(limit, Math.max(-limit, value));
  function paint() {
    for (const target of [layer, root]) {
      target.style.setProperty('--parallax-x', x === 0 ? '0px' : `${x.toFixed(2)}px`);
      target.style.setProperty('--parallax-y', y === 0 ? '0px' : `${y.toFixed(2)}px`);
    }
    root.style.setProperty('--card-shift-x', `${(-x*.03).toFixed(2)}px`);
    root.style.setProperty('--card-shift-y', `${(-y*.025).toFixed(2)}px`);
    root.style.setProperty('--card-tilt', `${(x*.004).toFixed(3)}deg`);
    if (preview) {
      preview.style.setProperty('--preview-x', `${x.toFixed(2)}px`);
      preview.style.setProperty('--preview-y', `${y.toFixed(2)}px`);
      preview.style.setProperty('--preview-rotate-y', `${(x*.08).toFixed(2)}deg`);
      preview.style.setProperty('--preview-rotate-x', `${(-y*.045).toFixed(2)}deg`);
    }
  }
  const update = now => {
    frame = 0;
    if (paused || reducedMotion() || !settings.parallax) return;
    const strength = settings.depth / 35 * (settings.motion === 'calm' ? .65 : 1);
    const targetX = bounded(pointerX * strength, 45);
    const targetY = bounded((pointerY - Math.tanh((scroller?.scrollTop ?? window.scrollY ?? 0) / 1000) * 42) * strength, 80);
    const elapsed = lastTime ? Math.min(64, now-lastTime) : 16;
    const blend = 1-Math.exp(-elapsed/160); lastTime = now;
    x += (targetX-x)*blend; y += (targetY-y)*blend; paint();
    if (Math.abs(targetX-x)+Math.abs(targetY-y)>.08) frame=requestAnimationFrame(update);
    else lastTime=0;
  };
  const schedule = () => { if (!frame && !paused && !reducedMotion() && settings.parallax) frame=requestAnimationFrame(update); };
  const clearPosition = () => { cancelAnimationFrame(frame);frame=0;lastTime=0;x=0;y=0;pointerX=0;pointerY=0;paint(); };
  const sensor = event => {
    if (paused || !settings.parallax || reducedMotion() || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    if (!tiltOrigin) tiltOrigin={beta:event.beta,gamma:event.gamma};
    pointerX=bounded(event.gamma-tiltOrigin.gamma,28)*.8;
    pointerY=bounded(event.beta-tiltOrigin.beta,28)*.6;
    schedule();
  };
  const syncSensor = () => {
    const listen=tiltEnabled&&!paused&&settings.parallax&&!reducedMotion();
    if (listen&&!tiltListening) { window.addEventListener('deviceorientation',sensor,{passive:true});tiltListening=true; }
    else if (!listen&&tiltListening) { window.removeEventListener('deviceorientation',sensor);tiltListening=false;tiltOrigin=null; }
  };
  const controller = {
    async requestTilt() {
      const orientation=window.DeviceOrientationEvent;
      if (!orientation) throw new Error('tilt_unavailable');
      if (!settings.parallax || paused || reducedMotion()) return false;
      const version=++permissionVersion;
      const permission=typeof orientation.requestPermission==='function' ? await orientation.requestPermission() : 'granted';
      if (version!==permissionVersion || permission!=='granted' || !settings.parallax || paused || reducedMotion()) return false;
      tiltEnabled=true;tiltOrigin=null;syncSensor();return true;
    },
    stopTilt() { permissionVersion++;tiltEnabled=false;tiltOrigin=null;syncSensor();clearPosition(); },
  };
  currentAmbient=controller;
  const configure = value => {
    settings=normalizeAppearance(value);
    if (!settings.parallax) { controller.stopTilt(); } else schedule();
    syncSensor();
  };
  const pause = hidden => {
    paused=hidden;root.classList.toggle('motion-paused',hidden);
    cancelAnimationFrame(frame);frame=0;lastTime=0;
    if (hidden||reducedMotion()) finishValueMotion();
    if (reducedMotion()||!settings.parallax) clearPosition();
    syncSensor();if (!hidden) schedule();
  };
  window.addEventListener('scroll',schedule,{passive:true});
  scroller?.addEventListener?.('scroll',schedule,{passive:true});
  window.addEventListener('pointermove',event=>{
    if (!finePointer?.matches||event.pointerType==='touch'||tiltEnabled) return;
    pointerX=(event.clientX/Math.max(1,window.innerWidth)-.5)*22;
    pointerY=(event.clientY/Math.max(1,window.innerHeight)-.5)*16;schedule();
  },{passive:true});
  preview?.addEventListener?.('pointermove',event=>{
    if (tiltEnabled) return;
    const bounds=preview.getBoundingClientRect?.();if (!bounds?.width||!bounds.height) return;
    pointerX=bounded(((event.clientX-bounds.left)/bounds.width-.5)*24,16);
    pointerY=bounded(((event.clientY-bounds.top)/bounds.height-.5)*16,12);schedule();
  },{passive:true});
  document.addEventListener('pointerleave',()=>{if(!tiltEnabled){pointerX=0;pointerY=0;schedule();}});
  document.addEventListener('fitcat:appearance',event=>configure(event.detail));
  document.addEventListener('visibilitychange',()=>pause(document.hidden));
  window.addEventListener('pagehide',()=>pause(true));
  window.addEventListener('pageshow',()=>pause(document.hidden));
  if (preference?.addEventListener) preference.addEventListener('change',()=>pause(document.hidden));
  else preference?.addListener?.(()=>pause(document.hidden));
  pause(document.hidden);return controller;
}
