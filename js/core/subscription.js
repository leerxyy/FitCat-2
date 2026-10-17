// Read previously activated local subscriptions without issuing new promotions.
export const SUBSCRIPTION_KEY = 'fitcat_subscription_v1';
export const LEGACY_DURATION = 8 * 24 * 60 * 60 * 1000;
const CAMPAIGN = 'launch-8days-v1';
const SHAPE = /^[A-Z]{4}-\d{4}-[A-Z]{4}-[A-Z]{2}-\d[A-Z]$/;

export function formatPromo(value) {
  const raw = String(value ?? '').toUpperCase().replace(/[\s\u2010-\u2015-]/g, '');
  if (!/^[A-Z0-9]{0,16}$/.test(raw)) return String(value ?? '').toUpperCase();
  let offset = 0;
  return [4, 4, 4, 2, 2].map(size => { const part = raw.slice(offset, offset + size); offset += size; return part; }).filter(Boolean).join('-');
}

export function createSubscription(storage = globalThis.localStorage) {
  let record = null;
  function reload() {
    try {
      const value = JSON.parse(storage.getItem(SUBSCRIPTION_KEY));
      record = value?.version === 1 && value.campaign === CAMPAIGN
        && Number.isSafeInteger(value.activatedAt) && value.activatedAt > 0
        && Number.isSafeInteger(value.expiresAt) && value.expiresAt - value.activatedAt === LEGACY_DURATION
        ? { version: 1, campaign: CAMPAIGN, activatedAt: value.activatedAt, expiresAt: value.expiresAt } : null;
    } catch { record = null; }
    return status();
  }
  function status(now = Date.now()) {
    const active = Boolean(record && now >= record.activatedAt && now < record.expiresAt);
    return { plan: active ? 'pro' : 'basic', active, redeemed: Boolean(record),
      activatedAt: record?.activatedAt ?? null, expiresAt: record?.expiresAt ?? null,
      remainingDays: active ? Math.ceil((record.expiresAt - now) / 86400000) : 0 };
  }
  function redeem(value) {
    const code = formatPromo(value);
    if (!SHAPE.test(code)) throw new Error('promo_format');
    throw new Error('promo_unavailable');
  }
  reload();
  return { status, reload, redeem };
}
