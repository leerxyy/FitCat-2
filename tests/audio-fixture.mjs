import { SOUND_STYLES } from '../js/core/sounds.js';

export function audioFixture() {
  const stats = { contexts: [], plays: [], stops: [], fetches: [], resumes: 0, suspends: 0, closes: 0, decodes: 0, resumeError: false, decodeError: false };
  let clock = 100, hidden = false;
  function param(value = 1) {
    return { value, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {} };
  }
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; stats.contexts.push(this); }
    createGain() { const gain = { gain: param(), connect() {}, disconnect() {} }; this.master ??= gain; return gain; }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() { stats.plays.push(this); }, stop() { stats.stops.push(this); }, finish() { this.onended?.(); } };
      return source;
    }
    resume() { stats.resumes++; if (stats.resumeError) return Promise.reject(new Error('NotAllowedError')); this.state = 'running'; return Promise.resolve(); }
    suspend() { stats.suspends++; this.state = 'suspended'; return Promise.resolve(); }
    close() { stats.closes++; this.state = 'closed'; return Promise.resolve(); }
    decodeAudioData(data) { stats.decodes++; return stats.decodeError ? Promise.reject(new Error('decode')) : Promise.resolve({ duration: .12, style: SOUND_STYLES[new Uint8Array(data)[0] - 1] }); }
  }
  const response = style => ({ ok: true, arrayBuffer: async () => Uint8Array.of(SOUND_STYLES.indexOf(style) + 1).buffer });
  const fetch = async url => { const style = /\/([^/]+)\.wav$/.exec(String(url))[1]; stats.fetches.push(style); return response(style); };
  return { stats, Context, fetch, response, now: () => clock, hidden: () => hidden, hide: value => { hidden = value; }, advance: (ms = 100) => { clock += ms; } };
}
export const microtasks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
