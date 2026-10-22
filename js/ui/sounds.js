import { state } from '../core/store.js';
import { createSoundPlayer } from '../core/sounds.js';

let current;
export const soundSupported = () => Boolean(current?.player.supported());
export const playInterfaceSound = options => current?.player.play(options) ?? Promise.resolve(false);
export const pauseInterfaceAudio = () => current?.player.suspend();
export const configureInterfaceAudio = settings => current?.player.configure(settings);

export function initInterfaceAudio() {
  current?.dispose();
  const doc = document, view = window, removers = [];
  const player = createSoundPlayer({
    AudioContext: view.AudioContext || view.webkitAudioContext,
    fetch: (...args) => globalThis.fetch(...args), initial: state.appearance,
    hidden: () => Boolean(doc.hidden),
    notify: detail => doc.dispatchEvent(new CustomEvent('fitcat:audio-status', { detail })),
  });
  const on = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    removers.push(() => target.removeEventListener(name, handler, options));
  };
  const valid = control => control && !control.disabled && control.getAttribute('aria-disabled') !== 'true' && !control.closest('[inert], [hidden], fieldset[disabled], .haptic-bridge');
  on(doc, 'click', event => {
    if (event.isTrusted !== true) return;
    const control = event.target.closest?.('button, summary, input[type="checkbox"], input[type="radio"]');
    if (!valid(control) || control.id === 'settingsSoundEnabled') return;
    // Gesture suppression may cancel the click later in propagation. Check
    // again before starting a source, while resume is called synchronously.
    void player.play({ allowed: () => !event.defaultPrevented });
  }, { capture: true });
  on(doc, 'change', event => {
    if (event.isTrusted !== true) return;
    const input = event.target;
    if (!valid(input)) return;
    if (input.matches('input[type="range"], select')) void player.play();
  });
  on(doc, 'submit', event => { if (event.isTrusted === true) void player.play(); }, { capture: true });
  on(doc, 'fitcat:selection', event => { if (event.detail?.trusted === true) void player.play(); });
  on(doc, 'fitcat:appearance', event => player.configure(event.detail));
  current = { player, dispose() { for (const remove of removers) remove(); player.dispose(); } };
  // Fetch only the selected small local sample; no AudioContext until a tap.
  if (state.appearance.soundEnabled) void player.preload();
  return current;
}
