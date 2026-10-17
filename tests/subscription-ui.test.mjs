import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, submit, tick } from './dom.mjs';
import { LEGACY_DURATION, SUBSCRIPTION_KEY } from '../js/core/subscription.js';

test('subscription headings focus only after opening; retired codes fail and existing PRO+ survives until expiry', async () => {
  const env = setupDOM({ fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain' }), lastDate: new Date().toDateString() });
  const originalNow = Date.now; let now = originalNow(); Date.now = () => now;
  const $ = id => document.getElementById(id);
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); };
  try {
    await import('../js/app.js');
    let focusCalls = 0; const heading = $('subscriptionTitle');
    const originalFocus = heading.focus.bind(heading);
    heading.focus = options => { assert.equal($('subscriptionDialog').open, true); focusCalls++; originalFocus(options); };
    assert.equal($('subscriptionBadge').classList.contains('is-pro'), false);
    await click('#subscriptionBadge');
    assert.equal($('subscriptionDialog').open, true); assert.equal(document.activeElement, heading); assert.equal(focusCalls, 1);
    assert.equal($('subscriptionCurrentPlanValue').textContent, 'Basic');
    await click('[data-subscription-term="12"]'); assert.equal(document.querySelector('[data-subscription-term="12"]').getAttribute('aria-pressed'), 'true');
    await click('[data-action="subscriptionTerms"]'); await click('[data-action="subscriptionPromo"]');
    assert.equal(document.querySelector('[data-subscription-panel="promo"]').hidden, false);
    $('promoCode').value = ['TEST', '0123', 'CODE', 'AA', '1B'].join('-'); submit($('promoForm')); await tick();
    assert.equal($('promoError').hidden, false); assert.match($('promoError').textContent, /отключены/);
    assert.equal(env.localStorage.getItem(SUBSCRIPTION_KEY), null);
    const record = { version: 1, campaign: 'launch-8days-v1', activatedAt: now, expiresAt: now + LEGACY_DURATION };
    const serialized = JSON.stringify(record); env.localStorage.setItem(SUBSCRIPTION_KEY, serialized);
    const storageEvent = new Event('storage'); storageEvent.key = SUBSCRIPTION_KEY; window.dispatchEvent(storageEvent); await tick();
    assert.equal($('subscriptionBadge').classList.contains('is-pro'), true);
    assert.equal(env.localStorage.getItem(SUBSCRIPTION_KEY), serialized);
    await click('[data-action="subscriptionOverview"]'); assert.equal($('subscriptionActiveDetails').hidden, false);
    now = record.expiresAt; document.dispatchEvent(new Event('visibilitychange')); await tick();
    assert.equal($('subscriptionBadge').classList.contains('is-pro'), false); assert.equal($('subscriptionCurrentPlanValue').textContent, 'Basic');
    assert.equal($('subscriptionExpired').hidden, false);
    await click('[data-action="subscriptionTerms"]'); await click('[data-action="subscriptionPromo"]');
    $('promoCode').value = ['TEST', '0123', 'CODE', 'AA', '1B'].join('-'); submit($('promoForm')); await tick();
    const { state } = await import('../js/core/store.js'); state.preferences.lang = 'en'; document.dispatchEvent(new Event('fitcat:language')); await tick();
    assert.equal($('promoTitle').textContent, 'Enter a promo code'); assert.match($('promoError').textContent, /disabled/);
    assert.equal(env.localStorage.getItem(SUBSCRIPTION_KEY), serialized);
  } finally { Date.now = originalNow; env.restoreTimers(); }
});
