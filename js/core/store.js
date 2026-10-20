import { localDate, nutritionTotal, calculateTargets } from './math.js';
import { emptyWeather, normalizeWeather } from './weather.js';
import { hasProAccess, mayCreateTemplate } from './access.js';
import { APPEARANCE_KEY, APPEARANCE_DEFAULTS, normalizeAppearance } from './appearance.js';
import { PROFILE_STYLE_KEY, PROFILE_STYLE_DEFAULTS, normalizeProfileStyle } from './profile-style.js';
import { createWallet, validateWallet, WALLET_KEY, withWalletLock, addCalendarMonths, DEVELOPER_GRANT_ID, DEVELOPER_COINS } from './wallet.js';
import { ACHIEVEMENTS_KEY, normalizeAchievements, collectAchievements, developerAchievements } from './achievements.js';

// Keep the original storage keys so an update on the same origin preserves data.
const KEYS = {
  profile: 'fitnessProfile', foods: 'todayFoods', weight: 'weightHistory',
  nutrition: 'nutritionHistory', products: 'fitcat_products', templates: 'fitcat_templates',
  friends: 'fitcat_friends', uid: 'fitcat_myUid', photo: 'profilePhoto',
  weather: 'fitcat_weather_v1', photoEdit: 'fitcat_photo_edit_v1',
  appearance: APPEARANCE_KEY,
  profileStyle: PROFILE_STYLE_KEY,
  achievements: ACHIEVEMENTS_KEY,
};
const DEFAULTS = {
  lang: 'ru', dailyActivity: 1.375, workoutEnabled: false, workoutIntensity: 'light',
  currentSteps: 8000, currentTemp: 22, smartWaterEnabled: false,
  smartSearchEnabled: false, smartSearchResults: 10,
  hapticsEnabled: true,
  lowDetailMode: false,
  waterTemperatureMode: 'manual',
};
const PREF_KEYS = { ...Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, key])), lang: 'fitcat_lang', lowDetailMode: 'fitcat_low_detail_mode_v1' };
function normalizePreferences(value) {
  const result = { ...DEFAULTS };
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    if (typeof value?.[key] === typeof fallback) result[key] = value[key];
  }
  if (!['ru', 'en', 'cn'].includes(result.lang)) result.lang = DEFAULTS.lang;
  if (!['manual', 'auto'].includes(result.waterTemperatureMode)) result.waterTemperatureMode = 'manual';
  if (![1.2, 1.375, 1.55, 1.725].includes(result.dailyActivity)) result.dailyActivity = DEFAULTS.dailyActivity;
  if (!['light', 'moderate', 'intense'].includes(result.workoutIntensity)) result.workoutIntensity = DEFAULTS.workoutIntensity;
  for (const [key, min, max] of [['currentSteps', 0, 30000], ['currentTemp', -20, 45], ['smartSearchResults', 5, 50]]) {
    result[key] = Number.isFinite(result[key]) ? Math.min(max, Math.max(min, result[key])) : DEFAULTS[key];
  }
  result.smartSearchResults = Math.round(result.smartSearchResults);
  return result;
}
export const state = {
  profile: null, foods: [], weight: [], nutrition: [], products: [], templates: [],
  friends: [], uid: '', photo: '', photoEdit: null, water: 0, lastDate: '', streak: 0,
  preferences: { ...DEFAULTS },
  weather: emptyWeather(),
  appearance: { ...APPEARANCE_DEFAULTS },
  profileStyle: { ...PROFILE_STYLE_DEFAULTS },
  achievements: normalizeAchievements(null),
};
let storage;

export function uid() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value ?? fallback;
  } catch { return fallback; }
}

export function loadState(adapter = globalThis.localStorage) {
  storage = adapter;
  state.profile = readJSON(KEYS.profile, null);
  for (const key of ['foods', 'weight', 'nutrition', 'products', 'templates', 'friends']) {
    const value = readJSON(KEYS[key], []);
    state[key] = Array.isArray(value) ? value : [];
  }
  state.foods = state.foods.filter(food => food && typeof food.name === 'string')
    .map(food => ({ ...food, id: food.id || uid() }));
  state.preferences = { ...DEFAULTS };
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const raw = storage.getItem(PREF_KEYS[key]);
    if (raw == null) continue;
    state.preferences[key] = typeof fallback === 'boolean' ? raw === 'true'
      : typeof fallback === 'number' ? (Number.isFinite(Number(raw)) ? Number(raw) : fallback) : raw;
  }
  state.preferences = normalizePreferences(state.preferences);
  state.weather = normalizeWeather(readJSON(KEYS.weather, null));
  state.appearance = normalizeAppearance(readJSON(KEYS.appearance, null));
  state.profileStyle = normalizeProfileStyle(readJSON(KEYS.profileStyle, null));
  state.achievements = normalizeAchievements(readJSON(KEYS.achievements, null));
  if (state.preferences.waterTemperatureMode === 'auto' && state.weather.daily) {
    state.preferences.currentTemp = state.weather.daily.temperature;
  }
  state.water = Math.max(0, Number(storage.getItem('waterAmount')) || 0);
  state.photo = storage.getItem(KEYS.photo) || '';
  state.photoEdit = state.photo ? normalizePhotoEdit(readJSON(KEYS.photoEdit, null)) : null;
  state.lastDate = storage.getItem('lastDate') || new Date().toDateString();
  state.uid = storage.getItem(KEYS.uid) || makePublicUid();
  state.streak = Number(storage.getItem('fitcat_streak')) || 0;
  if (state.profile && !state.profile.goal) state.profile.goal = 'lose';
  storage.setItem(KEYS.uid, state.uid);
  return state;
}

