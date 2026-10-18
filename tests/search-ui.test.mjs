import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('product search keeps local results usable while loading and rejects stale remote replies', async t => {
  const local = { name: 'Овсянка домашняя', kcal: 350, protein: 12, fat: 6, carbs: 62 };
  const env = setupDOM({ fitcat_products: JSON.stringify([local]), smartSearchEnabled: 'true' });
  const { loadState, state } = await import('../js/core/store.js'); loadState();
  const { initActions } = await import('../js/ui/components.js'); initActions();
  const { initProducts } = await import('../js/features/products.js'); initProducts();
  const { openFood } = await import('../js/features/diary.js'); openFood();
  const $ = id => document.getElementById(id);
  const originalFetch = globalThis.fetch; const originalTimeout = globalThis.setTimeout; const originalClear = globalThis.clearTimeout;
  const queued = new Map(); const requests = []; let sequence = 0;
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms !== 400) return originalTimeout(callback, ms, ...args);
    const id = { search: ++sequence }; queued.set(id, callback); return id;
  };
  globalThis.clearTimeout = id => { if (!queued.delete(id)) originalClear(id); };
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url: String(url), signal: options.signal, resolve, reject }));
  const input = value => { $('foodName').value = value; $('foodName').dispatchEvent(new Event('input', { bubbles: true })); };
  const search = async value => { input(value); const pending = [...queued.values()]; queued.clear(); for (const callback of pending) void callback(); await tick(); return requests.at(-1); };
  const answer = async (request, name) => { request.resolve({ ok: true, json: async () => ({ products: [{ product_name: name, nutriments: { 'energy-kcal_100g': 120, proteins_100g: 5 } }] }) }); await tick(); await tick(); };
  try {
    await t.test('offline input shows saved products immediately without skeletons or network calls', () => {
      input('Ов'); assert.match($('autocompleteList').textContent, /Овсянка домашняя/);
      assert.equal($('autocompleteList').querySelector('.search-skeleton'), null);
      assert.equal($('foodName').getAttribute('aria-busy'), 'false'); assert.equal(requests.length, 0);
      assert.ok($('searchStatus').textContent.length > 0);
    });
    await t.test('pending skeletons are decorative; successful results replace them and keep the local item', async () => {
      navigator.onLine = true; const request = await search('Ов');
      assert.equal($('autocompleteList').querySelectorAll('.search-skeleton-row').length, 3);
      assert.equal($('autocompleteList').querySelector('.search-skeleton').getAttribute('aria-hidden'), 'true');
      assert.equal($('autocompleteList').querySelectorAll('[data-action="chooseProduct"]').length, 1);
      assert.equal($('foodName').getAttribute('aria-busy'), 'true');
      await answer(request, 'Овсяные хлопья');
      assert.equal($('autocompleteList').querySelector('.search-skeleton'), null);
      assert.equal($('autocompleteList').querySelectorAll('[data-action="chooseProduct"]').length, 2);
      assert.equal($('foodName').getAttribute('aria-busy'), 'false'); assert.equal($('searchStatus').textContent, '');
    });
    await t.test('a late result for an old query cannot overwrite the current query', async () => {
      const old = await search('Рис'); const current = await search('Гречка');
      assert.equal(old.signal.aborted, true);
      await answer(old, 'Рис устаревший'); assert.doesNotMatch($('autocompleteList').textContent, /устаревший/);
      assert.equal($('foodName').getAttribute('aria-busy'), 'true');
      await answer(current, 'Гречка новая'); assert.match($('autocompleteList').textContent, /Гречка новая/);
    });
    await t.test('selecting a local product cancels remote work and preserves the selected form', async () => {
      const request = await search('Ов'); $('autocompleteList').querySelector('[data-action="chooseProduct"]').click(); await tick();
      assert.equal($('foodName').value, local.name); assert.equal($('foodKcal100').value, '350');
      assert.equal(document.activeElement, $('foodWeight')); assert.equal(request.signal.aborted, true);
      await answer(request, 'Поздний ответ'); assert.equal($('autocompleteList').hidden, true);
      assert.equal($('foodName').value, local.name); assert.equal($('foodName').getAttribute('aria-busy'), 'false');
    });
    await t.test('Escape and closing the form clear loading; a new form starts clean', async () => {
      const request = await search('Ов'); const event = new Event('keydown'); event.key = 'Escape'; $('foodName').dispatchEvent(event);
      assert.equal(request.signal.aborted, true); assert.equal($('autocompleteList').hidden, true);
      await answer(request, 'После Escape'); assert.equal($('autocompleteList').hidden, true);
      const closing = await search('Ов'); $('foodEntryModal').close();
      assert.equal(closing.signal.aborted, true); assert.equal($('foodName').getAttribute('aria-busy'), 'false');
      openFood(); await answer(closing, 'После закрытия');
      assert.equal($('foodName').value, ''); assert.equal($('autocompleteList').hidden, true); assert.equal($('searchStatus').textContent, '');
    });
    await t.test('network failure preserves local results and disabling smart search stops pending work', async () => {
      const request = await search('Ов'); request.reject(new TypeError('offline')); await tick();
      assert.match($('autocompleteList').textContent, /Овсянка домашняя/);
      assert.equal($('autocompleteList').querySelector('.search-skeleton'), null); assert.ok($('searchStatus').textContent.length > 0);
      const timedOut = await search('Ов'); timedOut.reject(new DOMException('Timed out', 'AbortError')); await tick();
      assert.equal($('foodName').getAttribute('aria-busy'), 'false'); assert.equal($('autocompleteList').querySelector('.search-skeleton'), null);
      assert.match($('autocompleteList').textContent, /Овсянка домашняя/);
      const pending = await search('Ов'); state.preferences.smartSearchEnabled = false; document.dispatchEvent(new Event('fitcat:change'));
      assert.equal(pending.signal.aborted, true); assert.equal($('autocompleteList').hidden, true);
      await answer(pending, 'После отключения'); assert.equal($('autocompleteList').hidden, true);
      input('Ов'); assert.match($('autocompleteList').textContent, /Овсянка домашняя/); assert.equal(queued.size, 0);
    });
  } finally {
    $('foodEntryModal').close(); globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; env.restoreTimers();
  }
});
