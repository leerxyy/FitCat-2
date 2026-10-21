export const BASIC_SOUND_STYLES = Object.freeze(['glass', 'drop', 'velvet', 'spark', 'pulse', 'air']);
export const PREMIUM_SOUND_STYLES = Object.freeze(['suede', 'felt', 'silk', 'warm', 'tick', 'graphite', 'wood', 'paper', 'porcelain', 'matte', 'stone', 'crystal', 'frost', 'thin']);
export const SOUND_STYLES = Object.freeze([...BASIC_SOUND_STYLES, ...PREMIUM_SOUND_STYLES]);
export const SOUND_DEFAULTS = Object.freeze({ soundEnabled: false, soundStyle: 'glass', soundVolume: 25 });
export const soundURL = style => new URL(`../../assets/audio/${SOUND_STYLES.includes(style) ? style : 'glass'}.wav`, import.meta.url).href;

function normalize(value = {}) {
  return {
    soundEnabled: value.soundEnabled === true,
    soundStyle: SOUND_STYLES.includes(value.soundStyle) ? value.soundStyle : 'glass',
    soundVolume: typeof value.soundVolume === 'number' && Number.isFinite(value.soundVolume) ? Math.round(Math.max(0, Math.min(100, value.soundVolume))) : 25,
  };
}

// One context, a small decoded-buffer cache, and no timers/audio at startup.
// The caller invokes play directly inside a genuine interaction on iOS.
export function createSoundPlayer({ AudioContext: Context, fetch: request = globalThis.fetch, hidden = () => false, notify = () => {}, now = () => performance.now(), canUse = () => true, initial = SOUND_DEFAULTS, setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout } = {}) {
  let settings = normalize(initial), context, master, serial = 0, disposed = false;
  let lastClick = -Infinity, lastPreview = false, idleTimer = 0, pending = 0, suspending = null;
  const bytes = new Map(), decoded = new Map(), voices = new Set();
  const supported = () => typeof Context === 'function';
  const announce = (state, style = settings.soundStyle) => notify({ state, style });
  function cancelIdle() { clearTimer(idleTimer); idleTimer = 0; }
  function sleepWhenIdle() {
    cancelIdle();
    if (disposed || pending || voices.size || !context || context.state !== 'running') return;
    const audio = context;
    // A live but silent AudioContext needlessly keeps the audio engine awake.
    // The next genuine tap resumes synchronously before fetching/decoding.
    idleTimer = setTimer(() => {
      idleTimer = 0;
      if (disposed || pending || voices.size || context !== audio || audio.state !== 'running') return;
      try {
        const task = Promise.resolve(audio.suspend()).catch(() => {});
        suspending = task; task.finally(() => { if (suspending === task) suspending = null; });
      } catch { /* Audio remains usable on platforms without suspend support. */ }
    }, 1200);
  }
  const load = style => {
    if (!bytes.has(style)) {
      const task = Promise.resolve().then(() => request(soundURL(style))).then(response => {
        if (!response.ok) throw new Error('audio_unavailable');
        return response.arrayBuffer();
      }).catch(error => { bytes.delete(style); throw error; });
      bytes.set(style, task);
    }
    return bytes.get(style);
  };
  function retire(voice) {
    if (!voices.delete(voice)) return;
    try {
      const time = context.currentTime;
      voice.gain.gain.cancelScheduledValues(time);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
      voice.gain.gain.linearRampToValueAtTime(0, time + .008);
      voice.source.stop(time + .01);
    } catch { /* A voice may have finished between the event and cleanup. */ }
  }
  function stop() {
    serial++;
    for (const voice of [...voices]) retire(voice);
    announce('idle');
    sleepWhenIdle();
  }
  function configure(value) {
    const next = normalize(value);
    if (next.soundEnabled === settings.soundEnabled && next.soundStyle === settings.soundStyle && next.soundVolume === settings.soundVolume) return;
    const invalidated = next.soundStyle !== settings.soundStyle || (settings.soundEnabled && !next.soundEnabled) || next.soundVolume === 0;
    settings = next;
    if (invalidated) stop();
    if (master && context?.state !== 'closed') master.gain.setTargetAtTime(settings.soundVolume / 100, context.currentTime, .012);
  }
  function prepare() {
    cancelIdle();
    if (!context || context.state === 'closed') {
      context = new Context({ latencyHint: 'interactive' });
      master = context.createGain(); master.gain.value = settings.soundVolume / 100;
      master.connect(context.destination);
    }
    // Call resume synchronously before loading/decoding; preserve user activation.
    return context.state === 'running' && !suspending ? Promise.resolve() : Promise.resolve(context.resume());
  }
  async function play({ style = settings.soundStyle, preview = false, allowed = () => true } = {}) {
    if (!preview && !canUse(style)) style = SOUND_DEFAULTS.soundStyle;
    if (disposed || !supported() || hidden() || !allowed() || settings.soundVolume === 0 || (!preview && !settings.soundEnabled) || !SOUND_STYLES.includes(style)) return false;
    const started = now();
    if (!preview && !lastPreview && started - lastClick < 65) return false;
    lastClick = started; lastPreview = preview;
    const ticket = ++serial;
    pending++;
    try {
      const ready = prepare();
      await ready;
      if (!decoded.has(style)) {
        const task = load(style).then(buffer => context.decodeAudioData(buffer.slice(0))).catch(error => { decoded.delete(style); throw error; });
        decoded.set(style, task);
      }
      const buffer = await decoded.get(style);
      if (ticket !== serial || disposed || hidden() || !allowed() || context.state !== 'running' || settings.soundVolume === 0 || (!preview && (!settings.soundEnabled || !canUse(style))) || (!preview && now() - started > 900)) return false;
      for (const voice of [...voices]) retire(voice);
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.connect(gain); gain.connect(master);
      const time = context.currentTime;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(1, time + .003);
      gain.gain.setValueAtTime(1, time + Math.max(.004, buffer.duration - .012));
      gain.gain.linearRampToValueAtTime(0, time + buffer.duration);
      const voice = { source, gain }; voices.add(voice);
      source.onended = () => {
        voices.delete(voice); source.disconnect(); gain.disconnect();
        if (ticket === serial) announce('idle', style);
        sleepWhenIdle();
      };
      source.start(time); announce('playing', style); return true;
    } catch {
      if (ticket === serial && !disposed && !hidden()) announce('unavailable', style);
      return false;
    } finally {
      pending--; sleepWhenIdle();
    }
  }
  async function suspend() {
    stop(); cancelIdle();
    try { if (context && context.state !== 'closed') await context.suspend(); } catch { /* Retry on the next real interaction. */ }
  }
  return {
    supported, configure, play, stop, suspend,
    stopPreview() { if (lastPreview) stop(); },
    preload(style = settings.soundStyle) { return supported() && SOUND_STYLES.includes(style) ? load(style).then(() => true, () => false) : Promise.resolve(false); },
    dispose() { disposed = true; stop(); cancelIdle(); bytes.clear(); decoded.clear(); try { void context?.close()?.catch(() => {}); } catch {} },
  };
}
