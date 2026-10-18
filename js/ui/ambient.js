import { reducedMotion, finishValueMotion } from './motion.js';
import { APPEARANCE_DEFAULTS, normalizeAppearance } from '../core/appearance.js';
import { tiltPose, tiltOffset } from '../core/tilt.js';

let currentAmbient;
export function requestDeviceTilt() {
  return currentAmbient ? currentAmbient.requestTilt() : Promise.resolve(false);
}
export function disableDeviceTilt() { currentAmbient?.stopTilt(); }
export function deviceTiltStatus() {
  return currentAmbient?.status() ?? (window.DeviceOrientationEvent ? 'idle' : 'unsupported');
}

// Motion is confined to the wallpaper subtree; menus and root styles never move.
export function initAmbient(initial = APPEARANCE_DEFAULTS) {
  currentAmbient?.dispose();
  const view=window;
  const layer=document.getElementById('ambientLight');
  if(!layer)return;
  const root=document.documentElement,scroller=document.getElementById('appScroller');
  const preview=document.getElementById('appearancePreview');
  const preference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer=globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
  let settings=normalizeAppearance(initial),disposed=false,paused=Boolean(document.hidden);
  let frame=0,lastTime=null,x=0,y=0,pointerX=0,pointerY=0;
  let enabled=settings.deviceTilt,manualIntent=false,listening=false,origin=null,originHasAlpha=false,originAngle=0;
  let epoch=0,serial=0,pending=null,probeTimer=0,sensorTimer=0;
  let needsGesture=false,gestureUsed=false;
  let phase=view.DeviceOrientationEvent?'idle':'unsupported';
  let previewOnScreen=true,previewVisible=false,observer;
  const listeners=[],bounded=(value,limit)=>Math.max(-limit,Math.min(limit,value));
  const on=(target,type,handler,options)=>{
    target?.addEventListener?.(type,handler,options);
    listeners.push(()=>target?.removeEventListener?.(type,handler,options));
  };
  const canRun=()=>!disposed&&!paused&&!reducedMotion()&&settings.parallax&&settings.depth>0;
  const wantsTilt=()=>enabled||manualIntent;
  function status(value){
    if(phase===value)return;
    phase=value;document.dispatchEvent(new CustomEvent('fitcat:tilt-status',{detail:value}));
  }
  function paint(){
    layer.style.setProperty('--parallax-x',Math.abs(x)<.001?'0px':`${x.toFixed(2)}px`);
    layer.style.setProperty('--parallax-y',Math.abs(y)<.001?'0px':`${y.toFixed(2)}px`);
    if(previewVisible){
      preview.style.setProperty('--parallax-x',`${(x*.35).toFixed(2)}px`);
      preview.style.setProperty('--parallax-y',`${(y*.25).toFixed(2)}px`);
      preview.style.setProperty('--preview-rotate-y',`${(x*.055).toFixed(2)}deg`);
      preview.style.setProperty('--preview-rotate-x',`${(-y*.03).toFixed(2)}deg`);
    }
  }
  const update=now=>{
    frame=0;
    if(!canRun()||document.body?.classList.contains('dialog-open')){lastTime=null;return;}
    // Smooth at display cadence, capped at 60 wallpaper paints on 120 Hz screens.
    if(lastTime!==null&&now-lastTime<15.5){frame=requestAnimationFrame(update);return;}
    const elapsed=lastTime===null?1/60:Math.min(.05,Math.max(.001,(now-lastTime)/1000));
    lastTime=now;
    const strength=settings.depth/35*(settings.motion==='calm'?.65:1);
    const sensorMode=wantsTilt()&&['active','waiting'].includes(phase);
    const scroll=sensorMode?0:Math.tanh((scroller?.scrollTop??view.scrollY??0)/1000)*42;
    const targetX=bounded(pointerX*strength,45),targetY=bounded((pointerY-scroll)*strength,80);
    const blend=1-Math.exp(-elapsed/(sensorMode?.24:.20));
    const maxStep=elapsed*95;
    x+=bounded((targetX-x)*blend,maxStep);y+=bounded((targetY-y)*blend,maxStep);
    const moving=Math.abs(targetX-x)+Math.abs(targetY-y)>.02;
    if(!moving){x=targetX;y=targetY;}
    paint();
    if(moving)frame=requestAnimationFrame(update);else lastTime=null;
  };
  const schedule=()=>{if(!frame&&canRun())frame=requestAnimationFrame(update);};
  function center(){
    cancelAnimationFrame(frame);frame=0;lastTime=null;x=0;y=0;pointerX=0;pointerY=0;origin=null;paint();
  }
  function clearTimers(){if(probeTimer)clearTimeout(probeTimer);if(sensorTimer)clearTimeout(sensorTimer);probeTimer=0;sensorTimer=0;}
  const sensor=event=>{
    if(!listening||!canRun())return;
    const pose=tiltPose(event);if(!pose)return;
    const angle=view.screen?.orientation?.angle??view.orientation??0;
    const hasAlpha=Number.isFinite(event.alpha);
    clearTimers();needsGesture=false;
    // First valid reading after every foreground session defines the center.
    if(!origin||originAngle!==angle||originHasAlpha!==hasAlpha){
      origin=pose;originAngle=angle;originHasAlpha=hasAlpha;pointerX=0;pointerY=0;
      status('active');schedule();return;
    }
    const offset=tiltOffset(origin,pose,angle);
    status('active');
    if(Math.abs(offset.x-pointerX)+Math.abs(offset.y-pointerY)<.035)return;
    pointerX=offset.x;pointerY=offset.y;schedule();
  };
  function detach(){
    if(listening)view.removeEventListener('deviceorientation',sensor);
    listening=false;origin=null;
  }
  function attach(){
    if(listening||!canRun()||!wantsTilt()||!view.DeviceOrientationEvent)return;
    view.addEventListener('deviceorientation',sensor,{passive:true});listening=true;
    if(phase!=='active')status('waiting');
    clearTimeout(sensorTimer);
    sensorTimer=setTimeout(()=>{
      if(!canRun()||!listening||phase==='active'||phase==='denied')return;
      needsGesture=!gestureUsed;status('stalled');
    },2500);
  }
  function suspend(){
    epoch++;pending=null;clearTimers();detach();needsGesture=false;gestureUsed=false;center();
  }
  function attempt(userGesture){
    if(!canRun()||!wantsTilt())return Promise.resolve(false);
    const orientation=view.DeviceOrientationEvent;
    if(!orientation||globalThis.isSecureContext===false){status('unsupported');return Promise.resolve(false);}
    // A real gesture may upgrade an automatic probe still awaiting rejection.
    if(pending&&(!userGesture||pending.userGesture))return pending.promise;
    const ticket={epoch,serial:++serial,userGesture,promise:null};
    pending=ticket;
    if(userGesture){gestureUsed=true;needsGesture=false;clearTimeout(probeTimer);}
    let result;
    try{
      // Keep this synchronous call inside the native user event when provided.
      result=typeof orientation.requestPermission==='function'?orientation.requestPermission():'granted';
    }catch(error){result=Promise.reject(error);}
    ticket.promise=Promise.resolve(result).then(permission=>{
      if(ticket.epoch!==epoch||ticket.serial!==serial||!canRun()||!wantsTilt())return false;
      if(phase==='active')return true;
      if(permission!=='granted'){
        manualIntent=false;detach();clearTimers();needsGesture=false;status('denied');return false;
      }
      attach();return true;
    },()=>{
      if(ticket.epoch!==epoch||ticket.serial!==serial||!canRun()||!wantsTilt())return false;
      if(phase==='active')return true;
      // A blocked no-gesture probe is not a preference change or a denial.
      needsGesture=!gestureUsed;status(userGesture?'denied':'gesture');return false;
    }).finally(()=>{if(pending===ticket)pending=null;});
    return ticket.promise;
  }
  function restore(){
    if(!canRun()||!wantsTilt())return;
    if(!view.DeviceOrientationEvent||globalThis.isSecureContext===false){status('unsupported');return;}
    attach();
    if(phase==='active'||pending||probeTimer)return;
    needsGesture=!gestureUsed;
    // Usually the existing grant delivers readings immediately. Only probe
    // the permission API if the resumed listener has not received a reading.
    probeTimer=setTimeout(()=>{
      probeTimer=0;if(canRun()&&wantsTilt()&&phase!=='active')void attempt(false);
    },180);
  }
  const controller={
    status:()=>view.DeviceOrientationEvent?phase:'unsupported',
    requestTilt(){
      if(!canRun())return Promise.resolve(false);
      manualIntent=true;enabled=true;restore();
      return attempt(true).then(granted=>{
        if(!granted&&!settings.deviceTilt){manualIntent=false;enabled=false;detach();clearTimers();}
        return granted;
      });
    },
    stopTilt(){enabled=false;manualIntent=false;suspend();if(phase!=='denied'&&phase!=='unsupported')status('idle');},
    dispose(){
      disposed=true;suspend();observer?.disconnect();for(const remove of listeners)remove();
    },
  };
  function firstGesture(event){
    if(event.isTrusted!==true||!canRun()||!wantsTilt()||!needsGesture||gestureUsed||phase==='active'||phase==='denied')return;
    if(event.type==='keydown'&&(!['Enter',' '].includes(event.key)||event.repeat))return;
    if(event.button!==undefined&&event.button!==0)return;
    if(event.target?.closest?.('.appearance-control-card, [data-action="resetAppearance"], [data-action="deleteAccount"]'))return;
    void attempt(true);
  }
  const configure=event=>{
    const previous=settings;settings=normalizeAppearance(event.detail);
    const wasOn=previous.deviceTilt&&previous.parallax&&previous.depth>0;
    enabled=settings.deviceTilt;
    if(!settings.deviceTilt)manualIntent=false;
    if(!canRun()||!wantsTilt()){
      suspend();if(phase!=='unsupported')status('idle');if(canRun())schedule();return;
    }
    if(!wasOn){suspend();status('waiting');restore();}
    else if(!listening)restore();
    schedule();
  };
  const visibility=value=>{
    const wasPaused=paused;paused=value;root.classList.toggle('motion-paused',paused);
    if(paused||reducedMotion()){
      suspend();finishValueMotion();if(wantsTilt())status('paused');return;
    }
    if(wasPaused){suspend();if(wantsTilt())status('waiting');}
    if(wantsTilt())restore();schedule();
  };
  const syncPreview=()=>{
    previewVisible=Boolean(preview&&!preview.hidden&&!document.getElementById('appearancePage')?.hidden&&previewOnScreen);
    if(preview)preview.dataset.inView=previewVisible?'true':'false';if(previewVisible)paint();
  };
  if(preview&&globalThis.IntersectionObserver){
    previewOnScreen=false;observer=new IntersectionObserver(entries=>{previewOnScreen=entries[0].isIntersecting;syncPreview();},{root:scroller,threshold:0});observer.observe(preview);
  }
  on(view,'scroll',schedule,{passive:true});on(scroller,'scroll',schedule,{passive:true});
  on(view,'pointermove',event=>{
    if(!finePointer?.matches||event.pointerType==='touch'||(wantsTilt()&&phase==='active'))return;
    pointerX=(event.clientX/view.innerWidth-.5)*20;pointerY=(event.clientY/view.innerHeight-.5)*12;schedule();
  },{passive:true});
  on(preview,'pointermove',event=>{
    if(!previewVisible||event.pointerType==='touch'||!finePointer?.matches||(wantsTilt()&&phase==='active')||!preview.getBoundingClientRect)return;
    const rect=preview.getBoundingClientRect();pointerX=(event.clientX-rect.left-rect.width/2)/rect.width*24;pointerY=(event.clientY-rect.top-rect.height/2)/rect.height*18;schedule();
  },{passive:true});
  on(document,'pointerleave',()=>{if(phase!=='active'){pointerX=0;pointerY=0;schedule();}});
  on(document,'pointerup',firstGesture,{capture:true,passive:true});on(document,'click',firstGesture,{capture:true,passive:true});on(document,'keydown',firstGesture,{capture:true});
  on(document,'fitcat:appearance',configure);on(document,'fitcat:screen',syncPreview);
  on(document,'fitcat:appearance-tab',syncPreview);
  on(document,'close',()=>{lastTime=null;schedule();},true);
  on(document,'visibilitychange',()=>visibility(Boolean(document.hidden)));
  on(view,'pagehide',()=>visibility(true));on(view,'pageshow',()=>visibility(Boolean(document.hidden)));
  on(preference,'change',()=>visibility(Boolean(document.hidden)));
  on(view,'orientationchange',()=>{if(wantsTilt()&&canRun()){center();status('waiting');}},{passive:true});
  currentAmbient=controller;syncPreview();paint();visibility(paused);
  return controller;
}
