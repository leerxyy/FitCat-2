import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWallet, WALLET_KEY, validateWallet } from '../js/core/wallet.js';
import { CITY_COVER_PRICE, CITY_PROFILE_COVERS } from '../js/core/profile-cities.js';
import { effectiveProfileStyle, profileChoiceAllowed } from '../js/core/profile-style.js';
import { state, loadState, setProfileStyle, exportSnapshot, importSnapshot } from '../js/core/store.js';

const now = Date.UTC(2026, 9, 19, 5);
const profile = { name: 'Meow', age: 20, gender: 'male', height: 165, weight: 52, goal: 'maintain' };
function memory(balance = 2000) {
  const map = new Map([['fitnessProfile', JSON.stringify(profile)]]);
  if (balance) map.set(WALLET_KEY, JSON.stringify({ version: 1, balance, entries: [{ id: 'existing-balance', kind: 'promo', amount: balance, at: now, balanceAfter: balance }], redeemed: [], subscription: null }));
  const writes = [];
  return { map, writes, getItem: key => map.get(key) ?? null, setItem: (key, value) => { writes.push(key); map.set(key, String(value)); }, removeItem: key => map.delete(key) };
}

test('PRO+ alone never unlocks a city, but a paid city works on Basic', () => {
  assert.equal(CITY_COVER_PRICE, 299); assert.equal(CITY_PROFILE_COVERS.length, 4);
  for (const cover of CITY_PROFILE_COVERS) {
    assert.equal(profileChoiceAllowed('cover', cover, true), false);
    assert.equal(profileChoiceAllowed('cover', cover, false, [cover]), true);
    assert.equal(effectiveProfileStyle({ cover, frame: 'jade' }, true).cover, 'mist');
    assert.equal(effectiveProfileStyle({ cover, frame: 'jade' }, false, [cover]).cover, cover);
  }
});
test('the existing ledger gains one atomic paid receipt and permanent cover access', async () => {
  const storage = memory(); const wallet = createWallet(storage);
  const previous = wallet.snapshot(); await wallet.purchaseCover('hongkong', { now, operationId: 'cover-1' });
  assert.deepEqual(storage.writes, [WALLET_KEY]);
  assert.equal(wallet.snapshot().balance, previous.balance - 299);
  assert.deepEqual(wallet.ownedCovers(), ['hongkong']); assert.equal(wallet.status(now).active, false);
  const reloaded = createWallet(storage); assert.deepEqual(reloaded.ownedCovers(), ['hongkong']);
  assert.equal(reloaded.snapshot().entries.at(-1).kind, 'profile-cover');
  assert.deepEqual(reloaded.snapshot().redeemed, previous.redeemed);
});
test('retries, double taps and simultaneous tabs never charge twice for one cover', async () => {
  const storage = memory(600), first = createWallet(storage), second = createWallet(storage);
  await Promise.all([first.purchaseCover('chongqing', { now, operationId: 'same' }), second.purchaseCover('chongqing', { now, operationId: 'other' })]);
  await first.purchaseCover('chongqing', { now, operationId: 'same' });
  assert.equal(first.snapshot().balance, 301); assert.equal(first.snapshot().entries.length, 2);
  await assert.rejects(first.purchaseCover('hongkong', { now, operationId: 'same' }), /wallet_invalid_purchase/);
});
test('different competing purchases share the subscription lock and cannot overdraw', async () => {
  const storage = memory(310), wallet = createWallet(storage);
  const results = await Promise.allSettled([wallet.purchaseCover('dubai', { now }), wallet.purchase('1', { now })]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.ok(wallet.snapshot().balance >= 0); assert.equal(wallet.snapshot().entries.length, 2);
});
test('invalid cities, insufficient balance and failed writes never grant a free entitlement', async () => {
  const storage = memory(298), wallet = createWallet(storage); const previous = storage.getItem(WALLET_KEY);
  await assert.rejects(wallet.purchaseCover('hongkong', { now }), /wallet_insufficient/);
  await assert.rejects(wallet.purchaseCover('__proto__', { now }), /wallet_invalid_purchase/);
  assert.equal(storage.getItem(WALLET_KEY), previous); assert.deepEqual(wallet.ownedCovers(), []);
  const rich = memory(), value = rich.getItem(WALLET_KEY); rich.setItem = () => { throw new Error('quota'); };
  await assert.rejects(createWallet(rich).purchaseCover('hongkong', { now }), /quota/);
  assert.equal(rich.getItem(WALLET_KEY), value); assert.deepEqual(createWallet(rich).ownedCovers(), []);
});
test('expiry, default reset and another subscription purchase leave paid cover ownership intact', async () => {
  const storage = memory(); loadState(storage); const wallet = createWallet(storage);
  await wallet.purchaseCover('moscow', { now }); await wallet.purchase('1', { now });
  const expiry = wallet.status(now).expiresAt;
  assert.equal(wallet.status(expiry).active, false); assert.deepEqual(wallet.ownedCovers(), ['moscow']);
  setProfileStyle({ frame: 'silver', cover: 'moscow' });
  assert.equal(effectiveProfileStyle(state.profileStyle, false, wallet.ownedCovers()).cover, 'moscow');
  setProfileStyle({ frame: 'ice', cover: 'mist' }); loadState(storage); assert.deepEqual(wallet.ownedCovers(), ['moscow']);
});
test('backup carries both the receipt and coins; old backups preserve the current wallet', async () => {
  const storage = memory(); loadState(storage); const wallet = createWallet(storage);
  await wallet.purchaseCover('hongkong', { now }); setProfileStyle({ frame: 'jade', cover: 'hongkong' });
  const backup = structuredClone(exportSnapshot()), recipient = memory(0); loadState(recipient); importSnapshot(backup);
  assert.deepEqual(createWallet(recipient).snapshot(), backup.wallet);
  assert.equal(effectiveProfileStyle(state.profileStyle, false, createWallet(recipient).ownedCovers()).cover, 'hongkong');
  const old = structuredClone(backup); delete old.wallet;
  const before = recipient.getItem(WALLET_KEY); importSnapshot(old); assert.equal(recipient.getItem(WALLET_KEY), before);
});
test('a corrupt receipt or failed restore leaves all current data and purchases intact', async () => {
  const storage = memory(); loadState(storage); await createWallet(storage).purchaseCover('dubai', { now });
  const backup = structuredClone(exportSnapshot()), before = new Map(storage.map);
  const bad = structuredClone(backup); bad.wallet.entries.at(-1).cover = 'unknown';
  assert.throws(() => importSnapshot(bad), /invalid_backup/); assert.deepEqual(storage.map, before);
  const duplicate = structuredClone(backup.wallet); duplicate.entries.push({ ...duplicate.entries.at(-1), id: 'duplicate', balanceAfter: duplicate.balance - 299 }); duplicate.balance -= 299;
  assert.throws(() => validateWallet(duplicate), /wallet_corrupt/);
  const write = storage.setItem; let fail = true;
  storage.setItem = (key, value) => { if (key === WALLET_KEY && fail) { fail = false; throw new Error('quota'); } write(key, value); };
  const update = structuredClone(backup); update.profile.name = 'Changed';
  assert.throws(() => importSnapshot(update), /quota/); assert.deepEqual(storage.map, before); assert.equal(state.profile.name, 'Meow');
});
test('the three offline cloud textures are bounded WebP assets without runtime noise work', () => {
  const folder = new URL('../assets/profile-effects/', import.meta.url);
  for (const name of ['city-cloud-far.webp', 'city-cloud-mid.webp', 'city-cloud-near.webp']) {
    const buffer = readFileSync(new URL(name, folder));
    assert.ok(buffer.length < 100000); assert.equal(buffer.subarray(0, 4).toString(), 'RIFF');
    assert.equal(buffer.subarray(8, 12).toString(), 'WEBP');
  }
});
test('a damaged wallet is reported during export instead of omitting the paid receipts silently', () => {
  const storage = memory(); loadState(storage); const before = structuredClone(state);
  storage.setItem(WALLET_KEY, '{invalid ledger');
  assert.throws(() => exportSnapshot(), /wallet_corrupt/);
  assert.equal(storage.getItem(WALLET_KEY), '{invalid ledger'); assert.deepEqual(state, before);
});
