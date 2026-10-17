import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscription, formatPromo, LEGACY_DURATION, SUBSCRIPTION_KEY } from '../js/core/subscription.js';

const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
};
const now = Date.UTC(2026, 9, 17, 11, 25);
const legacy = { version: 1, campaign: 'launch-8days-v1', activatedAt: now, expiresAt: now + LEGACY_DURATION };
const example = ['TEST', '0123', 'CODE', 'AA', '1B'].join('-');

test('previously activated PRO+ keeps its original expiry after embedded codes are removed', () => {
  const storage = memory(); storage.setItem(SUBSCRIPTION_KEY, JSON.stringify(legacy));
  const before = storage.getItem(SUBSCRIPTION_KEY); const service = createSubscription(storage);
  assert.equal(service.status(now).plan, 'pro'); assert.equal(service.status(now).remainingDays, 8);
  assert.equal(service.status(now + LEGACY_DURATION - 1).active, true);
  assert.equal(service.status(now + LEGACY_DURATION).plan, 'basic');
  assert.equal(service.status(now - 1).active, false);
  service.reload(); assert.equal(storage.getItem(SUBSCRIPTION_KEY), before);
});

test('no code can issue, extend or restart PRO+ and rejected entries never write storage', () => {
  const storage = memory(); const service = createSubscription(storage);
  assert.throws(() => service.redeem(example), /promo_unavailable/);
  assert.equal(storage.getItem(SUBSCRIPTION_KEY), null); assert.equal(service.status(now).active, false);
  storage.setItem(SUBSCRIPTION_KEY, JSON.stringify(legacy)); service.reload();
  const before = storage.getItem(SUBSCRIPTION_KEY);
  assert.throws(() => service.redeem(example), /promo_unavailable/);
  assert.equal(storage.getItem(SUBSCRIPTION_KEY), before); assert.equal(service.status(now).expiresAt, legacy.expiresAt);
});

test('code input formatting remains available without activating examples', () => {
  assert.equal(formatPromo('te st 0123 code aa 1b'), example);
  assert.equal(formatPromo(example.toLowerCase().replaceAll('-', '–')), example);
  const service = createSubscription(memory());
  assert.throws(() => service.redeem('TEST-0123'), /promo_format/);
  assert.throws(() => service.redeem(example.toLowerCase()), /promo_unavailable/);
});

test('an existing activation in another tab reloads without resetting its dates', () => {
  const storage = memory(); const service = createSubscription(storage);
  storage.setItem(SUBSCRIPTION_KEY, JSON.stringify(legacy)); service.reload();
  assert.equal(service.status(now + 86400000).expiresAt, legacy.expiresAt);
  assert.equal(service.status(now + 86400000).remainingDays, 7);
});

test('malformed or forged-duration local records do not produce unlimited PRO+', () => {
  const storage = memory();
  for (const raw of ['broken', 'null', '{"version":1}', JSON.stringify({ ...legacy, expiresAt: now + LEGACY_DURATION * 100 })]) {
    storage.setItem(SUBSCRIPTION_KEY, raw);
    assert.equal(createSubscription(storage).status(now).plan, 'basic');
  }
  assert.equal(createSubscription(null).status(now).plan, 'basic');
});
