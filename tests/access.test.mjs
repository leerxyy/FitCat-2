import test from 'node:test';
import assert from 'node:assert/strict';
import { hasProAccess, mayCreateTemplate } from '../js/core/access.js';
import { loadState, state, targets, persist } from '../js/core/store.js';
import { createWallet, WALLET_KEY } from '../js/core/wallet.js';
import { SUBSCRIPTION_KEY, LEGACY_DURATION } from '../js/core/subscription.js';

function storage() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; }
const now = Date.now();
function legacy(adapter) { adapter.setItem(SUBSCRIPTION_KEY, JSON.stringify({ version: 1, campaign: 'launch-8days-v1', activatedAt: now - 1000, expiresAt: now - 1000 + LEGACY_DURATION })); }

test('Basic includes three template slots and existing paid/legacy entitlements unlock the extra slots until exact expiry', async () => {
  const adapter = storage();
  assert.equal(hasProAccess(adapter, now), false); assert.equal(mayCreateTemplate(2, adapter, now), true); assert.equal(mayCreateTemplate(3, adapter, now), false);
  legacy(adapter); assert.equal(hasProAccess(adapter, now), true); assert.equal(mayCreateTemplate(100, adapter, now), true);
  assert.equal(hasProAccess(adapter, now - 1000 + LEGACY_DURATION), false);
  adapter.setItem(WALLET_KEY, JSON.stringify({ version: 1, balance: 100, entries: [{ id: 'old-credit', kind: 'promo', amount: 100, at: now, balanceAfter: 100 }], redeemed: [], subscription: null }));
  const wallet = createWallet(adapter); await wallet.purchase('1', { now, operationId: 'test-purchase' });
  const expiry = wallet.status(now).expiresAt;
  assert.equal(hasProAccess(adapter, expiry - 1), true); assert.equal(hasProAccess(adapter, expiry), false);
  assert.equal(wallet.snapshot().balance, 71);
});

test('corrupt wallet data cannot fabricate access, while a valid legacy subscription still works', () => {
  const adapter = storage(); adapter.setItem(WALLET_KEY, 'broken');
  assert.equal(hasProAccess(adapter, now), false); legacy(adapter); assert.equal(hasProAccess(adapter, now), true);
});

test('water uses the base goal in Basic without clearing saved smart-water settings', () => {
  const adapter = storage(); loadState(adapter);
  state.profile = { name: 'Тест', age: 20, gender: 'male', weight: 52, height: 170, goal: 'maintain' };
  Object.assign(state.preferences, { smartWaterEnabled: true, currentTemp: 27, currentSteps: 12800, workoutEnabled: true, workoutIntensity: 'moderate' });
  state.water = 750; persist();
  assert.equal(targets().water, 1820); const settings = JSON.stringify(state.preferences);
  legacy(adapter); assert.equal(targets().water, 2620); adapter.removeItem(SUBSCRIPTION_KEY);
  assert.equal(targets().water, 1820); assert.equal(JSON.stringify(state.preferences), settings); assert.equal(state.water, 750);
});
