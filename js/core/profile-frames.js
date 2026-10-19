import { LIMITED_PROFILE_FRAMES, LIMITED_COSMETIC_PRICE, limitedAsset } from './profile-limited.js';
// One-time cosmetics. PRO+ never grants or removes these entitlements.
export const COLLECTIBLE_FRAME_PRICE = 229;
export const COLLECTIBLE_PROFILE_FRAMES = Object.freeze(['dragon', 'chronos', 'eclipse', 'frostcrown', 'phoenix']);
export const PURCHASABLE_PROFILE_FRAMES = Object.freeze([...COLLECTIBLE_PROFILE_FRAMES, ...LIMITED_PROFILE_FRAMES]);
export const profileFramePrice = frame => LIMITED_PROFILE_FRAMES.includes(frame) ? LIMITED_COSMETIC_PRICE : COLLECTIBLE_PROFILE_FRAMES.includes(frame) ? COLLECTIBLE_FRAME_PRICE : null;
export const collectibleFrameOwned = (frame, owned = []) => PURCHASABLE_PROFILE_FRAMES.includes(frame) && Array.isArray(owned) && owned.includes(frame);
export function collectibleFrameAsset(frame, thumbnail = false) {
  if (LIMITED_PROFILE_FRAMES.includes(frame)) return limitedAsset('frame', frame, thumbnail);
  return COLLECTIBLE_PROFILE_FRAMES.includes(frame) ? `assets/profile-frames/${frame}${thumbnail ? '-thumb' : ''}.webp` : '';
}