function makePublicUid() {
  const date = localDate().replaceAll('-', '').slice(2);
  return `8${date}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

export function targets() {
  const result = calculateTargets(state.profile, state.preferences);
  if (!proAccess() && state.profile) result.water = Math.round(state.profile.weight * 35);
  return result;
}
export function proAccess() { return hasProAccess(storage); }
export function templateSlotAvailable() { return mayCreateTemplate(state.templates.length, storage); }

export function recordNutrition(date = localDate()) {
  const record = { date, ...nutritionTotal(state.foods), foodCount: state.foods.length };
  const index = state.nutrition.findIndex(item => item.date === date);
  if (index < 0) state.nutrition.push(record);
  else state.nutrition[index] = record;
}

export function rollDay(now = new Date()) {
  const today = now.toDateString();
  if (!state.lastDate || state.lastDate === today) return false;
  const previous = new Date(state.lastDate);
  // The prior day's food must be archived under the PRIOR date, not today.
  if (!Number.isNaN(previous.getTime())) recordNutrition(localDate(previous));
  state.foods = [];
  state.water = 0;
  state.preferences.workoutEnabled = false;
  state.lastDate = today;
  persist();
  return true;
}

export function updateStreak(now = new Date()) {
  const previous = storage.getItem('fitcat_lastOpen');
  if (previous !== now.toDateString()) {
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    state.streak = previous === yesterday.toDateString() ? state.streak + 1 : 1;
    storage.setItem('fitcat_streak', String(state.streak));
    storage.setItem('fitcat_lastOpen', now.toDateString());
  }
}

export function persist({ nutrition = false } = {}) {
  if (nutrition && state.profile) recordNutrition();
  for (const key of ['profile', 'foods', 'weight', 'nutrition', 'products', 'templates', 'friends']) {
    if (key === 'profile' && !state.profile) { if (storage.getItem(KEYS[key]) !== null) storage.removeItem(KEYS[key]); }
    else saveIfChanged(KEYS[key], JSON.stringify(state[key]));
  }
  for (const [key, value] of Object.entries(state.preferences)) {
    if (PREF_KEYS[key]) saveIfChanged(PREF_KEYS[key], String(value));
  }
  saveIfChanged(KEYS.weather, JSON.stringify(state.weather));
  saveIfChanged(KEYS.appearance, JSON.stringify(state.appearance));
  saveIfChanged(KEYS.profileStyle, JSON.stringify(state.profileStyle));
  saveIfChanged('waterAmount', String(state.water));
  saveIfChanged('lastDate', state.lastDate || new Date().toDateString());
  syncAchievements();
}

export function syncAchievements() {
  const stored = normalizeAchievements(readJSON(KEYS.achievements, null));
  const cached = state.achievements;
  const next = collectAchievements({ ...stored, days:[...stored.days,...cached.days], products:[...stored.products,...cached.products], unlocked:{...cached.unlocked,...stored.unlocked}, developer:stored.developer||cached.developer }, state);
  saveIfChanged(KEYS.achievements, JSON.stringify(next));
  state.achievements = next;
  return next;
}

export const isDeveloperCommand = value => /\/dev(?=$|\s)/i.test(String(value));
export async function activateDeveloper(command, now = Date.now()) {
  if (!isDeveloperCommand(command) || !state.profile) return null;
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('invalid_developer_time');
  const account = state.uid, originalName = state.profile.name;
  return withWalletLock(() => {
    if (!state.profile || state.uid !== account) throw new Error('developer_cancelled');
    const wallet = createWallet(storage).snapshot();
    const already = wallet.entries.some(entry => entry.id === DEVELOPER_GRANT_ID);
    if (!already) {
      const expiresAt = Math.max(addCalendarMonths(now, 99 * 12), wallet.subscription?.expiresAt || 0, createWallet(storage).status(now).expiresAt || 0);
      wallet.balance += DEVELOPER_COINS;
      wallet.subscription = { activatedAt: now, expiresAt };
      wallet.entries.push({ id: DEVELOPER_GRANT_ID, kind: 'developer', amount: DEVELOPER_COINS, at: now, balanceAfter: wallet.balance, expiresAt });
      validateWallet(wallet);
    }
    const name = state.profile.name !== originalName && !isDeveloperCommand(state.profile.name) ? state.profile.name : String(command).replace(/\/dev(?=$|\s)/gi, '').trim() || originalName.replace(/\/dev(?=$|\s)/gi, '').trim() || 'Meow';
    const profile = { ...state.profile, name }, achievements = developerAchievements(collectAchievements(state.achievements, state), new Date(now));
    const writes = [[KEYS.profile, JSON.stringify(profile)], [KEYS.achievements, JSON.stringify(achievements)], [WALLET_KEY, JSON.stringify(wallet)]];
    const saved = writes.map(([key]) => [key, storage.getItem(key)]);
    try { for (const [key, value] of writes) saveIfChanged(key, value); }
    catch (error) {
      for (const [key, value] of saved) try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* Continue restoring other records. */ }
      throw error;
    }
    state.profile = profile; state.achievements = achievements;
    return { already, name, balance: wallet.balance };
  });
}

// Compare against storage, not an in-memory cache: imports and other tabs may
// have replaced it. Saves remain synchronous, with the same error propagation.
function saveIfChanged(key, value) {
  if (storage.getItem(key) !== value) storage.setItem(key, value);
}

export function setLowDetailMode(value) {
  const enabled = Boolean(value);
  saveIfChanged(PREF_KEYS.lowDetailMode, String(enabled));
  state.preferences.lowDetailMode = enabled;
  return enabled;
}

// Autosaving a profile field should write only the profile, not the entire diary.
// Commit memory after the single storage write succeeds.
export function setProfile(profile) {
  storage.setItem(KEYS.profile, JSON.stringify(profile));
  state.profile = profile;
}

export function setAppearance(value) {
  const next = normalizeAppearance(value);
  storage.setItem(KEYS.appearance, JSON.stringify(next));
  state.appearance = next;
  return next;
}

export function setProfileStyle(value) {
  const next = normalizeProfileStyle(value);
  storage.setItem(KEYS.profileStyle, JSON.stringify(next));
  state.profileStyle = next;
  return next;
}

function normalizePhotoEdit(value) {
  if (!value || typeof value.source !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(value.source)) return null;
  const frame = value.frame;
  if (!frame || ![frame.zoom, frame.x, frame.y].every(Number.isFinite) || frame.zoom < 1 || frame.zoom > 4) return null;
  return { source: value.source, frame: { zoom: frame.zoom, x: frame.x, y: frame.y } };
}

export function setPhoto(value, edit = null) {
  const nextEdit = value ? normalizePhotoEdit(edit) : null;
  const previous = new Map([KEYS.photo, KEYS.photoEdit].map(key => [key, storage.getItem(key)]));
  try {
    if (nextEdit) storage.setItem(KEYS.photoEdit, JSON.stringify(nextEdit));
    else storage.removeItem(KEYS.photoEdit);
    if (value) storage.setItem(KEYS.photo, value);
    else storage.removeItem(KEYS.photo);
  } catch (error) {
    for (const [key, saved] of previous) {
      try { if (saved == null) storage.removeItem(key); else storage.setItem(key, saved); } catch { /* Try both keys. */ }
    }
    throw error;
  }
  state.photo = value; state.photoEdit = nextEdit;
}

export function exportSnapshot() {
  return {
    version: 3, profile: state.profile, foods: state.foods, weight: state.weight,
    nutrition: state.nutrition, products: state.products, templates: state.templates,
    settings: state.preferences, friends: state.friends, uid: state.uid, photo: state.photo, photoEdit: state.photoEdit,
    water: state.water, lastDate: state.lastDate,
    weather: state.weather,
    appearance: state.appearance,
    profileStyle: state.profileStyle,
    achievements: state.achievements,
    wallet: createWallet(storage).snapshot(),
  };
}

export function importSnapshot(data) {
  const invalid = () => { throw new Error('invalid_backup'); };
  const numeric = (value, min, max) => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + 'T12:00:00').getTime());
  const foodRecord = (food, isPortion = true) => {
    if (!food || typeof food.name !== 'string' || !food.name.trim()
      || (isPortion && !numeric(food.weight, 0, 10000))
      || ['kcal', 'protein', 'fat', 'carbs'].some(key => !numeric(food[key] ?? 0, 0, 100000))) invalid();
    return { ...food, ...(isPortion ? { id: food.id || uid(), weight: Number(food.weight), checked: Boolean(food.checked) } : {}), ...Object.fromEntries(['kcal', 'protein', 'fat', 'carbs'].map(key => [key, Number(food[key]) || 0])) };
  };
  if (!data || !data.profile || typeof data.profile.name !== 'string' || !data.profile.name.trim()
    || !numeric(data.profile.weight, 30, 500) || !numeric(data.profile.height, 100, 250) || !numeric(data.profile.age, 10, 100)
    || !['female', 'male'].includes(data.profile.gender) || !['lose', 'maintain', 'gain'].includes(data.profile.goal || 'lose')
    || !Array.isArray(data.foods) || !Array.isArray(data.weight)) invalid();
  for (const key of ['nutrition', 'products', 'templates', 'friends']) if (data[key] != null && !Array.isArray(data[key])) invalid();
  let importedWallet;
  if (Object.hasOwn(data, 'wallet')) {
    try { importedWallet = structuredClone(validateWallet(data.wallet)); } catch { invalid(); }
  }
  if (data.weight.some(item => !item || !validDate(item.date) || !numeric(item.weight, 30, 500))) invalid();
  if ((data.nutrition || []).some(item => !item || !validDate(item.date) || ['kcal', 'protein', 'fat', 'carbs'].some(key => !numeric(item[key] ?? 0, 0, 100000)))) invalid();
  const next = {
    profile: { ...data.profile, goal: data.profile.goal || 'lose', weight: Number(data.profile.weight), height: Number(data.profile.height), age: Number(data.profile.age) },
    foods: data.foods.map(food => foodRecord(food)),
    weight: data.weight.map(item => ({ ...item, weight: Number(item.weight) })),
    nutrition: data.nutrition || [],
    products: (data.products || []).map(food => foodRecord(food, false)),
    templates: (data.templates || []).map(template => {
      if (!template || typeof template.name !== 'string' || !Array.isArray(template.foods)) invalid();
      return { ...template, foods: template.foods.map(food => foodRecord(food)) };
    }),
    friends: (data.friends || []).filter(id => typeof id === 'string' && /^\d{11}$/.test(id)),
    uid: typeof data.uid === 'string' && /^\d{11}$/.test(data.uid) ? data.uid : state.uid,
    photo: typeof data.photo === 'string' && (!data.photo || /^data:image\/(jpeg|png|webp);base64,/.test(data.photo)) ? data.photo : state.photo,
    preferences: normalizePreferences({ ...state.preferences, ...data.settings }),
    weather: normalizeWeather(data.weather),
    appearance: normalizeAppearance(data.appearance ?? state.appearance),
    profileStyle: normalizeProfileStyle(data.profileStyle ?? state.profileStyle),
    achievements: normalizeAchievements(data.achievements ?? state.achievements),
    water: Math.max(0, Number(data.water) || 0),
    lastDate: typeof data.lastDate === 'string' && !Number.isNaN(new Date(data.lastDate).getTime()) ? data.lastDate : new Date().toDateString(),
  };
  const hasImportedPhoto = typeof data.photo === 'string' && (!data.photo || /^data:image\/(jpeg|png|webp);base64,/.test(data.photo));
  next.photoEdit = next.photo ? (hasImportedPhoto ? normalizePhotoEdit(data.photoEdit) : state.photoEdit) : null;
  if (next.preferences.waterTemperatureMode === 'auto' && next.weather.daily) {
    next.preferences.currentTemp = next.weather.daily.temperature;
  }
  // Validate everything before replacing state, and restore prior keys if a write fails.
  const previous = structuredClone(state);
  const keys = [...Object.values(KEYS), ...Object.values(PREF_KEYS), 'waterAmount', 'lastDate', WALLET_KEY];
  const saved = new Map(keys.map(key => [key, storage.getItem(key)]));
  try {
    Object.assign(state, next);
    persist(); storage.setItem(KEYS.uid, state.uid); setPhoto(state.photo, state.photoEdit);
    if (importedWallet) storage.setItem(WALLET_KEY, JSON.stringify(importedWallet));
  } catch (error) {
    Object.assign(state, previous);
    for (const [key, value] of saved) {
      try { if (value == null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* Keep trying the remaining original keys. */ }
    }
    throw error;
  }
}

export function clearAccount() {
  // GitHub Pages projects share an origin. Never clear unrelated applications.
  for (const key of [...Object.values(KEYS), ...Object.values(PREF_KEYS), 'waterAmount', 'lastDate', 'fitcat_streak', 'fitcat_lastOpen']) storage.removeItem(key);
  for (const key of ['card_waterCard_collapsed', 'card_mealsCard_collapsed', 'journal_weightHistory_collapsed', 'journal_nutritionHistory_collapsed']) storage.removeItem(key);
  state.achievements = normalizeAchievements(null);
}
