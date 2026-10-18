import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCosmeticTimeline } from '../js/ui/cosmetic-timeline.js';

function root(animations) {
  let queries = 0;
  return { dataset: {}, getAnimations(options) { queries++; assert.deepEqual(options, { subtree: true }); return animations; }, get queries() { return queries; } };
}
test('the same monotonic phase is shared by newly visible header, profile and preview frames', () => {
  let time = 1000;
  const timeline = createCosmeticTimeline({ now: () => time, seed: 47000 });
  const a = { animationName: 'profile-rim-turn', currentTime: 0 }, b = { animationName: 'profile-crystal-glow', currentTime: 0 };
  timeline.setLive(root([a]), true, 'spectrum'); assert.equal(a.currentTime, 47000);
  time += 3700; timeline.setLive(root([b]), true, 'spectrum'); assert.equal(b.currentTime, 50700);
  assert.equal(timeline.phase(), 50700);
});
test('reopening a hidden frame joins its ongoing phase instead of restarting at zero', () => {
  let time = 0;
  const timeline = createCosmeticTimeline({ now: () => time, seed: 17000 });
  const animation = { animationName: 'profile-rim-turn', currentTime: 0 }, node = root([animation]);
  timeline.setLive(node, true, 'aurora'); assert.equal(animation.currentTime, 17000);
  timeline.setLive(node, false, 'aurora'); assert.equal(node.dataset.live, 'false'); assert.equal(node.queries, 1);
  animation.currentTime = 0; time = 4500;
  timeline.setLive(node, true, 'aurora'); assert.equal(animation.currentTime, 21500); assert.equal(node.dataset.live, 'true');
});
test('ordinary rerenders do not seek an already-running frame or do additional style flushes', () => {
  let time = 0;
  const timeline = createCosmeticTimeline({ now: () => time, seed: 23000 });
  const animation = { animationName: 'profile-rim-turn', currentTime: 0 }, node = root([animation]);
  timeline.setLive(node, true, 'orbit'); animation.currentTime = 23500;
  for (let i = 0; i < 100; i++) { time += 16; timeline.setLive(node, true, 'orbit'); }
  assert.equal(node.queries, 1); assert.equal(animation.currentTime, 23500);
});
test('a changed material joins the existing clock while unrelated entrance animations retain their timing', () => {
  let time = 0;
  const timeline = createCosmeticTimeline({ now: () => time, seed: 10000 });
  const css = { animationName: 'profile-rim-turn', currentTime: 0 }, entrance = { currentTime: 80 };
  const unrelated = { animationName: 'fitcat-choice-glint', currentTime: 300 };
  const node = root([css, entrance, unrelated]); timeline.setLive(node, true, 'ice');
  time = 2100; timeline.setLive(node, true, 'spectrum');
  assert.equal(css.currentTime, 12100); assert.equal(entrance.currentTime, 80); assert.equal(unrelated.currentTime, 300);
});
test('inactive cosmetics do no animation API work and an unsupported animation API is harmless', () => {
  const timeline = createCosmeticTimeline({ now: () => 0, seed: 5000 });
  const node = root([]);
  for (let i = 0; i < 50; i++) timeline.setLive(node, false, 'cosmos');
  assert.equal(node.queries, 0);
  assert.doesNotThrow(() => timeline.setLive({ dataset: {} }, true, 'cosmos'));
  assert.doesNotThrow(() => timeline.setLive({ dataset: {}, getAnimations() { throw new TypeError('unsupported options'); } }, true, 'cosmos'));
});
test('one unsupported CSS animation cannot interrupt alignment of the other live layers', () => {
  const timeline = createCosmeticTimeline({ now: () => 0, seed: 6500 });
  const broken = { animationName: 'profile-rim-turn', set currentTime(_) { throw new Error('detached'); } };
  const good = { animationName: 'profile-star-twinkle', currentTime: 0 };
  assert.equal(timeline.synchronize(root([broken, good])), 1); assert.equal(good.currentTime, 6500);
});
test('a backward clock observation cannot reset the visible phase', () => {
  let time = 100;
  const timeline = createCosmeticTimeline({ now: () => time, seed: 7000 });
  time = 500; assert.equal(timeline.phase(), 7400);
  time = 250; assert.equal(timeline.phase(), 7400);
});
test('the night sky has a moderate irregular star field split into four rasterizable animation groups', () => {
  const counts = ['stars.svg', 'stars-2.svg', 'stars-3.svg', 'stars-4.svg'].map(file => {
    const svg = readFileSync(new URL('../assets/profile-effects/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(svg, /<filter|<animate|<script/);
    return [...svg.matchAll(/<circle\b[^>]*fill="#[^"]+"/g)].length;
  });
  assert.equal(counts.reduce((a, b) => a + b, 0), 54); assert.ok(counts.every(n => n >= 8 && n <= 18));
});
