import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick } from './dom.mjs';

test('swipe sheets and subscription currency survive real UI opens, closes and translations', async t => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }), lastDate: new Date().toDateString() });
  const $ = id => document.getElementById(id);
  try {
    await import('../js/app.js');
    const { openDialog } = await import('../js/ui/components.js');
    const { state } = await import('../js/core/store.js');
    await t.test('the seven named windows have no X, focus their title, and retain an accessible close button', async () => {
      for (const id of ['aboutModal', 'foodEntryModal', 'scannerModal', 'smartWaterModal', 'waterEntryModal', 'subscriptionDialog', 'walletDialog']) {
        const dialog = $(id); openDialog(id); await tick();
        assert.equal(dialog.querySelector('.close-button'), null, id);
        assert.equal(document.activeElement, dialog.querySelector('h2'), id);
        const handle = dialog.querySelector('[data-sheet-handle]'); assert.ok(handle.getAttribute('aria-label'), id);
        handle.click(); await tick(); assert.equal(dialog.open, false, id);
      }
    });
    await t.test('each price keeps its inline coin, valid local gradient references and unchanged amount after redraws', async () => {
      for (const language of ['ru', 'en', 'cn', 'ru']) {
        state.preferences.lang = language; document.dispatchEvent(new Event('fitcat:language')); await tick();
        const terms = document.querySelectorAll('[data-subscription-term]'); assert.equal(terms.length, 3);
        for (const [index, tile] of terms.entries()) {
          const price = tile.querySelector('.subscription-price'); const coin = price.querySelector('svg.coin-icon');
          assert.ok(coin); assert.equal(price.querySelector('img'), null); assert.equal(coin.getAttribute('aria-hidden'), 'true');
          assert.equal(Number(price.querySelector('strong').textContent.replace(/\D/g, '')), [29, 649, 1999][index]);
          for (const node of coin.querySelectorAll('[fill], [stroke]')) for (const key of ['fill', 'stroke']) {
            const id = node.getAttribute(key)?.match(/^url\(#([^)]*)\)$/)?.[1]; if (id) assert.ok($(id), id);
          }
        }
        openDialog('subscriptionDialog'); $('subscriptionDialog').querySelector('[data-sheet-handle]').click(); await tick();
      }
    });
  } finally { env.restoreTimers(); }
});
