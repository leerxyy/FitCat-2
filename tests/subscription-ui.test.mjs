import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, submit, tick } from './dom.mjs';
import { createSubscription, PROMO_CODE, PROMO_DURATION, SUBSCRIPTION_KEY } from '../js/core/subscription.js';

test('Basic → subscription → promo → congratulations → RGB PRO+ → expiry works through real app actions', async () => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }), lastDate: new Date().toDateString() });
  const originalNow = Date.now; let now = originalNow(); Date.now = () => now;
  const $ = id => document.getElementById(id);
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); };
  try {
    await import('../js/app.js');
    assert.equal($('subscriptionBadge').classList.contains('is-pro'), false);
    await click('#subscriptionBadge');
    assert.equal($('subscriptionDialog').open, true); assert.equal($('subscriptionCurrentPlanValue').textContent, 'Basic');
    await click('[data-subscription-term="12"]'); assert.equal(document.querySelector('[data-subscription-term="12"]').getAttribute('aria-pressed'), 'true');
    await click('#subscriptionPurchase');
    assert.equal(document.querySelector('[data-subscription-panel="promo"]').hidden, false);
    $('promoCode').value = 'FCAT-0826-PROX-VI-9D'; submit($('promoForm')); await tick();
    assert.equal($('promoError').hidden, false); assert.match($('promoError').textContent, /не найден/);
    assert.equal(env.localStorage.getItem(SUBSCRIPTION_KEY), null);
    $('promoCode').value = PROMO_CODE.toLowerCase().replaceAll('-', ''); submit($('promoForm')); await tick();
    assert.equal(document.querySelector('[data-subscription-panel="success"]').hidden, false);
    assert.equal($('subscriptionDialog').getAttribute('aria-labelledby'), 'subscriptionSuccessTitle');
    const record = JSON.parse(env.localStorage.getItem(SUBSCRIPTION_KEY));
    assert.equal(record.expiresAt, now + PROMO_DURATION); // Selecting a year must not turn an 8-day promo into a year.
    assert.equal($('subscriptionBadge').classList.contains('is-pro'), false); // Visible reveal waits for closing.
    await click('[data-subscription-panel="success"] [data-close="subscriptionDialog"]');
    assert.equal($('subscriptionDialog').open, false); assert.equal($('subscriptionBadge').classList.contains('is-pro'), true);
    assert.equal(createSubscription(env.localStorage).status(now).active, true);
    await click('#subscriptionBadge');
    assert.equal($('subscriptionCurrentPlanValue').textContent, 'PRO+'); assert.equal($('subscriptionActiveDetails').hidden, false);
    assert.equal($('subscriptionTerms').hidden, true);
    await click('#subscriptionPurchase'); $('promoCode').value = PROMO_CODE; submit($('promoForm')); await tick();
    assert.match($('promoError').textContent, /уже использован/); assert.equal(JSON.parse(env.localStorage.getItem(SUBSCRIPTION_KEY)).expiresAt, record.expiresAt);
    now = record.expiresAt; document.dispatchEvent(new Event('visibilitychange')); await tick();
    assert.equal($('subscriptionBadge').classList.contains('is-pro'), false); assert.equal($('subscriptionCurrentPlanValue').textContent, 'Basic');
    assert.equal($('subscriptionExpired').hidden, false);
    const { state } = await import('../js/core/store.js'); state.preferences.lang = 'en'; document.dispatchEvent(new Event('fitcat:language')); await tick();
    assert.equal($('promoTitle').textContent, 'Enter a promo code'); assert.match($('promoError').textContent, /already redeemed/);
  } finally { Date.now = originalNow; env.restoreTimers(); }
});
