import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScript, fetchJSON } from '../js/core/loader.js';

test('library loader resolves an existing global without inserting a script', async () => {
  globalThis.ExistingTestLibrary = { ready: true };
  assert.equal(await loadScript('existing.js', 'ExistingTestLibrary'), globalThis.ExistingTestLibrary);
  delete globalThis.ExistingTestLibrary;
});
test('library loader supports the Firebase database predicate and deduplicates requests', async () => {
  let inserted = 0; let loaded;
  globalThis.document = { createElement: () => ({ remove() {} }), head: { append(element) { ++inserted; loaded = element; } } };
  globalThis.testFirebase = {};
  const first = loadScript('database-test.js', () => globalThis.testFirebase?.database);
  const second = loadScript('database-test.js', () => globalThis.testFirebase?.database);
  assert.equal(first, second); assert.equal(inserted, 1);
  const database = () => 'connected'; globalThis.testFirebase.database = database; loaded.onload();
  assert.equal(await first, database);
  delete globalThis.testFirebase; delete globalThis.document;
});
test('a failed script can be retried instead of leaving a rejected cached promise', async () => {
  let element; let inserted = 0;
  globalThis.document = { createElement: () => ({ remove() {} }), head: { append(value) { element = value; ++inserted; } } };
  const first = loadScript('retry-test.js', 'RetryTestLibrary'); element.onerror(); await assert.rejects(first, /library_unavailable/);
  const second = loadScript('retry-test.js', 'RetryTestLibrary');
  globalThis.RetryTestLibrary = {}; element.onload(); await second; assert.equal(inserted, 2);
  delete globalThis.RetryTestLibrary; delete globalThis.document;
});
test('already cancelled product search performs no request', async () => {
  const controller = new AbortController(); controller.abort();
  const original = globalThis.fetch; globalThis.fetch = () => { throw new Error('must not fetch'); };
  try { await assert.rejects(fetchJSON('search', 500, { signal: controller.signal }), { name: 'AbortError' }); }
  finally { globalThis.fetch = original; }
});
test('HTTP errors and malformed responses are reported to the caller', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503 }); await assert.rejects(fetchJSON('search'), /http_503/);
    globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }); await assert.rejects(fetchJSON('search'), /bad json/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ products: [] }) }); assert.deepEqual(await fetchJSON('search'), { products: [] });
  } finally { globalThis.fetch = original; }
});
