import { loadScript } from '../core/loader.js';
import { t } from '../core/i18n.js';
import { $, onAction, toast, closeDialog, openDialog, afterDialogClose } from '../ui/components.js';
import { showTab, activeTab, showScreen } from '../ui/navigation.js';
import { addWater } from './diary.js';
import { openScanner, stopScanner } from './products.js';
import { proAccess } from '../core/store.js';
import { requirePro } from '../ui/premium.js';
import { enter } from '../ui/motion.js';
import { lowDetailMode } from '../ui/performance.js';
import { GestureTracker } from '../core/gesture-tracker.js';
import { createVideoInferenceLoop } from '../core/video-inference.js';

let active=false,starting=false,video,stream,model,cursor,inference,generation=0,startTask;
let mode='normal',step=0,advanceTimer,leaveRunning=false,resumeInference;
const tracker=new GestureTracker();
const steps=['tabs','click','scroll'];
function syncControls(){
 $('gestureGuideToggle').checked=active||starting;
 $('gestureCameraStatus').textContent=t(starting?'gesture_camera_connecting':active?'gesture_camera_active':'gesture_camera_idle');
 $('gestureToggleBtn').setAttribute('aria-pressed',String(active));
 $('gestureToggleBtn').setAttribute('aria-busy',String(starting));
 if($('gestureStartTraining'))$('gestureStartTraining').disabled=starting;
}
function showIntro(){
 $('gestureGuideIntro').hidden=false;$('gesturePractice').hidden=true;$('gestureComplete').hidden=true;
 $('gestureGuideTitle').textContent=t('gesture_guide_title');
}
function placeVideo(){
 if(!video)return;
 const preview=mode==='training'&&step<3;
 video.hidden=false;video.classList.toggle('gesture-source',!preview);
 (preview?$('gestureCamera'):document.body).append(video);
 if(!preview&&cursor)cursor.hidden=true;
}
function showStep(index){
 clearTimeout(advanceTimer);step=index;tracker.reset();
 $('gestureGuideIntro').hidden=true;$('gesturePractice').hidden=index>=3;$('gestureComplete').hidden=index<3;
 $('gestureGuideTitle').textContent=t(index>=3?'gesture_complete':'gesture_practice');
 $('gesturePracticeStep').textContent=t('gesture_step').replace('{step}',Math.min(index+1,3));
 $('gesturePracticeTitle').textContent=t('gesture_'+(steps[index]||'click')+'_title');
 $('gesturePracticeHint').textContent=t('gesture_'+(steps[index]||'click')+'_hint');
 $('gesturePracticeTarget').hidden=index!==1;
 $('gesturePracticeDemo').hidden=index!==0;
 $('gestureScrollDemo').hidden=index!==2;
 $('gesturePracticeProgress').querySelectorAll('i').forEach((node,i)=>node.classList.toggle('active',i<=index));
 $('gestureHandStatus').textContent=t('gesture_hand_missing');
 placeVideo();resumeInference?.();
 enter($('gesturePractice'),{y:5});
}
function completeStep(){
 if(mode!=='training'||step>=3||advanceTimer)return;
 $('gesturePracticeProgress').children[step]?.classList.add('complete');
 advanceTimer=setTimeout(()=>{advanceTimer=0;showStep(step+1);},380);
}
export function stopGestures({quiet=false}={}){
 const wasActive=active;
 ++generation;active=false;starting=false;startTask=null;resumeInference=null;inference?.dispose();inference=null;clearTimeout(advanceTimer);advanceTimer=0;
 stream?.getTracks().forEach(track=>track.stop());stream=null;video?.remove();video=null;cursor?.remove();cursor=null;
 const previous=model;model=null;try{Promise.resolve(previous?.close()).catch(()=>{});}catch{}
 tracker.reset();syncControls();
 if($('gestureGuideModal')?.open){showIntro();$('gestureGuideError').hidden=true;}
 if(wasActive&&!quiet)toast(t('gesture_off'));
}
async function startGestures(nextMode='normal'){
 if(!requirePro('gestures')){syncControls();return false;}
 mode=nextMode;
 if(active){placeVideo();tracker.reset();resumeInference?.();return true;}
 if(starting)return startTask;
 if(!navigator.mediaDevices?.getUserMedia){showCameraError();syncControls();return false;}
 stopScanner();closeDialog('scannerModal');starting=true;const ticket=++generation;syncControls();$('gestureGuideError').hidden=true;
 startTask=(async()=>{
  let phase='model';
  try{
   const Hands=await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js','Hands');
   if(ticket!==generation)return false;if(!proAccess()){stopGestures({quiet:true});return false;}
   const instance=new Hands({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`});model=instance;
   instance.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:.7,minTrackingConfidence:.6});instance.onResults(results=>{if(ticket===generation&&model===instance)processGestures(results);});
   phase='camera';const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:24}},audio:false});
   if(ticket!==generation||!proAccess()){camera.getTracks().forEach(track=>track.stop());if(ticket===generation)stopGestures({quiet:true});return false;}
   stream=camera;const element=document.createElement('video');video=element;element.muted=true;element.playsInline=true;element.srcObject=camera;
   placeVideo();await element.play();
   if(ticket!==generation)return false;if(!proAccess()){stopGestures({quiet:true});return false;}
   cursor=document.createElement('div');cursor.id='gesture-cursor';cursor.hidden=true;document.body.append(cursor);
   active=true;starting=false;tracker.reset();syncControls();
   const canInfer=()=>active&&ticket===generation&&!document.hidden&&(mode==='normal'||(mode==='training'&&step<3));
   inference=createVideoInferenceLoop({video:element,canRun:canInfer,interval:()=>lowDetailMode()?80:50,
    process:()=>instance.send({image:element}),
    onError:error=>{if(ticket===generation&&active){console.warn(error);stopGestures({quiet:true});showCameraError();}},view:window});
   resumeInference=()=>inference?.resume();
   resumeInference();return true;
  }catch(error){if(ticket===generation){console.warn(error);stopGestures({quiet:true});showCameraError(error,phase);}return false;}
 })();
 return startTask;
}
function showCameraError(error,phase){
 const key=['NotAllowedError','SecurityError'].includes(error?.name)?'gesture_camera_denied':['NotFoundError','NotReadableError'].includes(error?.name)?'gesture_camera_missing':phase==='model'?'gesture_model_error':'gesture_camera_error';
 $('gestureGuideError').textContent=t(key);$('gestureGuideError').hidden=false;
 if(!$('gestureGuideModal').open)toast(t(key));
}
export async function toggleGestures(){
 if(active||starting){stopGestures();return false;}
 return startGestures('normal');
}
function processGestures(results){
 if(!active||mode==='idle'||$('gestureGuideModal').classList.contains('is-closing')||(mode==='training'&&step>=3))return;
 const detected=tracker.update(results.multiHandLandmarks?.[0]);
 if(!detected){if(cursor)cursor.hidden=true;if(mode==='training'){$('gestureHandStatus').textContent=t('gesture_hand_missing');$('gestureHandStatus').dataset.found='false';}return;}
 const x=detected.pointer.x*innerWidth,y=detected.pointer.y*innerHeight;
 if(cursor){const layer=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;if(cursor.parentElement!==layer)layer.append(cursor);cursor.hidden=false;cursor.style.left=`${x}px`;cursor.style.top=`${y}px`;}
 if(mode==='training'){
  $('gestureHandStatus').textContent=t('gesture_hand_found');$('gestureHandStatus').dataset.found='true';
  if(step===0&&detected.swipe)completeStep();
  if(step===1&&detected.pinchStarted&&document.elementFromPoint(x,y)?.closest('#gesturePracticeTarget'))completeStep();
  if(step===2&&Math.abs(detected.scroll)>.006){$('gestureScrollDemo').scrollTop+=detected.scroll*innerHeight*2;completeStep();}
  return;
 }
 if(detected.pinchStarted)document.elementFromPoint(x,y)?.closest('button, a, summary, label, input')?.click();
 const dialog=document.querySelector('dialog[open]');
 if(detected.swipe&&!dialog&&document.body.dataset.screen==='mainPage')showTab(activeTab+detected.swipe);
 if(detected.scroll)(dialog||$('appScroller'))?.scrollBy?.({top:detected.scroll*innerHeight*1.5,behavior:'auto'});
 if(detected.poseAction==='palm'&&!dialog){showTab(0);if(document.body.dataset.screen!=='mainPage')showScreen('mainPage');}
 if(detected.poseAction==='shaka')addWater(200);
 if(detected.poseAction==='fist')openScanner();
}
function openGuide(){
 if(!requirePro('gestures'))return;
 leaveRunning=false;mode='idle';inference?.pause();if(cursor)cursor.hidden=true;placeVideo();showIntro();syncControls();openDialog('gestureGuideModal');
}
async function train(){
 leaveRunning=false;showStep(0);
 const pending=startGestures('training'),ticket=generation;
 if(!await pending&&ticket===generation&&!active&&!starting)showIntro();
}
function continueWithoutTraining(){
 if(starting)stopGestures({quiet:true});
 leaveRunning=active;mode='normal';tracker.reset();placeVideo();resumeInference?.();
 if(active)afterDialogClose('gestureGuideModal',()=>{showScreen('mainPage');toast(t('gesture_on'));});
 closeDialog('gestureGuideModal');
}
export function renderGestureGuide(){syncControls();if($('gestureGuideModal').open){if(mode==='training')showStep(step);else showIntro();}}
export function initGestures(){
 onAction('toggleGestures',openGuide);window.toggleGestureControl=toggleGestures;
 onAction('startGestureTraining',train);onAction('skipGestureTraining',continueWithoutTraining);onAction('finishGestureTraining',continueWithoutTraining);
 onAction('skipGestureStep',()=>{clearTimeout(advanceTimer);advanceTimer=0;showStep(Math.min(step+1,3));});
 onAction('repeatGestureHint',()=>{tracker.reset();enter($('gesturePracticeHint'),{y:3});});
 onAction('gestureTargetHint',()=>toast(t('gesture_click_hint')));
 $('gestureGuideToggle').addEventListener('change',async event=>{
  if(!event.target.checked)stopGestures();else await startGestures($('gestureGuideModal').open?'idle':'normal');syncControls();
 });
 $('gestureGuideModal').addEventListener('close',()=>{
  clearTimeout(advanceTimer);advanceTimer=0;
  if(leaveRunning||(active&&mode==='idle')){mode='normal';placeVideo();tracker.reset();resumeInference?.();}
  else if(mode==='training'||starting)stopGestures({quiet:true});
  leaveRunning=false;
 });
 document.addEventListener('fitcat:scanner',()=>{if(active||starting)stopGestures();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||starting))stopGestures({quiet:true});});
 window.addEventListener('pagehide',()=>{if(active||starting)stopGestures({quiet:true});});
 syncControls();
}
