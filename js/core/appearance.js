export const APPEARANCE_KEY = 'fitcat_appearance_v1';
export const APPEARANCE_DEFAULTS = Object.freeze({
  theme: 'ocean', accent: 'cyan', background: 'ocean', transparency: 47, glow: 35,
  dimming: 0, blur: 0, parallax: true, depth: 35, animation: true, effect: 'flow',
  speed: 35, intensity: 30, glints: true, glintSpeed: 50, motion: 'standard',
});
export const ACCENTS = Object.freeze({
  cyan: { color: '#16cff3', strong: '#08bee8', hue: 190 },
  violet: { color: '#b58aff', strong: '#9867eb', hue: 270 },
  blue: { color: '#65adff', strong: '#4797f0', hue: 210 },
  amber: { color: '#ffd079', strong: '#efb856', hue: 40 },
});
export const BACKGROUNDS = Object.freeze(['ocean', 'aurora', 'cosmos', 'mountains', 'gradient', 'dark']);
export const EFFECTS = Object.freeze(['particles', 'waves', 'aurora', 'flow']);
export const PREMIUM_THEMES = Object.freeze(['amethyst', 'aurora']);
export const PREMIUM_BACKGROUNDS = Object.freeze(['aurora', 'cosmos']);
export const THEME_PRESETS = Object.freeze({
  ocean: { ...APPEARANCE_DEFAULTS },
  amethyst: { ...APPEARANCE_DEFAULTS, theme: 'amethyst', accent: 'violet', background: 'gradient', dimming: 25, blur: 10, transparency: 52, glow: 45 },
  aurora: { ...APPEARANCE_DEFAULTS, theme: 'aurora', background: 'aurora', dimming: 25, blur: 8, glow: 45, effect: 'aurora' },
});
export function normalizeAppearance(value) {
  const result = { ...APPEARANCE_DEFAULTS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const enums = { theme: ['ocean', 'amethyst', 'aurora', 'custom'], accent: Object.keys(ACCENTS), background: BACKGROUNDS, effect: EFFECTS, motion: ['calm', 'standard', 'expressive'] };
  for (const [key, choices] of Object.entries(enums)) if (choices.includes(value[key])) result[key] = value[key];
  for (const key of ['parallax', 'animation', 'glints']) if (typeof value[key] === 'boolean') result[key] = value[key];
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
