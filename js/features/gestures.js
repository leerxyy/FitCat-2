import { loadScript } from '../core/loader.js';
import { t } from '../core/i18n.js';
import { $, onAction, toast, closeDialog } from '../ui/components.js';
import { showTab, activeTab } from '../ui/navigation.js';
import { addWater } from './diary.js';
import { openScanner, stopScanner } from './products.js';

let active = false;
let starting = false;
let video;
let stream;
let model;
let cursor;
let frame;
let lastPalm;
let lastPinch = false;
let cooldown = 0;
let pose = '';
let poseFrames = 0;
let handledPose = '';
let generation = 0;

export function stopGestures() {
  const wasActive = active;
  ++generation; active = false; starting = false;
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video?.remove(); video = null;
  cursor?.remove(); cursor = null;
  const previousModel = model; model = null;
  try { Promise.resolve(previousModel?.close()).catch(() => {}); } catch { /* Already closed. */ }
  lastPalm = null; lastPinch = false; pose = ''; poseFrames = 0; handledPose = '';
  $('gestureToggleBtn').setAttribute('aria-pressed', 'false');
  if (wasActive) toast(t('gesture_off'));
}

export async function toggleGestures() {
  if (active || starting) { stopGestures(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { toast(t('camera_unavailable')); return; }
  stopScanner(); closeDialog('scannerModal');
  starting = true; const ticket = ++generation;
  try {
    const Hands = await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js', 'Hands');
    if (ticket !== generation) return;
    const newModel = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}` });
    model = newModel;
    newModel.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: .7, minTrackingConfidence: .6 });
    newModel.onResults(processGestures);
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
    if (ticket !== generation) { newStream.getTracks().forEach(track => track.stop()); return; }
    stream = newStream;
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.hidden = true; video.srcObject = stream;
    document.body.append(video); await video.play();
    if (ticket !== generation) return;
    cursor = document.createElement('div'); cursor.id = 'gesture-cursor'; cursor.hidden = true; document.body.append(cursor);
    active = true; starting = false; $('gestureToggleBtn').setAttribute('aria-pressed', 'true'); toast(t('gesture_on'));
    const loop = async () => {
      if (!active || ticket !== generation) return;
      try { await newModel.send({ image: video }); }
      catch (error) { if (active) { console.warn(error); stopGestures(); toast(t('camera_error')); } return; }
      if (active && ticket === generation) frame = requestAnimationFrame(loop);
    };
    loop();
  } catch (error) { console.warn(error); stopGestures(); toast(t('camera_error')); }
}

function processGestures(results) {
  if (!active) return;
  const hand = results.multiHandLandmarks?.[0];
  if (!hand) { if (cursor) cursor.hidden = true; lastPalm = null; lastPinch = false; handledPose = ''; return; }
  const point = hand[8];
  const x = (1 - point.x) * innerWidth; const y = point.y * innerHeight;
  if (cursor) {
    const layer = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
    if (cursor.parentElement !== layer) layer.append(cursor);
    cursor.hidden = false; cursor.style.left = `${x}px`; cursor.style.top = `${y}px`;
  }
  const pinch = Math.hypot(hand[4].x - point.x, hand[4].y - point.y) < .05;
  if (pinch && !lastPinch) { document.elementFromPoint(x, y)?.closest('button, a, summary, label, input')?.click(); navigator.vibrate?.(8); }
  lastPinch = pinch;
  if (cooldown > 0) --cooldown;
  const palm = hand[0];
  if (lastPalm && !pinch && !cooldown && !document.querySelector('dialog[open]')) {
    const dx = palm.x - lastPalm.x; const dy = palm.y - lastPalm.y;
    if (Math.abs(dx) > .06 && Math.abs(dx) > Math.abs(dy)) {
      showTab(activeTab + (dx < 0 ? 1 : -1)); cooldown = 25; handledPose = 'palm';
    } else if (Math.abs(dy) > .04 && Math.abs(dy) > Math.abs(dx)) window.scrollBy(0, dy * innerHeight * 2);
  }
  lastPalm = { x: palm.x, y: palm.y };
  const tips = [8, 12, 16, 20];
  const open = tips.every(index => hand[index].y < hand[index - 2].y);
  const fist = tips.every(index => hand[index].y > hand[index - 3].y);
  const shaka = hand[20].y < hand[18].y && hand[4].x < hand[3].x && [8, 12, 16].every(index => hand[index].y > hand[index - 2].y);
  const nextPose = shaka ? 'shaka' : fist ? 'fist' : open ? 'palm' : '';
  if (pose === nextPose) ++poseFrames; else { pose = nextPose; poseFrames = 0; }
  if (!nextPose) handledPose = '';
  if (poseFrames < 8 || !nextPose || handledPose === nextPose || pinch) return;
  handledPose = nextPose;
  if (nextPose === 'palm' && !document.querySelector('dialog[open]')) showTab(0);
  if (nextPose === 'shaka') addWater(200);
  if (nextPose === 'fist') openScanner();
}

export function initGestures() {
  onAction('toggleGestures', toggleGestures);
  window.toggleGestureControl = toggleGestures;
  document.addEventListener('fitcat:scanner', () => { if (active || starting) stopGestures(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (active || starting)) stopGestures(); });
  window.addEventListener('pagehide', () => { if (active || starting) stopGestures(); });
}
