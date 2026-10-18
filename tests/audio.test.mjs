import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSoundPlayer, SOUND_DEFAULTS, SOUND_STYLES, soundURL } from '../js/core/sounds.js';
import { audioFixture, microtasks } from './audio-fixture.mjs';
const enabled = { ...SOUND_DEFAULTS, soundEnabled: true };
function fixture(initial = SOUND_DEFAULTS, options = {}) {
  const f = audioFixture(), events = [];
  const player = createSoundPlayer({ AudioContext: f.Context, fetch: f.fetch, hidden: f.hidden, now: f.now, notify: value => events.push(value), initial, ...options });
  return { ...f, player, events };
}

test('disabled and hidden feedback creates no audio context or autoplay', async () => {
  const f = fixture(); assert.equal(await f.player.play(), false); assert.equal(f.stats.contexts.length, 0);
  f.player.configure(enabled); f.hide(true); assert.equal(await f.player.play({ preview: true }), false); assert.equal(f.stats.contexts.length, 0);
  f.player.dispose();
});
test('explicit preview works while disabled and resumes synchronously inside its call', async () => {
  const f = fixture(); const playing = f.player.play({ style: 'drop', preview: true });
  assert.equal(f.stats.resumes, 1); assert.equal(await playing, true); assert.equal(f.stats.plays[0].buffer.style, 'drop');
  f.advance(); assert.equal(await f.player.play(), false, 'preview must not opt the user in'); f.player.dispose();
});
test('all twenty sounds share one context and cached decoded buffers, replacing previous previews', async () => {
  const f = fixture();
  for (const style of SOUND_STYLES) { assert.equal(await f.player.play({ style, preview: true }), true); f.advance(); }
  assert.equal(f.stats.contexts.length, 1); assert.equal(f.stats.decodes, 20); assert.equal(f.stats.stops.length, 19);
  await f.player.play({ style: 'glass', preview: true }); assert.equal(f.stats.decodes, 20); assert.equal(f.stats.fetches.length, 20);
  f.player.dispose();
});
test('rapid click and submit feedback is deduplicated, and normal later clicks work', async () => {
  const f = fixture(enabled); const first = f.player.play(); assert.equal(await f.player.play(), false); assert.equal(await first, true);
  assert.equal(f.stats.plays.length, 1); f.advance(); assert.equal(await f.player.play(), true); assert.equal(f.stats.plays.length, 2); f.player.dispose();
});
test('volume is independent from opt-in and zero volume cancels active feedback', async () => {
  const f = fixture(enabled); await f.player.play(); f.player.configure({ ...enabled, soundVolume: 80 });
  assert.equal(f.stats.contexts[0].master.gain.value, .8);
  f.player.configure({ ...enabled, soundVolume: 0 }); assert.ok(f.stats.stops.length); f.advance();
  assert.equal(await f.player.play({ preview: true }), false); f.player.configure({ ...enabled, soundVolume: 25 });
  assert.equal(await f.player.play(), true); f.player.dispose();
});
test('turning off while a sample is loading prevents delayed playback', async () => {
  let release;
  const f = fixture(enabled, { fetch: () => new Promise(resolve => { release = resolve; }) });
  const pending = f.player.play(); await microtasks(); f.player.configure(SOUND_DEFAULTS); release(f.response('glass'));
  assert.equal(await pending, false); assert.equal(f.stats.plays.length, 0); f.player.dispose();
});
test('out-of-order preview downloads play only the most recently requested sample', async () => {
  const waiting = new Map();
  const f = fixture(SOUND_DEFAULTS, { fetch: url => new Promise(resolve => waiting.set(/\/([^/]+)\.wav$/.exec(url)[1], resolve)) });
  const old = f.player.play({ style: 'glass', preview: true }); await microtasks();
  const recent = f.player.play({ style: 'air', preview: true }); await microtasks();
  waiting.get('air')(f.response('air')); assert.equal(await recent, true);
  waiting.get('glass')(f.response('glass')); assert.equal(await old, false); assert.deepEqual(f.stats.plays.map(source => source.buffer.style), ['air']); f.player.dispose();
});
test('hidden pages suspend and stop audio, and the next ordinary play resumes after return', async () => {
  const f = fixture(enabled); await f.player.play(); f.hide(true); await f.player.suspend();
  assert.equal(f.stats.suspends, 1); assert.equal(await f.player.play(), false); f.hide(false); f.advance();
  assert.equal(await f.player.play(), true); assert.equal(f.stats.resumes, 2); assert.equal(f.stats.contexts.length, 1); f.player.dispose();
});
test('browser rejection is contained and playback can recover on a later gesture', async () => {
  const f = fixture(enabled); f.stats.resumeError = true; assert.equal(await f.player.play(), false);
  assert.equal(f.events.at(-1).state, 'unavailable'); assert.equal(f.stats.plays.length, 0);
  f.stats.resumeError = false; f.advance(); assert.equal(await f.player.play(), true); f.player.dispose();
});
test('a failed fetch or decode can be retried without poisoning the buffer cache', async () => {
  const f = fixture(enabled); f.stats.decodeError = true; assert.equal(await f.player.play(), false);
  f.stats.decodeError = false; f.advance(); assert.equal(await f.player.play(), true); f.player.dispose();
  let tries = 0;
  const g = fixture(enabled, { fetch: async () => ++tries === 1 ? { ok: false } : { ok: true, arrayBuffer: async () => Uint8Array.of(1).buffer } });
  assert.equal(await g.player.preload(), false); assert.equal(await g.player.play(), true); g.player.dispose();
});
test('canceled interactions and obsolete slow requests stay silent', async () => {
  let allowed = true, release;
  const f = fixture(enabled, { fetch: () => new Promise(resolve => { release = resolve; }) });
  const pending = f.player.play({ allowed: () => allowed }); await microtasks(); allowed = false; release(f.response('glass'));
  assert.equal(await pending, false); f.advance(100); allowed = true;
  assert.equal(await f.player.play({ allowed: () => false }), false); f.player.dispose();
  let done;
  const g = fixture(enabled, { fetch: () => new Promise(resolve => { done = resolve; }) });
  const late = g.player.play(); await microtasks(); g.advance(1000); done(g.response('glass'));
  assert.equal(await late, false); assert.equal(g.stats.plays.length, 0); g.player.dispose();
});
test('preview preload and unsupported browsers never start a context or throw', async () => {
  const f = fixture(); await Promise.all(SOUND_STYLES.map(style => f.player.preload(style))); assert.equal(f.stats.contexts.length, 0); f.player.dispose();
  const unsupported = createSoundPlayer({ initial: enabled }); assert.equal(unsupported.supported(), false);
  assert.equal(await unsupported.play({ preview: true }), false); assert.equal(await unsupported.preload(), false); unsupported.dispose();
});
test('dispose and preview cancellation invalidate unfinished playback', async () => {
  let release; const f = fixture(SOUND_DEFAULTS, { fetch: () => new Promise(resolve => { release = resolve; }) });
  const pending = f.player.play({ preview: true }); await microtasks(); f.player.stopPreview(); release(f.response('glass'));
  assert.equal(await pending, false); f.player.dispose(); assert.equal(f.stats.closes, 1);
  assert.equal(await f.player.play({ preview: true }), false);
});
test('twenty distinct local WAVs are short, fade to zero and leave amplitude headroom', () => {
  const signatures = new Set();
  for (const style of SOUND_STYLES) {
    const bytes = readFileSync(new URL(soundURL(style))); signatures.add(bytes.toString('base64'));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt16LE(22), 1); assert.equal(bytes.readUInt32LE(24), 22050); assert.equal(bytes.readUInt16LE(34), 16);
    assert.ok(bytes.length > 1400 && bytes.length < 5000); assert.equal(bytes.readInt16LE(44), 0); assert.equal(bytes.readInt16LE(bytes.length - 2), 0);
    for (let i = 44; i < bytes.length; i += 2) assert.ok(Math.abs(bytes.readInt16LE(i)) < 20000, style);
  }
  assert.equal(signatures.size, 20);
});
test('paid sounds fall back for ordinary clicks, while everyone may explicitly preview them', async () => {
  const f=fixture({...enabled,soundStyle:'wood'},{canUse:style=>style==='glass'});
  assert.equal(await f.player.play(),true);assert.equal(f.stats.plays.at(-1).buffer.style,'glass');f.advance();
  assert.equal(await f.player.play({style:'wood',preview:true}),true);assert.equal(f.stats.plays.at(-1).buffer.style,'wood');f.player.dispose();
});
test('subscription expiry during loading cancels the pending premium click',async()=>{
 let allowed=true,release;
 const f=fixture({...enabled,soundStyle:'wood'},{canUse:()=>allowed,fetch:()=>new Promise(resolve=>{release=resolve;})});
 const pending=f.player.play();await microtasks();allowed=false;release(f.response('wood'));
 assert.equal(await pending,false);assert.equal(f.stats.plays.length,0);f.player.dispose();
});
