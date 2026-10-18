// Stored IDs only: imported profiles never introduce arbitrary URLs or CSS.
export const PROFILE_STYLE_KEY = 'fitcat_profile_style_v1';
export const PROFILE_STYLE_DEFAULTS = Object.freeze({ frame: 'ice', cover: 'mist' });
export const PROFILE_FRAMES = Object.freeze(['ice', 'silver', 'jade', 'graphite', 'quartz', 'spectrum', 'orbit', 'aurora']);
export const PROFILE_COVERS = Object.freeze(['mist', 'lake', 'dunes', 'forest', 'ocean', 'aurora', 'cosmos', 'summits']);
export const PREMIUM_PROFILE_FRAMES = Object.freeze(['spectrum', 'orbit', 'aurora']);
export const PREMIUM_PROFILE_COVERS = Object.freeze(['aurora', 'cosmos', 'summits']);

export function normalizeProfileStyle(value) {
  return {
    frame: PROFILE_FRAMES.includes(value?.frame) ? value.frame : PROFILE_STYLE_DEFAULTS.frame,
    cover: PROFILE_COVERS.includes(value?.cover) || value?.cover === 'none' ? value.cover : PROFILE_STYLE_DEFAULTS.cover,
  };
}
export function effectiveProfileStyle(value, pro = false) {
  const next = normalizeProfileStyle(value);
  if (!pro && PREMIUM_PROFILE_FRAMES.includes(next.frame)) next.frame = PROFILE_STYLE_DEFAULTS.frame;
  if (!pro && PREMIUM_PROFILE_COVERS.includes(next.cover)) next.cover = PROFILE_STYLE_DEFAULTS.cover;
  return next;
}
export function profileChoiceAllowed(kind, value, pro = false) {
  if (kind === 'frame') return PROFILE_FRAMES.includes(value) && (pro || !PREMIUM_PROFILE_FRAMES.includes(value));
  if (kind === 'cover') return (PROFILE_COVERS.includes(value) || value === 'none') && (pro || !PREMIUM_PROFILE_COVERS.includes(value));
  return false;
}
export function profileCoverAsset(cover, thumbnail = false) {
  return PROFILE_COVERS.includes(cover) ? `assets/profile-covers/${cover}${thumbnail ? '-thumb' : ''}.webp` : '';
}
