import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscription, formatPromo, PROMO_CODE, PROMO_DURATION, SUBSCRIPTION_KEY } from '../js/core/subscription.js';

const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
};
const now = Date.UTC(2026, 9, 17, 11, 25);

test('promo activates exactly eight full days, including the expiry boundary', () => {
  const service = createSubscription(memory());
  assert.equal(service.status(now).plan, 'basic');
  const active = service.redeem(PROMO_CODE, now);
  assert.equal(active.plan, 'pro'); assert.equal(active.remainingDays, 8);
  assert.equal(active.expiresAt, now + 8 * 24 * 60 * 60 * 1000);
  assert.equal(service.status(now + PROMO_DURATION - 1).active, true);
  assert.equal(service.status(now + PROMO_DURATION).plan, 'basic');
  assert.equal(service.status(now + PROMO_DURATION).remainingDays, 0);
  assert.equal(service.status(now - 1).active, false);
});

test('reload keeps the original expiry and a used code cannot extend or restart it', () => {
  const storage = memory(); const first = createSubscription(storage).redeem(PROMO_CODE, now);
  const second = createSubscription(storage);
  assert.equal(second.status(now + 86400000).expiresAt, first.expiresAt);
  assert.throws(() => second.redeem(PROMO_CODE, now + 86400000), /promo_used/);
  assert.throws(() => second.redeem(PROMO_CODE, first.expiresAt + 1), /promo_used/);
  assert.equal(JSON.parse(storage.getItem(SUBSCRIPTION_KEY)).expiresAt, first.expiresAt);
});

test('two open tabs observe an earlier redemption before accepting a code', () => {
  const storage = memory(); const a = createSubscription(storage); const b = createSubscription(storage);
  a.redeem(PROMO_CODE, now);
  assert.throws(() => b.redeem(PROMO_CODE, now + 1), /promo_used/);
  assert.equal(b.status(now + 1).active, true);
});

test('typing, lower case and pasted spaces or Unicode dashes normalize without accepting different codes', () => {
  assert.match(PROMO_CODE, /^[A-Z]{4}-\d{4}-[A-Z]{4}-[A-Z]{2}-\d[A-Z]$/);
  assert.equal(formatPromo('fc at 0826 prox vi 8d'), PROMO_CODE);
  assert.equal(formatPromo('fcat–0826–prox–vi–8d'), PROMO_CODE);
  const service = createSubscription(memory());
  assert.throws(() => service.redeem('FCAT-0826-PROX-VI-9D', now), /promo_invalid/);
  assert.throws(() => service.redeem('ФCAT-0826-PROX-VI-8D', now), /promo_format/);
  assert.throws(() => service.redeem('FCAT-0826', now), /promo_format/);
  assert.equal(service.status(now).active, false);
  assert.equal(service.redeem('fcat0826proxvi8d', now).active, true);
});

test('a failed storage write never grants an unsaved subscription', () => {
  const storage = memory(); storage.setItem = () => { throw new Error('quota'); };
  const service = createSubscription(storage);
  assert.throws(() => service.redeem(PROMO_CODE, now), /quota/);
  assert.equal(service.status(now).active, false); assert.equal(service.status(now).redeemed, false);
});

test('malformed or forged-duration local records do not produce unlimited PRO+', () => {
  const storage = memory();
  for (const raw of ['broken', 'null', '{"version":1}', JSON.stringify({ version: 1, campaign: 'launch-8days-v1', activatedAt: now, expiresAt: now + PROMO_DURATION * 100 })]) {
    storage.setItem(SUBSCRIPTION_KEY, raw);
    assert.equal(createSubscription(storage).status(now).plan, 'basic');
  }
  assert.equal(createSubscription(null).status(now).plan, 'basic');
});
