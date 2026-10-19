import { formatPromo, createSubscription } from './subscription.js';
import { PURCHASABLE_PROFILE_COVERS, LEGACY_CITY_COVERS, canonicalCityCover, profileCoverPrice } from './profile-cities.js';
import { PURCHASABLE_PROFILE_FRAMES, profileFramePrice } from './profile-frames.js';
import { LIMITED_PROFILE_COVERS } from './profile-limited.js';

export const WALLET_KEY = 'fitcat_wallet_v1';
export const SUBSCRIPTION_PRICES = Object.freeze({
  '1': Object.freeze({ months: 1, old: 229, price: 29 }),
  '3': Object.freeze({ months: 3, old: 687, price: 649 }),
  '12': Object.freeze({ months: 12, old: 2499, price: 1999 }),
});
const FORMAT = /^[A-Z]{4}-\d{4}-[A-Z]{4}-[A-Z]{2}-\d[A-Z]$/;
let localQueue = Promise.resolve();

export const discountPercent = term => Math.round((term.old - term.price) / term.old * 100);
export function addCalendarMonths(timestamp, months) {
  const date = new Date(timestamp); const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}
const empty = () => ({ version: 1, balance: 0, entries: [], redeemed: [], subscription: null });
const validTime = value => Number.isSafeInteger(value) && value > 0 && value < 8640000000000000;
export function validateWallet(value) {
  if (value?.version !== 1 || !Number.isSafeInteger(value.balance) || value.balance < 0 || !Array.isArray(value.entries) || !Array.isArray(value.redeemed)) throw new Error('wallet_corrupt');
  let balance = 0; const ids = new Set(), covers = new Set(), frames = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry.id !== 'string' || ids.has(entry.id) || !validTime(entry.at)
      || !['promo', 'subscription', 'profile-cover', 'profile-frame'].includes(entry.kind) || !Number.isSafeInteger(entry.amount) || entry.amount === 0
      || (entry.kind === 'promo' ? entry.amount < 0 : entry.amount > 0)) throw new Error('wallet_corrupt');
    if (entry.kind === 'profile-cover') {
      if ((!PURCHASABLE_PROFILE_COVERS.includes(entry.cover) && !LEGACY_CITY_COVERS.includes(entry.cover)) || covers.has(entry.cover)
        || (LIMITED_PROFILE_COVERS.includes(entry.cover) && entry.amount !== -profileCoverPrice(entry.cover))) throw new Error('wallet_corrupt');
      covers.add(entry.cover);
    }
    if (entry.kind === 'profile-frame') {
      if (!PURCHASABLE_PROFILE_FRAMES.includes(entry.frame) || frames.has(entry.frame) || entry.amount !== -profileFramePrice(entry.frame)) throw new Error('wallet_corrupt');
      frames.add(entry.frame);
    }
    ids.add(entry.id); balance += entry.amount;
    if (!Number.isSafeInteger(balance) || balance < 0 || entry.balanceAfter !== balance) throw new Error('wallet_corrupt');
  }
  if (balance !== value.balance || value.redeemed.some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('wallet_corrupt');
  if (value.subscription && (!validTime(value.subscription.activatedAt) || !validTime(value.subscription.expiresAt) || value.subscription.expiresAt <= value.subscription.activatedAt)) throw new Error('wallet_corrupt');
  return value;
}
function read(storage) {
  const raw = storage.getItem(WALLET_KEY);
  if (raw == null) return empty();
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('wallet_corrupt'); }
  return validateWallet(value);
}

function defaultLock(work) {
  if (globalThis.window && globalThis.navigator?.locks?.request) return navigator.locks.request(WALLET_KEY, work);
  // Older engines still serialize operations in this tab. No server protection is implied.
  const task = localQueue.then(work); localQueue = task.catch(() => {}); return task;
}

