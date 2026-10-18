import { state, proAccess, setAppearance } from '../core/store.js';
import { ACCENTS, APPEARANCE_DEFAULTS, THEME_PRESETS, PREMIUM_THEMES, PREMIUM_BACKGROUNDS, BACKGROUNDS, EFFECTS, normalizeAppearance, effectiveAppearance, appearanceTimings, appearanceRGB, isDefaultAppearance } from '../core/appearance.js';
import { t, number } from '../core/i18n.js';
import { $, onAction, toast } from '../ui/components.js';
import { showScreen } from '../ui/navigation.js';
import { enter, reducedMotion, MOTION } from '../ui/motion.js';
import { initSelectionLens, syncSelectionLens } from '../ui/selection-lens.js';
import { requirePro, renderPremium } from '../ui/premium.js';
import { haptic } from '../ui/haptics.js';
import { requestDeviceTilt, disableDeviceTilt, recenterDeviceTilt, deviceTiltStatus } from '../ui/ambient.js';

let currentTab = 'style', saveError = false, tiltPending = false;
let tiltRequest = 0;
const tabs = ['style', 'background', 'effects'], motions = ['calm', 'standard', 'expressive'];
const applied = new WeakMap();
let draft = null, saveTimer = 0, liveFrame = null;
const current = () => draft ?? state.appearance;
const effective = () => effectiveAppearance(current(), proAccess());
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
export function applyAppearance() {
  const settings=effective(), root=document.documentElement;
  const signature=JSON.stringify(settings);
  const previous=applied.get(root);
  if(previous?.signature===signature)return settings;
  const palette=ACCENTS[settings.accent], timing=appearanceTimings(settings);
  // Higher transparency is also clearer glass. Keep this material unchanged
  // when a drag ends or storage flushes; toggling blur caused an opaque flash.
  const glassBlur=Number(((70-settings.transparency)*8/55).toFixed(2));
  // Accent tones are precomputed in CSS: no hundreds of synchronous root writes.
  const data={appearanceReady:'',accent:settings.accent,background:settings.background,backgroundEffect:settings.effect,
    backgroundAnimation:settings.animation&&settings.intensity>0?'on':'off',parallax:settings.parallax&&settings.depth>0?'on':'off',
    glints:settings.glints?'on':'off',uiMotion:settings.motion};
  for(const [name,value] of Object.entries(data))if(root.dataset[name]!==value)root.dataset[name]=value;
  const factor={calm:1.12,standard:1,expressive:1.18}[settings.motion];
  const variables={ '--accent':palette.color, '--accent-strong':palette.strong, '--accent-rgb':appearanceRGB(settings.accent).join(' '), '--accent-wash':`rgba(${appearanceRGB(settings.accent).join(',')},.13)`,
    '--appearance-glass-alpha':String(Number((1-settings.transparency/100).toFixed(2))), '--appearance-sheet-alpha':String(Number(Math.min(.97,1-settings.transparency/100+.31).toFixed(2))),
    '--appearance-glass-filter':glassBlur?`blur(${glassBlur}px) saturate(115%)`:'none', '--appearance-sheet-filter':glassBlur?`blur(${Number((glassBlur*1.6).toFixed(2))}px) saturate(115%)`:'none',
    '--appearance-glow-alpha':String(settings.glow/100*.26), '--glass-glow':`rgba(${appearanceRGB(settings.accent).join(',')},${settings.glow/100*.26})`,
    '--wallpaper-dim':String(settings.dimming/100), '--wallpaper-blur':`${settings.blur/10}px`, '--wallpaper-filter':settings.blur?`blur(${settings.blur/10}px)`:'none', '--effect-opacity':String(settings.intensity/100), '--background-duration':`${timing.background}ms`,
    '--shine-duration':`${timing.glint}ms`, '--shine-tile-duration':`${timing.glint*5/3}ms`, '--shine-scanner-duration':`${timing.glint*17/12}ms`, '--shine-outline-duration':`${timing.glint*4}ms`, '--shine-edge-duration':`${timing.glint*23/6}ms`, '--shine-button-duration':`${timing.glint*25/6}ms`,
    '--motion-press':`${140*factor}ms`, '--motion-screen':`${420*factor}ms`, '--motion-panel':`${300*factor}ms`, '--motion-close':`${200*factor}ms`,
  };
  for(const [name,value] of Object.entries(variables))if(previous?.variables[name]!==value)root.style.setProperty(name,value);
  applied.set(root,{signature,variables});
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:settings}));
  return settings;
}
function setSaveStatus(){
  $('appearanceSaveStatus').dataset.error=String(saveError);
  setText($('appearanceSaveText'),t(saveError?'save_error':draft?'appearance_saving':'appearance_saved'));
}
function renderChoices(settings){
  setText($('appearanceThemeName'),t('appearance_theme_'+settings.theme));
  $('appearancePreviewPro').hidden=!proAccess();
  for(const button of $('appearancePage').querySelectorAll('[data-appearance-kind]')){
    const kind=button.dataset.appearanceKind, chosen=settings[kind]===button.dataset.value;
    button.setAttribute('aria-pressed',String(chosen)); button.classList.toggle('active',chosen);
  }
}
function renderRange(input,settings,keepValue=false){
    const key=input.dataset.appearanceRange, value=settings[key];if(!keepValue&&input.value!==String(value))input.value=value;
    const min=Number(input.getAttribute('min')),max=Number(input.getAttribute('max'));
    input.style.setProperty('--range-fill',`${(value-min)/(max-min)*100}%`);
    const output=$(input.id+'Output'); setText(output,`${number(value)}%`);input.setAttribute('aria-valuetext',output.textContent);
    input.disabled=(['speed','intensity'].includes(key)&&!settings.animation)||(key==='depth'&&!settings.parallax)||(key==='glintSpeed'&&!settings.glints);
}
function renderTilt(settings=effective()){
  const status=deviceTiltStatus(), supported=status!=='unsupported';
  const input=$('appearanceDeviceTilt');input.checked=tiltPending||settings.deviceTilt;input.disabled=!settings.parallax||tiltPending||!supported||reducedMotion();
  $('appearanceEnableTilt').hidden=!(settings.deviceTilt&&status!=='active');
  $('appearanceEnableTilt').disabled=!settings.parallax||tiltPending||!supported||reducedMotion();
  $('appearanceRecenterTilt').hidden=status!=='active'||!settings.deviceTilt;
  const key=tiltPending?'appearance_gyro_wait':!supported?'appearance_gyro_unavailable':reducedMotion()?'appearance_gyro_reduced':!settings.parallax?'appearance_gyro_enable_parallax':status==='active'&&settings.deviceTilt?'appearance_gyro_on':settings.deviceTilt?'appearance_gyro_resume':status==='denied'?'appearance_gyro_denied':'appearance_gyro_hint';
  $('appearanceTiltStatus').hidden=false;
  $('appearanceTiltStatus').dataset.state=status;
  setText($('appearanceTiltStatus'),t(key));
}
export function renderAppearance() {
  const settings=applyAppearance();
  // Hidden forms do not need their ranges, thumbnails or preview rerendered.
  if($('appearancePage').hidden)return;
  renderChoices(settings);
  for(const input of $('appearancePage').querySelectorAll('[data-appearance-range]'))renderRange(input,settings,Boolean(draft&&document.activeElement===input));
  for(const input of $('appearancePage').querySelectorAll('[data-appearance-toggle]'))input.checked=settings[input.dataset.appearanceToggle];
  for(const button of $('appearancePage').querySelectorAll('.appearance-effect-tile'))button.disabled=!settings.animation;
  $('appearancePage').querySelector('.appearance-effect-grid').classList.toggle('is-disabled',!settings.animation);
  $('appearanceMotionNotice').hidden=!reducedMotion();
  $('appearanceProNotice').hidden=state.appearance.background===settings.background&&state.appearance.theme===settings.theme;
  renderTilt(settings);
  $('appearanceReset').disabled=isDefaultAppearance(current())&&!tiltPending;
  setSaveStatus();
  const control=$('appearanceMotionControl'), index=motions.indexOf(settings.motion);
  if(control.style.getPropertyValue('--lens-index')!==String(index))syncSelectionLens(control);
}
function cancelLiveFrame(){if(liveFrame){cancelAnimationFrame(liveFrame.id);liveFrame=null;}}
function paintDraft(){
  if(liveFrame)return;
  const ticket={id:0};liveFrame=ticket;
  ticket.id=requestAnimationFrame(()=>{if(liveFrame!==ticket)return;liveFrame=null;applyAppearance();});
}
// Range input previews are immediate and frame-batched; only the finished value
// (or a brief pause) writes storage. Flushing also happens before leaving/hiding.
export function flushAppearance(){
  clearTimeout(saveTimer);saveTimer=0;cancelLiveFrame();
  document.documentElement.dataset.appearanceAdjusting='off';
  if(!draft)return true;
  try{setAppearance(draft);draft=null;saveError=false;}
  catch(error){console.error(error);draft=null;saveError=true;renderAppearance();return false;}
  renderAppearance();return true;
}
function update(patch,input){
  const previousTheme=current().theme;
  const next=normalizeAppearance({...current(),...patch});
  if(JSON.stringify(next)===JSON.stringify(current()))return;
  if(patch.parallax===false||patch.deviceTilt===false){tiltRequest++;tiltPending=false;}
  draft=next;saveError=false;
  if(input){
    document.documentElement.dataset.appearanceAdjusting='on';
    renderRange(input,effective(),true);if(previousTheme!==next.theme)renderChoices(effective());$('appearanceReset').disabled=false;
    paintDraft();setSaveStatus();clearTimeout(saveTimer);saveTimer=setTimeout(flushAppearance,220);
  }else return flushAppearance();
}
function choose(kind,value){
  if(kind==='theme'){
    if(!Object.hasOwn(THEME_PRESETS,value))return;
    if(PREMIUM_THEMES.includes(value)&&!requirePro('appearance'))return;
    const preset=THEME_PRESETS[value];
    // Choosing a palette never silently resets the user's glass/blur sliders.
    update(Object.fromEntries(['theme','accent','background','effect'].map(key=>[key,preset[key]])));return;
  }
  const choices={accent:Object.keys(ACCENTS),background:BACKGROUNDS,effect:EFFECTS,motion:motions};
  if(!choices[kind]?.includes(value))return;
  if(kind==='background'&&PREMIUM_BACKGROUNDS.includes(value)&&!requirePro('appearance'))return;
  update({[kind]:value,...(['accent','background'].includes(kind)?{theme:'custom'}:{})});
}
function selectTab(value){
  if(!tabs.includes(value))return;
  flushAppearance();
  const previous=currentTab;currentTab=value;
  for(const tab of tabs){
    const chosen=tab===value,panel=$('appearance'+tab[0].toUpperCase()+tab.slice(1)+'Panel'),button=$('appearance'+tab[0].toUpperCase()+tab.slice(1)+'Tab');
    panel.hidden=!chosen;panel.inert=!chosen;button.setAttribute('aria-selected',String(chosen));button.setAttribute('tabindex',chosen?'0':'-1');button.classList.toggle('active',chosen);
    if(chosen){panel.removeAttribute('aria-hidden');if(previous!==value)enter(panel,{x:tabs.indexOf(value)>tabs.indexOf(previous)?18:-18,y:0,duration:MOTION.screen});}
    else panel.setAttribute('aria-hidden','true');
  }
  syncSelectionLens($('appearanceTabs'));
}
export function initAppearance(){
  onAction('openAppearance',()=>showScreen('appearancePage',{x:24,y:0,duration:MOTION.screen}));
  onAction('appearanceBack',()=>{flushAppearance();showScreen('settingsPage',{x:-20,y:0,duration:MOTION.screen});});
  onAction('appearanceTab',button=>selectTab(button.dataset.value));
  onAction('appearanceChoice',button=>choose(button.dataset.appearanceKind,button.dataset.value));
  onAction('resetAppearance',()=>{
    try{clearTimeout(saveTimer);cancelLiveFrame();setAppearance(APPEARANCE_DEFAULTS);draft=null;document.documentElement.dataset.appearanceAdjusting='off';tiltRequest++;tiltPending=false;disableDeviceTilt();saveError=false;renderAppearance();toast(t('appearance_reset_done'));}
    catch(error){console.error(error);saveError=true;setSaveStatus();}
  });
  for(const name of ['input','change'])$('appearancePage').addEventListener(name,event=>{
    const input=event.target;
    if(input.dataset.appearanceRange){
      const key=input.dataset.appearanceRange,value=Number(input.value);
      if(typeof APPEARANCE_DEFAULTS[key]!=='number'||!Number.isFinite(value))return;
      update({[key]:value,...(['transparency','glow','dimming','blur'].includes(key)?{theme:'custom'}:{})},name==='input'?input:null);
      if(name==='change')flushAppearance();
    }else if(name==='change'&&input.dataset.appearanceToggle){
      const key=input.dataset.appearanceToggle;
      if(key==='deviceTilt'&&input.checked){void enableTilt();return;}
      if(typeof APPEARANCE_DEFAULTS[key]==='boolean')update({[key]:input.checked});
    }
  });
  $('appearancePage').addEventListener('focusout',event=>{if(event.target.dataset.appearanceRange)flushAppearance();});
  initSelectionLens($('appearanceTabs'),{padding:4,getIndex:()=>tabs.indexOf(currentTab),onSelect:index=>{haptic();selectTab(tabs[index]);},isEnabled:()=>document.body.dataset.screen==='appearancePage'});
  initSelectionLens($('appearanceMotionControl'),{padding:4,getIndex:()=>motions.indexOf(effectiveAppearance(state.appearance,proAccess()).motion),onSelect:index=>{haptic();choose('motion',motions[index]);},isEnabled:()=>document.body.dataset.screen==='appearancePage'&&currentTab==='style'});
  $('appearanceTabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const index=event.key==='Home'?0:event.key==='End'?2:(tabs.indexOf(currentTab)+(event.key==='ArrowRight'?1:-1)+3)%3;
    selectTab(tabs[index]);$('appearance'+tabs[index][0].toUpperCase()+tabs[index].slice(1)+'Tab').focus({preventScroll:true});
  });
  async function enableTilt(){
    if(tiltPending||!current().parallax)return;
    const request=++tiltRequest;
    // Call the permission API before any async work to retain iOS user activation.
    const permission=requestDeviceTilt();tiltPending=true;renderTilt();
    try{const granted=await permission;if(request===tiltRequest&&update({deviceTilt:granted})===false)disableDeviceTilt();}
    catch{if(request===tiltRequest)update({deviceTilt:false});}
    finally{if(request===tiltRequest){tiltPending=false;renderTilt();}}
  }
  onAction('appearanceTilt',enableTilt);
  onAction('appearanceRecenterTilt',()=>{recenterDeviceTilt();renderTilt();});
  const motionPreference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionChanged=()=>{ $('appearanceMotionNotice').hidden=!reducedMotion(); };
  if(motionPreference?.addEventListener)motionPreference.addEventListener('change',motionChanged);
  document.addEventListener('fitcat:tilt-status',()=>{if(!$('appearancePage').hidden)renderTilt();});
  document.addEventListener('fitcat:screen',event=>{if(event.detail==='appearancePage'){renderAppearance();renderPremium();$('appearanceTitle').focus({preventScroll:true});}else flushAppearance();});
  renderAppearance();selectTab('style');
}
