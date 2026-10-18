import { state, proAccess, setAppearance } from '../core/store.js';
import { ACCENTS, APPEARANCE_DEFAULTS, THEME_PRESETS, PREMIUM_THEMES, PREMIUM_BACKGROUNDS, BACKGROUNDS, EFFECTS, normalizeAppearance, effectiveAppearance, appearanceTimings, appearanceRGB, isDefaultAppearance } from '../core/appearance.js';
import { APPEARANCE_TONES } from '../core/appearance-tones.js';
import { t, number } from '../core/i18n.js';
import { $, onAction, toast } from '../ui/components.js';
import { showScreen } from '../ui/navigation.js';
import { enter, reducedMotion, MOTION } from '../ui/motion.js';
import { initSelectionLens, syncSelectionLens } from '../ui/selection-lens.js';
import { requirePro, renderPremium } from '../ui/premium.js';
import { haptic } from '../ui/haptics.js';
import { requestDeviceTilt, disableDeviceTilt } from '../ui/ambient.js';

let currentTab = 'style', saveError = false, tiltPending = false, tiltStatus = '';
let tiltRequest = 0;
const tabs = ['style', 'background', 'effects'], motions = ['calm', 'standard', 'expressive'];
const palettes = new WeakMap();
const applied = new WeakMap();
function shiftedTone([r,g,b,a], angle) {
  const values=[r/255,g/255,b/255], maximum=Math.max(...values), minimum=Math.min(...values), delta=maximum-minimum;
  const light=(maximum+minimum)/2;
  let hue=delta===0?0:maximum===values[0]?((values[1]-values[2])/delta)%6:maximum===values[1]?(values[2]-values[0])/delta+2:(values[0]-values[1])/delta+4;
  hue=((hue*60+angle)%360+360)%360;
  const saturation=delta===0?0:delta/(1-Math.abs(2*light-1));
  const chroma=(1-Math.abs(2*light-1))*saturation, x=chroma*(1-Math.abs((hue/60)%2-1)), m=light-chroma/2;
  const rgb=hue<60?[chroma,x,0]:hue<120?[x,chroma,0]:hue<180?[0,chroma,x]:hue<240?[0,x,chroma]:hue<300?[x,0,chroma]:[chroma,0,x];
  return `rgba(${rgb.map(value=>Math.round((value+m)*255)).join(',')},${a})`;
}
export function applyAppearance() {
  const settings=effectiveAppearance(state.appearance, proAccess()), root=document.documentElement;
  const signature=JSON.stringify(settings);
  if(applied.get(root)===signature)return settings;
  const palette=ACCENTS[settings.accent], timing=appearanceTimings(settings);
  if(palettes.get(root)!==settings.accent){
    for(const [name,rgb] of Object.entries(APPEARANCE_TONES)) root.style.setProperty(name,shiftedTone(rgb,palette.hue-ACCENTS.cyan.hue));
    palettes.set(root,settings.accent);
  }
  root.dataset.appearanceReady=''; root.dataset.background=settings.background; root.dataset.backgroundEffect=settings.effect;
  root.dataset.backgroundAnimation=settings.animation?'on':'off'; root.dataset.parallax=settings.parallax?'on':'off';
  root.dataset.glints=settings.glints?'on':'off'; root.dataset.uiMotion=settings.motion;
  const factor={calm:1.12,standard:1,expressive:1.18}[settings.motion];
  const variables={ '--accent':palette.color, '--accent-strong':palette.strong, '--accent-rgb':appearanceRGB(settings.accent).join(' '), '--accent-wash':`rgba(${appearanceRGB(settings.accent).join(',')},.13)`,
    '--appearance-glass-alpha':String(1-settings.transparency/100), '--appearance-sheet-alpha':String(Math.min(.97,1-settings.transparency/100+.31)), '--appearance-glow-alpha':String(settings.glow/100*.26), '--glass-glow':`rgba(${appearanceRGB(settings.accent).join(',')},${settings.glow/100*.26})`,
    '--wallpaper-dim':String(settings.dimming/100), '--wallpaper-blur':`${settings.blur/10}px`, '--effect-opacity':String(settings.intensity/100), '--background-duration':`${timing.background}ms`, '--background-far-duration':`${timing.background*1.2}ms`, '--background-near-duration':`${timing.background*1.5}ms`,
    '--shine-duration':`${timing.glint}ms`, '--shine-tile-duration':`${timing.glint*5/3}ms`, '--shine-scanner-duration':`${timing.glint*17/12}ms`, '--shine-outline-duration':`${timing.glint*4}ms`, '--shine-edge-duration':`${timing.glint*23/6}ms`, '--shine-button-duration':`${timing.glint*25/6}ms`,
    '--motion-press':`${140*factor}ms`, '--motion-screen':`${420*factor}ms`, '--motion-panel':`${300*factor}ms`, '--motion-close':`${200*factor}ms`,
  };
  for(const [name,value] of Object.entries(variables))root.style.setProperty(name,value);
  applied.set(root,signature);
  document.dispatchEvent(new CustomEvent('fitcat:appearance',{detail:settings}));
  return settings;
}
function setSaveStatus(){
  $('appearanceSaveStatus').dataset.error=String(saveError);
  $('appearanceSaveText').textContent=t(saveError?'save_error':'appearance_saved');
}
export function renderAppearance() {
  const settings=applyAppearance();
  $('appearanceThemeName').textContent=t('appearance_theme_'+settings.theme);
  $('appearancePreviewPro').hidden=!proAccess();
  for(const button of $('appearancePage').querySelectorAll('[data-appearance-kind]')){
    const kind=button.dataset.appearanceKind, chosen=settings[kind]===button.dataset.value;
    button.setAttribute('aria-pressed',String(chosen)); button.classList.toggle('active',chosen);
  }
  for(const input of $('appearancePage').querySelectorAll('[data-appearance-range]')){
    const key=input.dataset.appearanceRange, value=settings[key];input.value=value;
    const min=Number(input.getAttribute('min')),max=Number(input.getAttribute('max'));
    input.style.setProperty('--range-fill',`${(value-min)/(max-min)*100}%`);
    const output=$(input.id+'Output'); output.textContent=`${number(value)}%`;input.setAttribute('aria-valuetext',output.textContent);
    input.disabled=(['speed','intensity'].includes(key)&&!settings.animation)||(key==='depth'&&!settings.parallax)||(key==='glintSpeed'&&!settings.glints);
  }
  for(const input of $('appearancePage').querySelectorAll('[data-appearance-toggle]'))input.checked=settings[input.dataset.appearanceToggle];
  for(const button of $('appearancePage').querySelectorAll('.appearance-effect-tile'))button.disabled=!settings.animation;
  $('appearancePage').querySelector('.appearance-effect-grid').classList.toggle('is-disabled',!settings.animation);
  $('appearanceMotionNotice').hidden=!reducedMotion();
  $('appearanceProNotice').hidden=state.appearance.background===settings.background&&state.appearance.theme===settings.theme;
  const supported=Boolean(window.DeviceOrientationEvent);
  $('appearanceEnableTilt').hidden=!supported; $('appearanceEnableTilt').disabled=!settings.parallax||tiltPending||tiltStatus==='appearance_gyro_on';
  $('appearanceTiltStatus').hidden=!(tiltStatus||(!supported&&settings.parallax));
  $('appearanceTiltStatus').textContent=t(tiltStatus||'appearance_gyro_unavailable');
  $('appearanceReset').disabled=isDefaultAppearance(state.appearance)&&tiltStatus!=='appearance_gyro_on'&&!tiltPending;
  setSaveStatus();
  const control=$('appearanceMotionControl'), index=motions.indexOf(settings.motion);
  if(control.style.getPropertyValue('--lens-index')!==String(index))syncSelectionLens(control);
}
function update(patch){
  const next=normalizeAppearance({...state.appearance,...patch});
  if(JSON.stringify(next)===JSON.stringify(state.appearance))return;
  try{setAppearance(next);saveError=false;if(patch.parallax===false){tiltRequest++;tiltPending=false;tiltStatus='';disableDeviceTilt();}}
  catch(error){console.error(error);saveError=true;}
  renderAppearance();
}
function choose(kind,value){
  if(kind==='theme'){
    if(!Object.hasOwn(THEME_PRESETS,value))return;
    if(PREMIUM_THEMES.includes(value)&&!requirePro('appearance'))return;
    const preset=THEME_PRESETS[value];
    update(Object.fromEntries(['theme','accent','background','transparency','glow','dimming','blur','effect'].map(key=>[key,preset[key]])));return;
  }
  const choices={accent:Object.keys(ACCENTS),background:BACKGROUNDS,effect:EFFECTS,motion:motions};
  if(!choices[kind]?.includes(value))return;
  if(kind==='background'&&PREMIUM_BACKGROUNDS.includes(value)&&!requirePro('appearance'))return;
  update({[kind]:value,...(['accent','background'].includes(kind)?{theme:'custom'}:{})});
}
function selectTab(value){
  if(!tabs.includes(value))return;
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
  onAction('appearanceBack',()=>showScreen('settingsPage',{x:-20,y:0,duration:MOTION.screen}));
  onAction('appearanceTab',button=>selectTab(button.dataset.value));
  onAction('appearanceChoice',button=>choose(button.dataset.appearanceKind,button.dataset.value));
  onAction('resetAppearance',()=>{
    try{setAppearance(APPEARANCE_DEFAULTS);tiltRequest++;tiltPending=false;disableDeviceTilt();tiltStatus='';saveError=false;renderAppearance();toast(t('appearance_reset_done'));}
    catch(error){console.error(error);saveError=true;setSaveStatus();}
  });
  for(const name of ['input','change'])$('appearancePage').addEventListener(name,event=>{
    const input=event.target;
    if(input.dataset.appearanceRange){
      const key=input.dataset.appearanceRange,value=Number(input.value);
      if(typeof APPEARANCE_DEFAULTS[key]!=='number'||!Number.isFinite(value))return;
      update({[key]:value,...(['transparency','glow','dimming','blur'].includes(key)?{theme:'custom'}:{})});
    }else if(input.dataset.appearanceToggle){const key=input.dataset.appearanceToggle;if(typeof APPEARANCE_DEFAULTS[key]==='boolean')update({[key]:input.checked});}
  });
  initSelectionLens($('appearanceTabs'),{padding:4,getIndex:()=>tabs.indexOf(currentTab),onSelect:index=>{haptic();selectTab(tabs[index]);},isEnabled:()=>document.body.dataset.screen==='appearancePage'});
  initSelectionLens($('appearanceMotionControl'),{padding:4,getIndex:()=>motions.indexOf(effectiveAppearance(state.appearance,proAccess()).motion),onSelect:index=>{haptic();choose('motion',motions[index]);},isEnabled:()=>document.body.dataset.screen==='appearancePage'&&currentTab==='style'});
  $('appearanceTabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const index=event.key==='Home'?0:event.key==='End'?2:(tabs.indexOf(currentTab)+(event.key==='ArrowRight'?1:-1)+3)%3;
    selectTab(tabs[index]);$('appearance'+tabs[index][0].toUpperCase()+tabs[index].slice(1)+'Tab').focus({preventScroll:true});
  });
  onAction('appearanceTilt',async()=>{
    if(tiltPending||!state.appearance.parallax)return;tiltPending=true;renderAppearance();
    const request=++tiltRequest;
    try{const granted=await requestDeviceTilt();if(request===tiltRequest)tiltStatus=granted?'appearance_gyro_on':'appearance_gyro_denied';}
    catch{if(request===tiltRequest)tiltStatus='appearance_gyro_unavailable';}
    finally{if(request===tiltRequest){tiltPending=false;renderAppearance();}}
  });
  const motionPreference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionChanged=()=>{ $('appearanceMotionNotice').hidden=!reducedMotion(); };
  if(motionPreference?.addEventListener)motionPreference.addEventListener('change',motionChanged);
  document.addEventListener('fitcat:screen',event=>{if(event.detail==='appearancePage'){renderAppearance();renderPremium();$('appearanceTitle').focus({preventScroll:true});}});
  renderAppearance();selectTab('style');
}
