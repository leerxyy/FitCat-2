import { reducedMotion, finishValueMotion } from './motion.js';
import { APPEARANCE_DEFAULTS, normalizeAppearance } from '../core/appearance.js';

let currentAmbient;
export function requestDeviceTilt() {
  return currentAmbient ? currentAmbient.requestTilt() : Promise.reject(new Error('tilt_unavailable'));
}
export function disableDeviceTilt() { currentAmbient?.stopTilt(); }
export function recenterDeviceTilt() { currentAmbient?.recenter(); }
export function deviceTiltStatus() {
  return currentAmbient?.status() ?? (window.DeviceOrientationEvent ? 'idle' : 'unsupported');
}

// Only the isolated wallpaper subtree moves. Never invalidate the document's
// inherited properties or transform every card on a sensor/scroll frame.
export function initAmbient(initial = APPEARANCE_DEFAULTS) {
  currentAmbient?.dispose();
  const layer = document.getElementById('ambientLight');
  if (!layer) return;
  const root = document.documentElement, scroller = document.getElementById('appScroller');
  const preview = document.getElementById('appearancePreview');
  let settings = normalizeAppearance(initial);
  let frame = 0, x = 0, y = 0, pointerX = 0, pointerY = 0, lastTime = 0, paused = document.hidden;
  let tiltEnabled = settings.deviceTilt, tiltListening = false, tiltOrigin, permissionVersion = 0, sensorTimer = 0;
  let phase = window.DeviceOrientationEvent ? 'idle' : 'unsupported';
  let previewOnScreen = true, previewVisible = false;
  const listeners = [], preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
  const bounded = (value, limit) => Math.min(limit, Math.max(-limit, value));
  const on = (target, type, handler, options) => {
    target?.addEventListener?.(type, handler, options);
    listeners.push(() => target?.removeEventListener?.(type, handler, options));
  };
  function status(value) {
    if (phase === value) return;
    phase = value;
    document.dispatchEvent(new CustomEvent('fitcat:tilt-status', { detail: value }));
  }
  function paint() {
    layer.style.setProperty('--parallax-x', x === 0 ? '0px' : `${x.toFixed(2)}px`);
    layer.style.setProperty('--parallax-y', y === 0 ? '0px' : `${y.toFixed(2)}px`);
    if (previewVisible) {
      preview.style.setProperty('--parallax-x', `${(x*.35).toFixed(2)}px`);
      preview.style.setProperty('--parallax-y', `${(y*.25).toFixed(2)}px`);
      preview.style.setProperty('--preview-rotate-y', `${(x*.055).toFixed(2)}deg`);
      preview.style.setProperty('--preview-rotate-x', `${(-y*.03).toFixed(2)}deg`);
    }
  }
  const update = now => {
    frame = 0;
    if (paused || reducedMotion() || !settings.parallax || settings.depth === 0 || document.body?.classList.contains('dialog-open')) return;
    // Sensors may emit 60–120 Hz. A gentle wallpaper needs at most 30 fps.
    if (lastTime && now-lastTime < 30) { frame=requestAnimationFrame(update); return; }
    const strength = settings.depth / 35 * (settings.motion === 'calm' ? .65 : 1);
    const targetX = bounded(pointerX * strength, 45);
    const targetY = bounded((pointerY - Math.tanh((scroller?.scrollTop ?? window.scrollY ?? 0) / 1000) * 42) * strength, 80);
    const elapsed = lastTime ? Math.min(64, now-lastTime) : 32;
    const blend = 1-Math.exp(-elapsed/155); lastTime = now;
    x += (targetX-x)*blend; y += (targetY-y)*blend;
    const moving = Math.abs(targetX-x)+Math.abs(targetY-y) > .12;
    if (!moving) { x=targetX;y=targetY; }
    paint();
    if (moving) frame=requestAnimationFrame(update);
    else lastTime=0;
  };
  const schedule = () => {
    if (!frame && !paused && !reducedMotion() && settings.parallax && settings.depth>0) frame=requestAnimationFrame(update);
  };
  const clearPosition = () => {
    cancelAnimationFrame(frame);frame=0;lastTime=0;x=0;y=0;pointerX=0;pointerY=0;paint();
  };
  const sensor = event => {
    if (paused || !settings.parallax || reducedMotion() || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    clearTimeout(sensorTimer);
    if (!tiltOrigin) tiltOrigin={beta:event.beta,gamma:event.gamma};
    const beta=((event.beta-tiltOrigin.beta+540)%360)-180;
    const gamma=bounded(event.gamma-tiltOrigin.gamma,26), vertical=bounded(beta,26);
    const angle=(window.screen?.orientation?.angle ?? window.orientation ?? 0)*Math.PI/180;
    pointerX=(gamma*Math.cos(angle)+vertical*Math.sin(angle))*1.35;
    pointerY=(vertical*Math.cos(angle)-gamma*Math.sin(angle))*1.05;
    status('active');schedule();
  };
  const syncSensor = () => {
    const listen=Boolean(window.DeviceOrientationEvent)&&tiltEnabled&&!paused&&settings.parallax&&!reducedMotion();
    if (listen&&!tiltListening) {
      window.addEventListener('deviceorientation',sensor,{passive:true});tiltListening=true;
      status('waiting');clearTimeout(sensorTimer);
      sensorTimer=setTimeout(()=>{if(phase==='waiting')status('stalled');},4500);
    } else if (!listen&&tiltListening) {
      window.removeEventListener('deviceorientation',sensor);tiltListening=false;tiltOrigin=null;clearTimeout(sensorTimer);
    }
  };
  const controller = {
    status:()=>window.DeviceOrientationEvent?phase:'unsupported',
    async requestTilt() {
      const orientation=window.DeviceOrientationEvent;
      if (!orientation || globalThis.isSecureContext===false) {status('unsupported');throw new Error('tilt_unavailable');}
      if (!settings.parallax || paused || reducedMotion()) return false;
      const version=++permissionVersion;
      // Permission must be requested in the synchronous user gesture on iOS.
      let permission;
      try{permission=typeof orientation.requestPermission==='function' ? await orientation.requestPermission() : 'granted';}
      catch(error){if(version===permissionVersion){tiltEnabled=false;syncSensor();status('denied');}throw error;}
      if (version!==permissionVersion || !settings.parallax || paused || reducedMotion()) return false;
      if (permission!=='granted') {tiltEnabled=false;syncSensor();status('denied');return false;}
      tiltEnabled=true;tiltOrigin=null;syncSensor();return true;
    },
    recenter(){tiltOrigin=null;pointerX=0;pointerY=0;schedule();},
    stopTilt(){
      permissionVersion++;tiltEnabled=false;tiltOrigin=null;clearTimeout(sensorTimer);syncSensor();
      if(phase!=='denied'&&phase!=='unsupported')status('idle');clearPosition();
    },
    dispose(){
      permissionVersion++;cancelAnimationFrame(frame);clearTimeout(sensorTimer);
      window.removeEventListener('deviceorientation',sensor);observer?.disconnect();
      for(const remove of listeners)remove();
    },
  };
  const configure = event => {
    const previous=settings;settings=normalizeAppearance(event.detail);
    if(!settings.parallax)controller.stopTilt();
    else {
      if(previous.deviceTilt!==settings.deviceTilt)tiltEnabled=settings.deviceTilt;
      if(settings.depth===0)clearPosition();else schedule();
      syncSensor();
    }
  };
  const pause = () => {
    paused=document.hidden;root.classList.toggle('motion-paused',paused);
    if (paused||reducedMotion()) {cancelAnimationFrame(frame);frame=0;lastTime=0;finishValueMotion();}
    if (reducedMotion()||!settings.parallax) clearPosition();
    syncSensor();if(!paused)schedule();
  };
  const syncPreview = () => {
    previewVisible=Boolean(preview&&!preview.hidden&&!document.getElementById('appearancePage')?.hidden&&previewOnScreen);
    if(preview)preview.dataset.inView=previewVisible?'true':'false';
    if(previewVisible)paint();
  };
  let observer;
  if(preview&&globalThis.IntersectionObserver){
    previewOnScreen=false;
    observer=new IntersectionObserver(entries=>{previewOnScreen=entries[0].isIntersecting;syncPreview();},{root:scroller,threshold:0});
    observer.observe(preview);
  }
  on(window,'scroll',schedule,{passive:true});on(scroller,'scroll',schedule,{passive:true});
  on(window,'pointermove',event=>{
    if(!finePointer?.matches||event.pointerType==='touch'||tiltEnabled)return;
    pointerX=(event.clientX/window.innerWidth-.5)*20;pointerY=(event.clientY/window.innerHeight-.5)*12;schedule();
  },{passive:true});
  on(preview,'pointermove',event=>{
    if(!previewVisible||event.pointerType==='touch'||tiltEnabled||!finePointer?.matches||!preview.getBoundingClientRect)return;
    const rect=preview.getBoundingClientRect();pointerX=(event.clientX-rect.left-rect.width/2)/rect.width*24;
    pointerY=(event.clientY-rect.top-rect.height/2)/rect.height*18;schedule();
  },{passive:true});
  on(document,'pointerleave',()=>{if(!tiltEnabled){pointerX=0;pointerY=0;schedule();}});
  on(document,'fitcat:appearance',configure);on(document,'fitcat:screen',syncPreview);
  on(document,'visibilitychange',pause);on(window,'pagehide',()=>{paused=true;cancelAnimationFrame(frame);frame=0;syncSensor();});
  on(window,'pageshow',pause);on(preference,'change',pause);
  currentAmbient=controller;syncPreview();paint();syncSensor();pause();
  return controller;
}
