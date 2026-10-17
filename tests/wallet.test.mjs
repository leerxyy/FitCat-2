import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWallet, WALLET_KEY, COIN_PROMO_AMOUNT, addCalendarMonths, SUBSCRIPTION_PRICES, discountPercent } from '../js/core/wallet.js';
import { createSubscription, PROMO_CODE } from '../js/core/subscription.js';

// This fixture uses a DIFFERENT hash. It is not a working promo code in the app.
const fixture = 'TEST-0123-COIN-AA-1B';
const config = { promoHash: createHash('sha256').update(fixture).digest('hex') };
const now = Date.UTC(2026, 9, 17, 12, 0);
const memory = () => {
  const map = new Map();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key,String(value)), removeItem: key => map.delete(key) };
};

test('wallet starts empty, credits 99999 once and does not store the entered code', async () => {
  const storage = memory(); const wallet = createWallet(storage, config);
  assert.equal(wallet.snapshot().balance, 0); assert.equal(wallet.snapshot().entries.length, 0);
  const credited = await wallet.redeem(fixture.toLowerCase().replaceAll('-', ''), now);
  assert.equal(credited.balance, 99999); assert.equal(credited.entries[0].amount, COIN_PROMO_AMOUNT);
  assert.equal(storage.getItem(WALLET_KEY).includes(fixture), false);
  assert.equal(createWallet(storage, config).snapshot().balance, 99999);
  await assert.rejects(wallet.redeem(fixture, now + 1), /wallet_promo_used/);
  assert.equal(wallet.snapshot().entries.length, 1);
});

test('wrong and incomplete codes do not add funds or create a transaction', async () => {
  const storage = memory(); const wallet = createWallet(storage, config);
  await assert.rejects(wallet.redeem('TEST', now), /promo_format/);
  await assert.rejects(wallet.redeem('TEST-0123-COIN-AA-2B', now), /promo_invalid/);
  assert.equal(storage.getItem(WALLET_KEY), null);
});

test('concurrent redemption from two wallet instances credits only once', async () => {
  const storage = memory(); const a = createWallet(storage, config); const b = createWallet(storage, config);
  const results = await Promise.allSettled([a.redeem(fixture, now), b.redeem(fixture, now)]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(a.snapshot().balance, 99999); assert.equal(a.snapshot().entries.length, 1);
});

test('the three approved prices, strike-through baselines and discounts are exact', () => {
  assert.deepEqual(Object.values(SUBSCRIPTION_PRICES).map(term => [term.months, term.old, term.price, discountPercent(term)]), [[1,229,29,87],[3,687,649,6],[12,2499,1999,20]]);
});

test('purchases debit the correct amounts and add calendar months to remaining PRO+', async () => {
  const storage = memory(); const wallet = createWallet(storage, config); await wallet.redeem(fixture, now);
  await wallet.purchase('1', { now, operationId: 'first' });
  assert.equal(wallet.snapshot().balance, 99970); assert.equal(wallet.status(now).expiresAt, Date.UTC(2026,10,17,12));
  await wallet.purchase('3', { now, operationId: 'second' });
  assert.equal(wallet.snapshot().balance, 99321); assert.equal(wallet.status(now).expiresAt, Date.UTC(2027,1,17,12));
  await wallet.purchase('12', { now, operationId: 'third' });
  assert.equal(wallet.snapshot().balance, 97322); assert.equal(wallet.status(now).expiresAt, Date.UTC(2028,1,17,12));
  assert.deepEqual(wallet.snapshot().entries.map(entry => entry.amount), [99999,-29,-649,-1999]);
  assert.equal(wallet.status(wallet.status(now).expiresAt).plan, 'basic');
  assert.equal(wallet.snapshot().balance, 97322); // Expiry never causes another debit.
});

test('calendar months clamp month ends and leap days', () => {
  assert.equal(addCalendarMonths(Date.UTC(2027,0,31,10,15),1), Date.UTC(2027,1,28,10,15));
  assert.equal(addCalendarMonths(Date.UTC(2028,1,29,10,15),12), Date.UTC(2029,1,28,10,15));
});

test('a remaining eight-day legacy promotion is kept when buying a month', async () => {
  const storage = memory(); const legacy = createSubscription(storage); legacy.redeem(PROMO_CODE, now);
  const wallet = createWallet(storage, config); await wallet.redeem(fixture, now);
  await wallet.purchase('1', { now });
  assert.equal(wallet.status(now).expiresAt, addCalendarMonths(legacy.status(now).expiresAt,1));
});

test('one purchase request id cannot debit twice or be reused for a different period', async () => {
  const storage = memory(); const wallet = createWallet(storage, config); await wallet.redeem(fixture, now);
  await wallet.purchase('1', { now, operationId: 'same' }); await wallet.purchase('1', { now, operationId: 'same' });
  assert.equal(wallet.snapshot().balance, 99970); assert.equal(wallet.snapshot().entries.length, 2);
  await assert.rejects(wallet.purchase('12', { now, operationId: 'same' }), /wallet_invalid_purchase/);
  await assert.rejects(wallet.purchase('__proto__', { now }), /wallet_invalid_purchase/);
});

test('concurrent spending cannot overdraw a small balance', async () => {
  const storage = memory(); const a = createWallet(storage, { ...config, promoAmount: 30 });
  await a.redeem(fixture, now); const b = createWallet(storage, config);
  const results = await Promise.allSettled([a.purchase('1', { now }), b.purchase('1', { now })]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(a.snapshot().balance, 1); assert.equal(a.snapshot().entries.length, 2);
});

test('a failed write never consumes the code, spends coins or grants unsaved PRO+', async () => {
  const storage = memory(); const wallet = createWallet(storage, config); const write = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(wallet.redeem(fixture,now), /quota/); assert.equal(wallet.snapshot().balance,0);
  storage.setItem = write; await wallet.redeem(fixture,now); const before = storage.getItem(WALLET_KEY);
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(wallet.purchase('1',{now}), /quota/);
  assert.equal(storage.getItem(WALLET_KEY),before); assert.equal(wallet.status(now).active,false);
});

test('a corrupt ledger is reported instead of silently resetting or granting money', () => {
  const storage = memory(); storage.setItem(WALLET_KEY, JSON.stringify({version:1,balance:99999,entries:[],redeemed:[],subscription:null}));
  assert.throws(() => createWallet(storage).snapshot(), /wallet_corrupt/);
  assert.equal(JSON.parse(storage.getItem(WALLET_KEY)).balance,99999);
});
