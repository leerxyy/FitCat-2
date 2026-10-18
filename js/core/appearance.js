export const APPEARANCE_KEY = 'fitcat_appearance_v1';
export const APPEARANCE_DEFAULTS = Object.freeze({
  theme: 'ocean', accent: 'cyan', background: 'ocean', transparency: 47, glow: 35,
  dimming: 0, blur: 0, parallax: true, deviceTilt: false, depth: 35, animation: true, effect: 'flow',
  speed: 35, intensity: 30, glints: true, glintSpeed: 50, motion: 'standard',
});
export const ACCENTS = Object.freeze({
  cyan: { color: '#16cff3', strong: '#08bee8', hue: 190 },
  violet: { color: '#bda0ff', strong: '#a080e5', hue: 258 },
  blue: { color: '#70b7ff', strong: '#5299e6', hue: 210 },
  amber: { color: '#ffd079', strong: '#efb856', hue: 40 },
  iris: { color: '#a5a7ff', strong: '#8588e0', hue: 239 },
  rose: { color: '#ff9bc4', strong: '#e57eaa', hue: 335 },
  coral: { color: '#ffa49a', strong: '#e78378', hue: 6 },
  lime: { color: '#d7ee95', strong: '#b3ce70', hue: 75 },
  mint: { color: '#91e5bc', strong: '#6bc69c', hue: 151 },
  teal: { color: '#68e0d3', strong: '#41beb2', hue: 174 },
  ice: { color: '#b6dfff', strong: '#90bddf', hue: 206 },
  pearl: { color: '#e0e7ff', strong: '#b8c3e0', hue: 225 },
});
export const BACKGROUNDS = Object.freeze(['ocean', 'mountains', 'aurora', 'cosmos', 'forest', 'coast', 'dunes', 'glacier', 'gradient', 'dark']);
export const DEPTH_BACKGROUNDS = Object.freeze(['mountains', 'forest', 'coast', 'dunes', 'glacier', 'aurora']);
export const EFFECTS = Object.freeze(['particles', 'waves', 'aurora', 'flow']);
export const PREMIUM_THEMES = Object.freeze(['amethyst', 'aurora', 'midnight']);
export const PREMIUM_BACKGROUNDS = Object.freeze(['aurora', 'cosmos']);
export const THEME_PRESETS = Object.freeze({
  ocean: { ...APPEARANCE_DEFAULTS },
  amethyst: { ...APPEARANCE_DEFAULTS, theme: 'amethyst', accent: 'violet', background: 'gradient', dimming: 15, effect: 'flow' },
  aurora: { ...APPEARANCE_DEFAULTS, theme: 'aurora', accent: 'teal', background: 'aurora', dimming: 12, effect: 'aurora' },
  alpine: { ...APPEARANCE_DEFAULTS, theme: 'alpine', accent: 'ice', background: 'glacier', dimming: 15, effect: 'particles' },
  forest: { ...APPEARANCE_DEFAULTS, theme: 'forest', accent: 'mint', background: 'forest', dimming: 12, effect: 'flow' },
  sunset: { ...APPEARANCE_DEFAULTS, theme: 'sunset', accent: 'coral', background: 'dunes', dimming: 10, effect: 'flow' },
  midnight: { ...APPEARANCE_DEFAULTS, theme: 'midnight', accent: 'pearl', background: 'cosmos', dimming: 15, effect: 'particles' },
  coast: { ...APPEARANCE_DEFAULTS, theme: 'coast', accent: 'blue', background: 'coast', effect: 'waves' },
  summit: { ...APPEARANCE_DEFAULTS, theme: 'summit', accent: 'iris', background: 'mountains', effect: 'flow' },
});
export function normalizeAppearance(value) {
  const result = { ...APPEARANCE_DEFAULTS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const enums = { theme: [...Object.keys(THEME_PRESETS), 'custom'], accent: Object.keys(ACCENTS), background: BACKGROUNDS, effect: EFFECTS, motion: ['calm', 'standard', 'expressive'] };
  for (const [key, choices] of Object.entries(enums)) if (choices.includes(value[key])) result[key] = value[key];
  for (const key of ['parallax', 'deviceTilt', 'animation', 'glints']) if (typeof value[key] === 'boolean') result[key] = value[key];
  for (const [key, min, max] of [['transparency', 15, 70], ['glow', 0, 80], ['dimming', 0, 80], ['blur', 0, 100], ['depth', 0, 100], ['speed', 0, 100], ['intensity', 0, 100], ['glintSpeed', 0, 100]]) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = Math.round(Math.min(max, Math.max(min, value[key])));
  }
  return result;
}
export function effectiveAppearance(value, pro) {
  const result = normalizeAppearance(value);
  if (!pro && PREMIUM_THEMES.includes(result.theme)) Object.assign(result, { theme: 'ocean', accent: 'cyan', background: 'ocean' });
  if (!pro && PREMIUM_BACKGROUNDS.includes(result.background)) result.background = 'ocean';
  return result;
}
export function appearanceTimings(value) {
  const settings = normalizeAppearance(value);
  return { glint: Math.round(18000 * (1 / 9) ** (settings.glintSpeed / 100)), background: Math.round(38000 * (8 / 38) ** (settings.speed / 100)) };
}
export function appearanceRGB(accent = 'cyan') {
  const hex = ACCENTS[accent]?.color || ACCENTS.cyan.color;
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
}
export function appearanceColor(accent = 'cyan', alpha = 1) { return `rgba(${appearanceRGB(accent).join(',')},${alpha})`; }
export function isDefaultAppearance(value) {
  const normalized = normalizeAppearance(value);
  return Object.entries(APPEARANCE_DEFAULTS).every(([key, item]) => normalized[key] === item);
}
