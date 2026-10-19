import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://example.github.io/FitCat-2/';
function harness({ small = false, crypto = webcrypto } = {}) {
  const stores = new Map([['another-application-cache', new Map()]]);
  const fetched = [], deleted = []; let failed = '', corrupt = '', activeFetches = 0, peak = 0;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return { async put(url, response) { map.set(url, response.clone()); }, async match(url) { return map.get(url)?.clone(); } };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { deleted.push(name); return stores.delete(name); },
  };
  const code = small ? source.replace(/const APP_FILES = \[[\s\S]*?\n\];/, "const APP_FILES = ['index.html', 'js/app.js', 'styles/performance.css'];") : source;
  function worker(version) {
    const events = {}; let claimed = false, skipped = false;
    const self = { registration: { scope }, location: { origin: new URL(scope).origin }, addEventListener(name, handler) { events[name] = handler; }, clients: { async claim() { claimed = true; } }, skipWaiting() { skipped = true; } };
    vm.runInNewContext(code.replace("'3.25.0-r1'", `'${version}'`), { self, caches, URL, Request, Uint8Array, Set, Promise, crypto, fetch: async request => {
      fetched.push(request.url); activeFetches++; peak = Math.max(peak, activeFetches);
      try {
        await new Promise(resolve => setImmediate(resolve));
        if (request.url.endsWith(failed) && failed) throw new Error('network failed');
        const name = request.url.slice(scope.length) || 'index.html';
        if (name === corrupt) return new Response('incomplete deployment');
        return new Response(readFileSync(new URL('../' + name, import.meta.url)));
      } finally { activeFetches--; }
    } });
    return {
      async run(name) { let pending; events[name]({ waitUntil(value) { pending = value; } }); return pending; },
      async get(url, mode = 'cors') { let response; events.fetch({ request: { method: 'GET', mode, url }, respondWith(value) { response = value; } }); return response; },
      message() { events.message({ data: 'SKIP_WAITING' }); }, get claimed() { return claimed; }, get skipped() { return skipped; },
    };
  }
  return { worker, stores, fetched, deleted, fail(file) { failed = file; }, corrupt(file) { corrupt = file; }, get peak() { return peak; } };
}

test('offline install covers the entire runtime, bounds concurrency, and reuses byte-identical artwork on update', async () => {
  const h = harness(), first = h.worker('3.25.0-r1'); await first.run('install');
  const firstName = [...h.stores.keys()].find(name => name.endsWith('3.25.0-r1'));
  const entries = h.stores.get(firstName), paths = new Set([...entries.keys()].map(url => url.slice(scope.length)));
  const files = path => readdirSync(new URL('../' + path, import.meta.url), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path + entry.name + '/') : [path + entry.name]);
  for (const file of [...files('js/'), ...files('styles/'), ...files('assets/'), 'index.html', 'manifest.webmanifest']) assert.ok(paths.has(file), `missing offline file: ${file}`);
  for (const path of paths) if (path) assert.ok(existsSync(new URL('../' + path, import.meta.url)), path);
  assert.ok(h.peak <= 4); assert.ok(h.peak > 1);
  const before = h.fetched.length, next = h.worker('3.25.1-test'); await next.run('install');
  assert.equal(h.fetched.length, before, 'unchanged resources need no new network download');
  await next.run('activate'); assert.equal(next.claimed, true); assert.ok(h.deleted.includes(firstName)); assert.ok(h.stores.has('another-application-cache'));
  assert.match(await (await next.get(scope, 'navigate')).text(), /<!doctype html>/i);
  assert.match(await (await next.get(scope + 'js/app.js')).text(), /function start/);
  for (const url of ['https://world.openfoodfacts.org/api/v0/product/123.json', 'https://example.github.io/AnotherApp/index.html', scope + 'unknown.json']) assert.equal(await next.get(url), undefined);
  assert.equal(next.skipped, false); next.message(); assert.equal(next.skipped, true);
});

test('an unchanged filename with different bytes is downloaded and verified', async () => {
  const h = harness({ small: true }); await h.worker('3.25.0-r1').run('install');
  const map = [...h.stores.entries()].find(([key]) => key.endsWith('3.25.0-r1'))[1]; map.set(scope + 'js/app.js', new Response('stale source'));
  h.fetched.length = 0; await h.worker('3.25.1-test').run('install'); assert.deepEqual(h.fetched, [scope + 'js/app.js']);
});

test('a failed incremental install removes only the incomplete cache and retains the last full release', async () => {
  const h = harness({ small: true }); await h.worker('3.25.0-r1').run('install');
  const [oldName, map] = [...h.stores.entries()].find(([key]) => key.endsWith('3.25.0-r1')); map.delete(scope + 'js/app.js'); h.fail('js/app.js');
  await assert.rejects(h.worker('3.25.1-test').run('install'), /network failed/);
  assert.ok(h.stores.has(oldName)); assert.ok(![...h.stores.keys()].some(key => key.endsWith('3.25.1-test'))); assert.ok(h.stores.has('another-application-cache'));
});

test('engines without hashing fetch all assets rather than trusting old filenames', async () => {
  const h = harness({ small: true, crypto: null }); await h.worker('3.25.0-r1').run('install'); h.fetched.length = 0;
  await h.worker('3.25.1-test').run('install'); assert.equal(h.fetched.length, 3);
});
test('a partial network deployment with wrong bytes cannot replace the complete offline cache', async () => {
  const h = harness({ small: true }); await h.worker('3.25.0-r1').run('install');
  const [oldName, map] = [...h.stores.entries()].find(([key]) => key.endsWith('3.25.0-r1')); map.delete(scope + 'js/app.js'); h.corrupt('js/app.js');
  await assert.rejects(h.worker('3.25.1-test').run('install'), /changed during deployment/);
  assert.ok(h.stores.has(oldName)); assert.ok(![...h.stores.keys()].some(key => key.endsWith('3.25.1-test')));
});
