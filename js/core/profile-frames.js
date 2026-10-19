// One-time cosmetics. PRO+ never grants or removes these entitlements.
export const COLLECTIBLE_FRAME_PRICE = 229;
export const COLLECTIBLE_PROFILE_FRAMES = Object.freeze(['dragon', 'chronos', 'eclipse', 'frostcrown', 'phoenix']);
export const collectibleFrameOwned = (frame, owned = []) => COLLECTIBLE_PROFILE_FRAMES.includes(frame) && Array.isArray(owned) && owned.includes(frame);
export function collectibleFrameAsset(frame, thumbnail = false) {
  return COLLECTIBLE_PROFILE_FRAMES.includes(frame) ? `assets/profile-frames/${frame}${thumbnail ? '-thumb' : ''}.webp` : '';
}