export function createWallet(storage = globalThis.localStorage, { lock = defaultLock } = {}) {
  const snapshot = () => structuredClone(read(storage));
  async function commit(work) {
    return lock(() => {
      const value = read(storage);
      const result = work(value);
      if (result !== false) storage.setItem(WALLET_KEY, JSON.stringify(value));
      return structuredClone(value);
    });
  }
  async function redeem(code) {
    const normalized = formatPromo(code);
    if (!FORMAT.test(normalized)) throw new Error('promo_format');
    // No embedded code, hash or grant amount remains in this build.
    throw new Error('promo_unavailable');
  }
  async function purchase(period, { now = Date.now(), operationId = crypto.randomUUID() } = {}) {
    const term = Object.hasOwn(SUBSCRIPTION_PRICES, String(period)) ? SUBSCRIPTION_PRICES[String(period)] : null;
    if (!term || !validTime(now) || typeof operationId !== 'string' || !/^[\w-]{1,80}$/.test(operationId)) throw new Error('wallet_invalid_purchase');
    return commit(value => {
      const previous = value.entries.find(entry => entry.id === operationId);
      if (previous) {
        if (previous.kind !== 'subscription' || previous.months !== term.months) throw new Error('wallet_invalid_purchase');
        return false;
      }
      if (value.balance < term.price) throw new Error('wallet_insufficient');
      const legacy = createSubscription(storage).status(now);
      const start = Math.max(now, value.subscription?.expiresAt || 0, legacy.active ? legacy.expiresAt : 0);
      const expiresAt = addCalendarMonths(start, term.months);
      if (!validTime(expiresAt) || expiresAt <= start) throw new Error('wallet_invalid_purchase');
      const balance = value.balance - term.price;
      value.balance = balance;
      value.subscription = { activatedAt: now, expiresAt };
      value.entries.push({ id: operationId, kind: 'subscription', amount: -term.price, months: term.months, at: now, balanceAfter: balance, expiresAt });
    });
  }
  // The debit and entitlement are one ledger write. Retrying an owned cover or
  // the same operation cannot charge again, including from another local tab.
  async function purchaseCover(cover, { now = Date.now(), operationId = crypto.randomUUID() } = {}) {
    if (!PURCHASABLE_PROFILE_COVERS.includes(cover) || !validTime(now) || typeof operationId !== 'string' || !/^[\w-]{1,80}$/.test(operationId)) throw new Error('wallet_invalid_purchase');
    const price = profileCoverPrice(cover);
    return commit(value => {
      const previous = value.entries.find(entry => entry.id === operationId);
      if (previous) {
        if (previous.kind !== 'profile-cover' || canonicalCityCover(previous.cover) !== cover) throw new Error('wallet_invalid_purchase');
        return false;
      }
      if (value.entries.some(entry => entry.kind === 'profile-cover' && canonicalCityCover(entry.cover) === cover)) return false;
      if (value.balance < price) throw new Error('wallet_insufficient');
      value.balance -= price;
      value.entries.push({ id: operationId, kind: 'profile-cover', cover, amount: -price, at: now, balanceAfter: value.balance });
    });
  }
  const ownedCovers = () => [...new Set(snapshot().entries.filter(entry => entry.kind === 'profile-cover').map(entry => canonicalCityCover(entry.cover)))];
  async function purchaseFrame(frame, { now = Date.now(), operationId = crypto.randomUUID() } = {}) {
    if (!PURCHASABLE_PROFILE_FRAMES.includes(frame) || !validTime(now) || typeof operationId !== 'string' || !/^[\w-]{1,80}$/.test(operationId)) throw new Error('wallet_invalid_purchase');
    const price = profileFramePrice(frame);
    return commit(value => {
      const previous = value.entries.find(entry => entry.id === operationId);
      if (previous) {
        if (previous.kind !== 'profile-frame' || previous.frame !== frame) throw new Error('wallet_invalid_purchase');
        return false;
      }
      if (value.entries.some(entry => entry.kind === 'profile-frame' && entry.frame === frame)) return false;
      if (value.balance < price) throw new Error('wallet_insufficient');
      value.balance -= price;
      value.entries.push({ id: operationId, kind: 'profile-frame', frame, amount: -price, at: now, balanceAfter: value.balance });
    });
  }
  const ownedFrames = () => snapshot().entries.filter(entry => entry.kind === 'profile-frame').map(entry => entry.frame);
  function status(now = Date.now()) {
    const paid = snapshot().subscription;
    const legacy = createSubscription(storage).status(now);
    const record = paid && (!legacy.active || paid.expiresAt >= legacy.expiresAt) ? paid : legacy;
    const active = Boolean(record.expiresAt && now >= record.activatedAt && now < record.expiresAt);
    return { plan: active ? 'pro' : 'basic', active, redeemed: Boolean(paid || legacy.redeemed),
      activatedAt: record.activatedAt ?? null, expiresAt: record.expiresAt ?? null,
      remainingDays: active ? Math.ceil((record.expiresAt - now) / 86400000) : 0 };
  }
  return { snapshot, redeem, purchase, purchaseCover, ownedCovers, purchaseFrame, ownedFrames, status };
}
