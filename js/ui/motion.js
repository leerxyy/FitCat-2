import { lowDetailMode } from './performance.js';
// Shared timings keep numbers, progress, navigation and list changes in step.
export const EASE = 'cubic-bezier(.22, 1, .36, 1)';
export const MOTION = Object.freeze({ press: 140, screen: 420, panel: 300, close: 200, value: 600, list: 320 });
let batchTime;
const waterWaves = new WeakMap();
const tweens = new WeakMap();
const liveTweens = new Set();
let valueFrame = 0;
const exits = new WeakMap();
const entrances = new WeakMap();
const heights = new WeakMap();
const disclosures = new WeakMap();
let tabTransition;

export function reducedMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function motionFactor() {
  if (lowDetailMode()) return 1;
  return { calm: 1.12, standard: 1, expressive: 1.18 }[globalThis.document?.documentElement?.dataset?.uiMotion] || 1;
}

export function batchMotion(run) {
  const previous = batchTime; batchTime = performance.now();
  try { return run(); } finally { batchTime = previous; }
}

export function tweenValue(element, target, render, { duration = MOTION.value, initial = target } = {}) {
  if (!element) return;
  target = Number.isFinite(Number(target)) ? Number(target) : 0;
  const previous = tweens.get(element);
  if (previous?.target === target) { previous.render = render; render(previous.current); return; }
  if (previous) liveTweens.delete(previous);
  const from = previous?.current ?? initial;
  const job = { current: from, from, target, render, start: batchTime ?? performance.now(), duration: duration * motionFactor() };
  tweens.set(element, job);
  if (reducedMotion() || lowDetailMode() || from === target) { job.current = target; render(target); stopIdleValueFrame(); return; }
  render(from); liveTweens.add(job);
  if (!valueFrame) valueFrame = requestAnimationFrame(tickValues);
}

function stopIdleValueFrame() {
  if (!liveTweens.size && valueFrame) { cancelAnimationFrame(valueFrame); valueFrame = 0; }
}

function tickValues(now) {
  valueFrame = 0;
  for (const job of liveTweens) {
    const progress = Math.max(0, Math.min(1, (now - job.start) / job.duration));
    job.current = job.from + (job.target - job.from) * (1 - (1 - progress) ** 3);
    if (progress === 1) job.current = job.target;
    job.render(job.current);
    if (progress === 1) liveTweens.delete(job);
  }
  if (liveTweens.size && !valueFrame) valueFrame = requestAnimationFrame(tickValues);
}

export function finishValueMotion() {
  if (valueFrame) cancelAnimationFrame(valueFrame); valueFrame = 0;
  for (const job of liveTweens) { job.current = job.target; job.render(job.target); }
  liveTweens.clear();
}

export function animateProgress(element, fraction, kind = 'bar') {
  if (!element) return;
  const target = Math.max(0, Math.min(1, Number(fraction) || 0));
  tweenValue(element, target, value => {
    if (kind === 'ring') element.style.strokeDashoffset = String(100 - value * 100);
    else element.style.setProperty('--fraction', value);
  }, { initial: 0 });
}

export function play(element, keyframes, options = {}) {
  if (!element || reducedMotion() || typeof element.animate !== 'function') return null;
  try {
    const animation = element.animate(keyframes, { duration: MOTION.panel, easing: EASE, fill: 'none', ...options, duration: (options.duration ?? MOTION.panel) * motionFactor() });
    animation.finished.catch(() => {});
    return animation;
  } catch { return null; }
}

export function cancelEntrance(element) {
  entrances.get(element)?.cancel(); entrances.delete(element);
}

function visualState(element, fallback) {
  if (typeof globalThis.getComputedStyle !== 'function') return fallback;
  const style = getComputedStyle(element);
  return { opacity: style.opacity || fallback.opacity, transform: style.transform === 'none' ? 'translate3d(0, 0, 0)' : style.transform || fallback.transform };
}

