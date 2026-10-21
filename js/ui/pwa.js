import { $ } from './components.js';

export async function initPWA() {
  if (!('serviceWorker' in navigator) || !isSecureContext) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let requestedReload = false;
  try {
    const registration = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url));
    const offerUpdate = () => {
      if (!registration.waiting || !navigator.serviceWorker.controller) return;
      $('updateBanner').hidden = false;
      $('applyUpdate').onclick = () => { requestedReload = true; registration.waiting.postMessage('SKIP_WAITING'); };
    };
    offerUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || (!hadController && !requestedReload)) return;
      reloaded = true; location.reload();
    });
  } catch (error) { console.warn('FitCat offline cache:', error.message); }
}
