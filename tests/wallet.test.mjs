import test from 'node:test';
import assert from 'node:assert/strict';
import { createWallet, WALLET_KEY, addCalendarMonths, SUBSCRIPTION_PRICES, discountPercent } from '../js/core/wallet.js';
import { createSubscription, LEGACY_DURATION, SUBSCRIPTION_KEY } from '../js/core/subscription.js';

const now = Date.UTC(2026, 9, 17, 12, 0);
const example = ['TEST', '0123', 'CODE', 'AA', '1B'].join('-');
const memory = (balance = 0) => {
  const map = new Map();
  if (balance) map.set(WALLET_KEY, JSON.stringify({ version: 1, balance, entries: [{ id: 'previous-credit', kind: 'promo', amount: balance, at: now, balanceAfter: balance }], redeemed: ['a'.repeat(64)], subscription: null }));
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key,String(value)), removeItem: key => map.delete(key) };
};

test('wallet stays empty and no entry can credit coins after embedded promotions are removed', async () => {
  const storage = memory(); const wallet = createWallet(storage);
  assert.equal(wallet.snapshot().balance, 0);
  await assert.rejects(wallet.redeem(example), /promo_unavailable/);
  await assert.rejects(wallet.redeem('TEST'), /promo_format/);
  assert.equal(storage.getItem(WALLET_KEY), null);
});

test('existing balance, receipts, redeemed markers and paid PRO+ survive code removal unchanged', async () => {
  const storage = memory(99999); const wallet = createWallet(storage);
  await wallet.purchase('12', { now, operationId: 'previous-purchase' });
  const before = storage.getItem(WALLET_KEY); const expected = wallet.snapshot();
  const reloaded = createWallet(storage);
  assert.deepEqual(reloaded.snapshot(), expected);
  assert.equal(reloaded.status(now).active, true);
  await assert.rejects(reloaded.redeem(example), /promo_unavailable/);
  assert.equal(storage.getItem(WALLET_KEY), before);
});

test('the three approved prices, strike-through baselines and discounts are exact', () => {
  assert.deepEqual(Object.values(SUBSCRIPTION_PRICES).map(term => [term.months, term.old, term.price, discountPercent(term)]), [[1,229,29,87],[3,687,649,6],[12,2499,1999,20]]);
});

test('purchases spend existing coins and add calendar months to remaining PRO+', async () => {
  const wallet = createWallet(memory(99999));
  await wallet.purchase('1', { now, operationId: 'first' });
  assert.equal(wallet.snapshot().balance, 99970); assert.equal(wallet.status(now).expiresAt, Date.UTC(2026,10,17,12));
  await wallet.purchase('3', { now, operationId: 'second' });
  assert.equal(wallet.snapshot().balance, 99321); assert.equal(wallet.status(now).expiresAt, Date.UTC(2027,1,17,12));
  await wallet.purchase('12', { now, operationId: 'third' });
  assert.equal(wallet.snapshot().balance, 97322); assert.equal(wallet.status(now).expiresAt, Date.UTC(2028,1,17,12));
  assert.deepEqual(wallet.snapshot().entries.map(entry => entry.amount), [99999,-29,-649,-1999]);
  assert.equal(wallet.status(wallet.status(now).expiresAt).plan, 'basic');
  assert.equal(wallet.snapshot().balance, 97322);
});

test('calendar months clamp month ends and leap days', () => {
  assert.equal(addCalendarMonths(Date.UTC(2027,0,31,10,15),1), Date.UTC(2027,1,28,10,15));
  assert.equal(addCalendarMonths(Date.UTC(2028,1,29,10,15),12), Date.UTC(2029,1,28,10,15));
});

test('previously activated eight-day PRO+ is kept when buying a month', async () => {
  const storage = memory(99999);
  storage.setItem(SUBSCRIPTION_KEY, JSON.stringify({ version: 1, campaign: 'launch-8days-v1', activatedAt: now, expiresAt: now + LEGACY_DURATION }));
  const legacy = createSubscription(storage).status(now); const before = storage.getItem(SUBSCRIPTION_KEY);
  const wallet = createWallet(storage); await wallet.purchase('1', { now });
  assert.equal(wallet.status(now).expiresAt, addCalendarMonths(legacy.expiresAt,1));
  assert.equal(storage.getItem(SUBSCRIPTION_KEY), before);
});

test('one purchase request cannot debit twice or be reused for a different period', async () => {
  const wallet = createWallet(memory(99999));
  await wallet.purchase('1', { now, operationId: 'same' }); await wallet.purchase('1', { now, operationId: 'same' });
  assert.equal(wallet.snapshot().balance, 99970); assert.equal(wallet.snapshot().entries.length, 2);
  await assert.rejects(wallet.purchase('12', { now, operationId: 'same' }), /wallet_invalid_purchase/);
  await assert.rejects(wallet.purchase('__proto__', { now }), /wallet_invalid_purchase/);
});

test('concurrent spending cannot overdraw existing funds', async () => {
  const storage = memory(30); const a = createWallet(storage); const b = createWallet(storage);
  const results = await Promise.allSettled([a.purchase('1', { now }), b.purchase('1', { now })]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(a.snapshot().balance, 1); assert.equal(a.snapshot().entries.length, 2);
});

test('a failed write never spends coins or grants unsaved PRO+', async () => {
  const storage = memory(99999); const wallet = createWallet(storage); const before = storage.getItem(WALLET_KEY);
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(wallet.purchase('1',{now}), /quota/);
  assert.equal(storage.getItem(WALLET_KEY),before); assert.equal(wallet.status(now).active,false);
});

test('a corrupt ledger is reported instead of silently resetting or granting money', () => {
  const storage = memory(); storage.setItem(WALLET_KEY, JSON.stringify({version:1,balance:99999,entries:[],redeemed:[],subscription:null}));
  assert.throws(() => createWallet(storage).snapshot(), /wallet_corrupt/);
  assert.equal(JSON.parse(storage.getItem(WALLET_KEY)).balance,99999);
});