export function enter(element, { x = 0, y = 10, delay = 0, duration = MOTION.panel } = {}) {
  if (!element) return;
  const distance = lowDetailMode() ? .3 : ({ calm: .45, standard: 1, expressive: 1.3 }[globalThis.document?.documentElement?.dataset?.uiMotion] || 1);
  x *= distance; y *= distance;
  const previous = entrances.get(element);
  const first = previous ? visualState(element, { opacity: 0, transform: `translate3d(${x}px, ${y}px, 0)` }) : { opacity: 0, transform: `translate3d(${x}px, ${y}px, 0)` };
  cancelEntrance(element);
  const animation = play(element, [
    first,
    { opacity: 1, transform: 'translate3d(0, 0, 0)' },
  ], { duration, delay, fill: delay ? 'backwards' : 'none' });
  if (animation) {
    entrances.set(element, animation);
    animation.finished.then(() => { if (entrances.get(element) === animation) entrances.delete(element); }, () => {});
  }
}

export function switchViews(views, index, direction = 1) {
  tabTransition?.(); tabTransition = null;
  const outgoing = views.find(view => view.classList.contains('active') && !view.hidden);
  const incoming = views[index];
  views.forEach((view, i) => {
    view.hidden = i !== index; view.classList.toggle('active', i === index);
    view.inert = i !== index;
    if (i === index) view.removeAttribute('aria-hidden'); else view.setAttribute('aria-hidden', 'true');
  });
  if (!outgoing || outgoing === incoming || reducedMotion() || typeof incoming?.animate !== 'function') return;
  const start = visualState(outgoing, { opacity: 1, transform: 'translateX(0)' });
  cancelEntrance(outgoing);
  const distance = Math.min(64, Math.max(40, (incoming.getBoundingClientRect?.().width || 390) * .14));
  outgoing.hidden = false; outgoing.classList.add('view-leaving');
  const leave = play(outgoing, [start, { opacity: 0, transform: `translateX(${-direction * distance * .7}px)` }], { duration: 320 });
  enter(incoming, { x: direction * distance, y: 0, duration: MOTION.screen });
  const clean = () => { leave?.cancel(); outgoing.hidden = true; outgoing.classList.remove('view-leaving'); };
  tabTransition = clean;
  if (leave) leave.finished.then(() => { if (tabTransition === clean) { clean(); tabTransition = null; } }, () => {});
  else { clean(); tabTransition = null; }
}

export function cancelDialogExit(dialog) {
  const job = exits.get(dialog);
  if (job) { exits.delete(dialog); job.cancel(); dialog.classList.remove('is-closing'); }
}

export function exitDialog(dialog, finish, { fromY = 0 } = {}) {
  if (exits.has(dialog)) return;
  const start = fromY ? { opacity: 1, transform: `translateY(${fromY}px)` } : visualState(dialog, { opacity: 1, transform: 'translateY(0)' });
  cancelEntrance(dialog);
  const animation = play(dialog, [start, { opacity: 0, transform: `translateY(${Math.max(26, fromY + 50)}px)` }], { duration: MOTION.close, easing: 'cubic-bezier(.4, 0, 1, 1)' });
  if (!animation) { finish(); return; }
  dialog.classList.add('is-closing'); exits.set(dialog, animation);
  animation.finished.then(() => {
    if (exits.get(dialog) !== animation) return;
    exits.delete(dialog); dialog.classList.remove('is-closing'); finish();
  }, () => {});
}

export function waterFeedback(wave) {
  if (!wave || reducedMotion() || lowDetailMode() || globalThis.document?.hidden) return;
  if (wave.getClientRects && !wave.getClientRects().length) return;
  if (waterWaves.has(wave)) return;
  const animation = play(wave, [
    { transform: 'translateX(-110%)', opacity: 0 },
    { transform: 'translateX(-25%)', opacity: .7, offset: .35 },
    { transform: 'translateX(110%)', opacity: 0 },
  ], { duration: MOTION.value + 80 });
  if (animation) {
    waterWaves.set(wave, animation);
    const clear = () => { if (waterWaves.get(wave) === animation) waterWaves.delete(wave); };
    animation.finished.then(clear, clear);
  }
}

export function captureLayout(container) {
  if (reducedMotion() || lowDetailMode() || typeof container?.getBoundingClientRect !== 'function' || !container.getClientRects().length) return null;
  const snapshot = { height: container.getBoundingClientRect().height, nodes: new Map() };
  container.querySelectorAll('[data-motion-key]').forEach(node => {
    if (node.getClientRects().length) snapshot.nodes.set(node.dataset.motionKey, node.getBoundingClientRect());
  });
  heights.get(container)?.cancel();
  return snapshot;
}

