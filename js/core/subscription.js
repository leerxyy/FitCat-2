// Plus owns only access dates. Old records are read solely to preserve access.
export const SUBSCRIPTION_KEY = 'fitcat_plus_v1';
export const LEGACY_SUBSCRIPTION_KEY = 'fitcat_subscription_v1';
export const LEGACY_WALLET_KEY = 'fitcat_wallet_v1';
export const LEGACY_DURATION = 8 * 86400000;
const DEVELOPER_GRANT_ID = 'fitcat-developer-grant-v1';
const validTime = value => Number.isSafeInteger(value) && value > 0 && value < 8640000000000000;
const empty = () => ({ version: 1, activatedAt: null, expiresAt: null, developerGrantedAt: null });
const read = (storage, key) => { try { return JSON.parse(storage?.getItem(key)); } catch { return null; } };

export function validateSubscription(value) {
  if (value?.version !== 1) throw new Error('invalid_subscription');
  const blank = value.activatedAt === null && value.expiresAt === null;
  if (!blank && (!validTime(value.activatedAt) || !validTime(value.expiresAt) || value.expiresAt <= value.activatedAt)) throw new Error('invalid_subscription');
  if (value.developerGrantedAt != null && (!validTime(value.developerGrantedAt) || blank || value.developerGrantedAt >= value.expiresAt)) throw new Error('invalid_subscription');
  return { version: 1, activatedAt: value.activatedAt, expiresAt: value.expiresAt, developerGrantedAt: value.developerGrantedAt ?? null };
}

export function legacySubscription(record) {
  if (record?.version !== 1 || record.campaign !== 'launch-8days-v1' || record.expiresAt - record.activatedAt !== LEGACY_DURATION) return null;
  try { return validateSubscription(record); } catch { return null; }
}

export function legacyPaidSubscription(value, { strict = false } = {}) {
  const invalid = () => { if (strict) throw new Error('invalid_subscription'); return null; };
  if (value?.version !== 1 || !Number.isSafeInteger(value.balance) || value.balance < 0 || !Array.isArray(value.entries) || !Array.isArray(value.redeemed)) return invalid();
  if (value.subscription == null) return empty();
  try {
    const grant = value.entries.find(entry => entry?.id === DEVELOPER_GRANT_ID && entry.kind === 'developer' && validTime(entry.at));
    return validateSubscription({ version: 1, ...value.subscription, developerGrantedAt: grant?.at ?? null });
  } catch { return invalid(); }
}

export function readSubscription(storage) {
  const current = read(storage, SUBSCRIPTION_KEY);
  try { if (current) return validateSubscription(current); } catch { /* Preserve valid earlier access after a damaged write. */ }
  const records = [legacySubscription(read(storage, LEGACY_SUBSCRIPTION_KEY)), legacyPaidSubscription(read(storage, LEGACY_WALLET_KEY))].filter(record => record?.expiresAt);
  if (!records.length) return empty();
  const selected = records.reduce((latest, record) => record.expiresAt > latest.expiresAt ? record : latest);
  return { ...selected, developerGrantedAt: records.find(record => record.developerGrantedAt)?.developerGrantedAt ?? null };
}

export function migrateSubscription(storage) {
  const record = readSubscription(storage);
  if (!record.expiresAt) return record;
  try { const current = read(storage, SUBSCRIPTION_KEY); if (current) { validateSubscription(current); return record; } } catch { /* Repair a damaged new record from its valid predecessor. */ }
  // Retain the legacy data. A failed migration must never revoke existing access.
  try { storage.setItem(SUBSCRIPTION_KEY, JSON.stringify(record)); } catch { /* Read-only fallback still provides its original expiry. */ }
  return record;
}

export function createSubscription(storage = globalThis.localStorage) {
  let record;
  function reload() { record = readSubscription(storage); return status(); }
  function status(now = Date.now()) {
    const active = Boolean(record.expiresAt && now >= record.activatedAt && now < record.expiresAt);
    return { plan: active ? 'plus' : 'basic', active, redeemed: Boolean(record.expiresAt), activatedAt: record.activatedAt, expiresAt: record.expiresAt,
      remainingDays: active ? Math.ceil((record.expiresAt - now) / 86400000) : 0 };
  }
  reload();
  return { reload, status, snapshot: () => ({ ...record }) };
}

let localQueue = Promise.resolve();
export function withSubscriptionLock(work) {
  if (globalThis.window && globalThis.navigator?.locks?.request) return navigator.locks.request(SUBSCRIPTION_KEY, work);
  const task = localQueue.then(work); localQueue = task.catch(() => {}); return task;
}
export function addCalendarMonths(timestamp, months) {
  const date = new Date(timestamp), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return date.getTime();
}
