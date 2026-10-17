import { createWallet } from './wallet.js';
import { createSubscription } from './subscription.js';

export const BASIC_TEMPLATE_LIMIT = 3;
export function hasProAccess(storage = globalThis.localStorage, now = Date.now()) {
  try { return createWallet(storage).status(now).active; }
  catch { return createSubscription(storage).status(now).active; }
}
export function mayCreateTemplate(count, storage = globalThis.localStorage, now = Date.now()) {
  return count < BASIC_TEMPLATE_LIMIT || hasProAccess(storage, now);
}