export function animateList(container, snapshot, highlightId = '') {
  if (!snapshot || reducedMotion()) return;
  const items = [...container.querySelectorAll('[data-motion-key]')].filter(node => node.getClientRects().length);
  const current = new Map(items.map(node => [node.dataset.motionKey, node.getBoundingClientRect()]));
  for (const node of items) {
    const key = node.dataset.motionKey; const before = snapshot.nodes.get(key); const after = current.get(key);
    if (!before) { enter(node, { y: 10, duration: MOTION.list }); continue; }
    let x = before.left - after.left; let y = before.top - after.top;
    const parent = node.parentElement.closest('[data-motion-key]');
    if (parent && snapshot.nodes.has(parent.dataset.motionKey) && current.has(parent.dataset.motionKey)) {
      x -= snapshot.nodes.get(parent.dataset.motionKey).left - current.get(parent.dataset.motionKey).left;
      y -= snapshot.nodes.get(parent.dataset.motionKey).top - current.get(parent.dataset.motionKey).top;
    }
    if (Math.abs(x) + Math.abs(y) > .5) play(node, [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: MOTION.list });
    if (node.dataset.foodId === highlightId) play(node, [{ backgroundColor: 'rgba(22,207,243,.13)' }, { backgroundColor: 'rgba(22,207,243,0)' }], { duration: MOTION.value });
  }
  const height = container.getBoundingClientRect().height;
  if (Math.abs(snapshot.height - height) > 1) {
    const animation = play(container, [{ height: `${snapshot.height}px`, overflow: 'clip' }, { height: `${height}px`, overflow: 'clip' }], { duration: MOTION.list });
    if (animation) heights.set(container, animation);
  }
}

export async function removeRow(row) {
  if (!row || typeof row.getBoundingClientRect !== 'function' || reducedMotion()) return;
  const height = row.getBoundingClientRect().height;
  const animation = play(row, [{ opacity: 1, height: `${height}px`, paddingTop: '13px', paddingBottom: '13px', overflow: 'hidden' }, { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', overflow: 'hidden' }], { duration: MOTION.close, fill: 'forwards' });
  if (!animation) return;
  row.classList.add('is-removing');
  try { await animation.finished; } catch { /* A later render may replace this row. */ }
}

export function toggleMeal(details) {
  const content = details.querySelector('.meal-contents'); const summary = details.querySelector('summary');
  if (!content) return;
  const previous = disclosures.get(details); const open = previous ? !previous.open : !details.open;
  const from = content.getBoundingClientRect?.().height || 0;
  previous?.animation?.cancel(); details.open = true; summary.setAttribute('aria-expanded', String(open));
  const to = open ? content.scrollHeight : 0;
  const animation = play(content, [{ height: `${from}px`, opacity: open ? .5 : 1, overflow: 'hidden' }, { height: `${to}px`, opacity: open ? 1 : 0, overflow: 'hidden' }], { duration: MOTION.panel });
  const job = { open, animation }; disclosures.set(details, job);
  const done = () => { if (disclosures.get(details) === job) { details.open = open; disclosures.delete(details); } };
  if (animation) animation.finished.then(done, () => {}); else done();
}

export function revealRegion(region, visible) {
  const previous = disclosures.get(region); const from = region.hidden ? 0 : region.getBoundingClientRect?.().height || 0;
  if (previous?.open === visible || (!previous && region.hidden === !visible)) return;
  previous?.animation?.cancel(); region.hidden = false;
  const to = visible ? region.scrollHeight : 0;
  const animation = play(region, [{ height: `${from}px`, opacity: visible ? 0 : 1, overflow: 'hidden' }, { height: `${to}px`, opacity: visible ? 1 : 0, overflow: 'hidden' }], { duration: MOTION.panel });
  const job = { open: visible, animation }; disclosures.set(region, job);
  const done = () => { if (disclosures.get(region) === job) { region.hidden = !visible; disclosures.delete(region); } };
  if (animation) animation.finished.then(done, () => {}); else done();
}
