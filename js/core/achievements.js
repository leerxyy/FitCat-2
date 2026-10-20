import { localDate } from './math.js';

export const ACHIEVEMENTS_KEY = 'fitcat_achievements_v1';
export const STABILITY_LEVELS = Object.freeze([7, 30, 60, 90]);
export const ACHIEVEMENT_IDS = Object.freeze(['first', 'rhythm', 'stable7', 'stable30', 'stable60', 'stable90', 'balance', 'choice']);
const validDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const complete = item => item && typeof item.name === 'string' && item.name.trim() && ['kcal', 'protein', 'fat', 'carbs'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0);

export function normalizeAchievements(value, now = new Date()) {
  const today = localDate(now), unlocked = {};
  for (const id of ACHIEVEMENT_IDS) {
    const record = value?.unlocked?.[id];
    if (Number.isSafeInteger(record?.at) && record.at > 0) unlocked[id] = { at: record.at, source: record.source === 'developer' ? 'developer' : 'earned' };
  }
  return { version: 1, days: [...new Set((Array.isArray(value?.days) ? value.days : []).filter(day => validDay(day) && day <= today))].sort(),
    products: [...new Set((Array.isArray(value?.products) ? value.products : []).filter(name => typeof name === 'string' && name.trim()).map(name => name.trim().toLocaleLowerCase()))],
    unlocked, developer: value?.developer === true };
}

export function longestRun(days) {
  let best = 0, run = 0, previous;
  for (const day of [...new Set(days)].sort()) {
    const timestamp = Date.parse(day + 'T12:00:00Z');
    run = timestamp - previous === 86400000 ? run + 1 : 1;
    best = Math.max(best, run); previous = timestamp;
  }
  return best;
}

export function collectAchievements(previous, data, now = new Date()) {
  const next = normalizeAchievements(previous, now), days = new Set(next.days), today = localDate(now);
  for (const entry of data.nutrition || []) {
    if (validDay(entry?.date) && entry.date <= today && (entry.foodCount > 0 || ['kcal', 'protein', 'fat', 'carbs'].some(key => Number(entry[key]) > 0))) days.add(entry.date);
  }
  if (data.foods?.length) {
    const date = new Date(data.lastDate || now);
    const day = Number.isFinite(date.getTime()) ? localDate(date) : today;
    if (day <= today) days.add(day);
  }
  next.days = [...days].sort();
  next.products = [...new Set([...next.products, ...(data.products || []).filter(complete).map(item => item.name.trim().toLocaleLowerCase())])];
  const earned = id => { next.unlocked[id] ??= { at: now.getTime(), source: 'earned' }; };
  if (next.days.length) earned('first');
  if (longestRun(next.days) >= 7) earned('rhythm');
  for (const level of STABILITY_LEVELS) if (next.days.length >= level) earned('stable' + level);
  if ((data.templates || []).some(template => template.foods?.length >= 3 && template.foods.every(complete))) earned('balance');
  if (next.products.length >= 5) earned('choice');
  return next;
}

export function developerAchievements(previous, now = new Date()) {
  const next = normalizeAchievements(previous, now); next.developer = true;
  for (const id of ACHIEVEMENT_IDS) next.unlocked[id] ??= { at: now.getTime(), source: 'developer' };
  return next;
}

export function achievementProgress(data, id) {
  const level = Number(id.replace('stable', ''));
  const target = id.startsWith('stable') ? level : id === 'rhythm' ? 7 : id === 'choice' ? 5 : id === 'balance' ? 3 : 1;
  const count = id.startsWith('stable') ? data.days.length : id === 'rhythm' ? longestRun(data.days) : id === 'choice' ? data.products.length : data.unlocked[id] ? target : 0;
  return { target, count: Math.min(count, target), unlocked: Boolean(data.unlocked[id]), source: data.unlocked[id]?.source };
}
