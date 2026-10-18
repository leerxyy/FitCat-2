// Bump VERSION after editing any file in APP_FILES, then deploy the whole folder.
const VERSION = '3.16.1-r1';
const PREFIX = `fitcat-${encodeURIComponent(self.registration.scope)}-`;
const CACHE = PREFIX + VERSION;
const ROOT = self.registration.scope;
const APP_FILES = [
  'styles/appearance.css', 'js/core/appearance.js', 'js/core/appearance-copy.js', 'js/core/appearance-tones.js', 'js/features/appearance.js', 'styles/appearance-palette.css', 'styles/appearance-backgrounds.css',
  'assets/backgrounds/aurora-thumb.webp', 'assets/backgrounds/aurora.webp', 'assets/backgrounds/coast-thumb.webp', 'assets/backgrounds/coast.webp', 'assets/backgrounds/cosmos-thumb.webp', 'assets/backgrounds/cosmos.webp', 'assets/backgrounds/dunes-thumb.webp', 'assets/backgrounds/dunes.webp', 'assets/backgrounds/forest-thumb.webp', 'assets/backgrounds/forest.webp', 'assets/backgrounds/glacier-thumb.webp', 'assets/backgrounds/glacier.webp', 'assets/backgrounds/mountains-thumb.webp', 'assets/backgrounds/mountains.webp',
  'assets/effects/waves.svg', 'assets/effects/aurora-light.svg', 'assets/effects/iridescence.svg',
  'styles/selection-lens.css', 'js/ui/selection-lens.js',
  'styles/today.css', 'js/ui/nav-lens.js',
  'styles/settings.css', 'js/core/settings-copy.js',
  'styles/photo-crop.css', 'js/core/photo-crop.js', 'js/ui/photo-editor.js',
  './', 'index.html', 'manifest.webmanifest',
  'styles/tokens.css', 'styles/base.css', 'styles/components.css', 'styles/layout.css', 'styles/glass.css', 'styles/motion.css', 'styles/subscription.css', 'styles/wallet.css', 'styles/startup.css', 'styles/smart-water.css', 'styles/interactions.css', 'styles/premium.css', 'styles/refinement.css', 'styles/activity.css', 'styles/statistics.css', 'styles/friends.css', 'styles/profile.css',
  'js/app.js', 'js/core/weather.js', 'js/core/weather-copy.js', 'js/core/access.js', 'js/core/premium-copy.js', 'js/core/activity-copy.js', 'js/core/statistics-copy.js', 'js/core/friends-copy.js', 'js/core/profile-copy.js', 'js/core/store.js', 'js/core/math.js', 'js/core/i18n.js', 'js/core/translations.js', 'js/core/loader.js', 'js/core/subscription.js', 'js/core/subscription-copy.js', 'js/core/wallet.js', 'js/core/wallet-copy.js',
  'js/ui/components.js', 'js/ui/sheets.js', 'js/ui/profile-swipe.js', 'js/ui/premium.js', 'js/ui/navigation.js', 'js/ui/pwa.js', 'js/ui/motion.js', 'js/ui/surfaces.js', 'js/ui/ambient.js', 'js/ui/dock.js', 'js/ui/viewport.js', 'js/ui/orientation.js', 'js/ui/boot.js', 'js/ui/haptics.js',
  'js/features/diary.js', 'js/features/profile.js', 'js/features/preferences.js', 'js/features/weather.js', 'js/features/subscription.js', 'js/features/wallet.js',
  'js/features/products.js', 'js/features/analytics.js', 'js/features/gestures.js', 'js/services/friends.js', 'js/services/weather.js',
  'assets/icons/logo.svg', 'assets/icons/sprite.svg', 'assets/icons/app-icon.svg', 'assets/icons/coin.svg', 'assets/icons/coin-art.png',
  'assets/icons/app-icon-192.png', 'assets/icons/app-icon-512.png',
  'assets/icons/apple-touch-icon.png', 'assets/icons/maskable-icon-512.png', 'assets/icons/logo-white-512.png',
];
const urls = APP_FILES.map(file => new URL(file, ROOT).href);
const allowed = new Set(urls);
const indexURL = new URL('index.html', ROOT).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })));
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return;
  // Firebase, food APIs and third-party libraries keep their normal network behavior.
  const canonical = url.origin + url.pathname;
  if (request.mode !== 'navigate' && !allowed.has(canonical)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request.mode === 'navigate' ? indexURL : canonical);
    return cached || fetch(request);
  })());
});
