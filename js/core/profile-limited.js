// Permanent, individually owned cosmetics. PRO+ is a separate entitlement.
// "Limited collection" is a collection name, not a fabricated stock counter.
export const LIMITED_COSMETIC_PRICE = 9999;
export const LIMITED_PROFILE_SETS = Object.freeze([
  Object.freeze({ id: 'scarlet', cover: 'scarlet', frame: 'kitsune' }),
  Object.freeze({ id: 'atlantis', cover: 'atlantis', frame: 'pearlguard' }),
  Object.freeze({ id: 'cathedral', cover: 'cathedral', frame: 'seraph' }),
]);
export const LIMITED_PROFILE_COVERS = Object.freeze(LIMITED_PROFILE_SETS.map(set => set.cover));
export const LIMITED_PROFILE_FRAMES = Object.freeze(LIMITED_PROFILE_SETS.map(set => set.frame));
export function limitedAsset(kind, id, thumbnail = false) {
  const ids = kind === 'cover' ? LIMITED_PROFILE_COVERS : kind === 'frame' ? LIMITED_PROFILE_FRAMES : [];
  return ids.includes(id) ? `assets/profile-limited/${kind}s/${id}${thumbnail ? '-thumb' : ''}.webp` : '';
}
