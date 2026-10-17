import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

test('offline install caches every runtime file under the GitHub Pages subpath', async () => {
  const events = {}; const cacheEntries = new Map(); let claimed = false; let skipped = false; let network = 0;
  const scope = 'https://example.github.io/FitCat-2/'; const cacheNames = [];
  const caches = {
    async open(name) { cacheNames.push(name); return { async addAll(requests) { for (const request of requests) cacheEntries.set(request.url, { url: request.url, cached: true }); }, async match(url) { return cacheEntries.get(url); } }; },
    async keys() { return [cacheNames[0], cacheNames[0] + '-old', 'another-application-cache']; },
    async delete(name) { deleted.push(name); },
  };
  const deleted = [];
  const self = { registration: { scope }, location: { origin: 'https://example.github.io' }, addEventListener(name, handler) { events[name] = handler; }, clients: { async claim() { claimed = true; } }, skipWaiting() { skipped = true; } };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, caches, URL, Request, Set, Promise, fetch: async () => { ++network; return { network: true }; } });
  let pending; events.install({ waitUntil(value) { pending = value; } }); await pending;
  const cachedPaths = new Set([...cacheEntries.keys()].map(url => url.slice(scope.length)));
  const files = path => readdirSync(new URL('../' + path, import.meta.url), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path + entry.name + '/') : [path + entry.name]);
  for (const file of [...files('js/'), ...files('styles/'), ...files('assets/'), 'index.html', 'manifest.webmanifest']) {
    assert.ok(cachedPaths.has(file), `missing offline file: ${file}`); assert.ok(existsSync(new URL('../' + file, import.meta.url)));
  }
  for (const path of cachedPaths) if (path) assert.ok(existsSync(new URL('../' + path, import.meta.url)), path);
  events.activate({ waitUntil(value) { pending = value; } }); await pending;
  assert.equal(claimed, true); assert.equal(deleted.length, 1); assert.ok(!deleted.includes('another-application-cache'));
  let response;
  events.fetch({ request: { method: 'GET', mode: 'navigate', url: scope }, respondWith(value) { response = value; } });
  assert.equal((await response).url, scope + 'index.html');
  events.fetch({ request: { method: 'GET', mode: 'cors', url: scope + 'js/app.js' }, respondWith(value) { response = value; } });
  assert.equal((await response).cached, true); assert.equal(network, 0);
  let intercepted = false;
  for (const url of ['https://world.openfoodfacts.org/api/v0/product/123.json', 'https://example.github.io/AnotherApp/index.html', scope + 'unknown.json']) events.fetch({ request: { method: 'GET', mode: 'cors', url }, respondWith() { intercepted = true; } });
  assert.equal(intercepted, false); assert.equal(skipped, false); events.message({ data: 'SKIP_WAITING' }); assert.equal(skipped, true);
});
