import { localDate, nutritionTotal, calculateTargets } from './math.js';

// Keep the original storage keys so an update on the same origin preserves data.
const KEYS = {
  profile: 'fitnessProfile', foods: 'todayFoods', weight: 'weightHistory',
  nutrition: 'nutritionHistory', products: 'fitcat_products', templates: 'fitcat_templates',
  friends: 'fitcat_friends', uid: 'fitcat_myUid', photo: 'profilePhoto',
};
const DEFAULTS = {
  lang: 'ru', dailyActivity: 1.375, workoutEnabled: false, workoutIntensity: 'light',
  currentSteps: 8000, currentTemp: 22, smartWaterEnabled: false,
  smartSearchEnabled: false, smartSearchResults: 10,
};
const PREF_KEYS = { ...Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, key])), lang: 'fitcat_lang' };
function normalizePreferences(value) {
  const result = { ...DEFAULTS };
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    if (typeof value?.[key] === typeof fallback) result[key] = value[key];
  }
  if (!['ru', 'en', 'cn'].includes(result.lang)) result.lang = DEFAULTS.lang;
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
  friends: [], uid: '', photo: '', water: 0, lastDate: '', streak: 0,
  preferences: { ...DEFAULTS },
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
  state.water = Math.max(0, Number(storage.getItem('waterAmount')) || 0);
  state.photo = storage.getItem(KEYS.photo) || '';
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
  return calculateTargets(state.profile, state.preferences);
}

export function recordNutrition(date = localDate()) {
  const record = { date, ...nutritionTotal(state.foods) };
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
    if (key === 'profile' && !state.profile) storage.removeItem(KEYS[key]);
    else storage.setItem(KEYS[key], JSON.stringify(state[key]));
  }
  for (const [key, value] of Object.entries(state.preferences)) {
    if (PREF_KEYS[key]) storage.setItem(PREF_KEYS[key], String(value));
  }
  storage.setItem('waterAmount', String(state.water));
  storage.setItem('lastDate', state.lastDate || new Date().toDateString());
}

export function setPhoto(value) {
  if (value) storage.setItem(KEYS.photo, value);
  else storage.removeItem(KEYS.photo);
  state.photo = value;
}

export function exportSnapshot() {
  return {
    version: 3, profile: state.profile, foods: state.foods, weight: state.weight,
    nutrition: state.nutrition, products: state.products, templates: state.templates,
    settings: state.preferences, friends: state.friends, uid: state.uid, photo: state.photo,
    water: state.water, lastDate: state.lastDate,
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
    water: Math.max(0, Number(data.water) || 0),
    lastDate: typeof data.lastDate === 'string' && !Number.isNaN(new Date(data.lastDate).getTime()) ? data.lastDate : new Date().toDateString(),
  };
  // Validate everything before replacing state, and restore prior keys if a write fails.
  const previous = structuredClone(state);
  const keys = [...Object.values(KEYS), ...Object.values(PREF_KEYS), 'waterAmount', 'lastDate'];
  const saved = new Map(keys.map(key => [key, storage.getItem(key)]));
  try {
    Object.assign(state, next);
    persist(); storage.setItem(KEYS.uid, state.uid); setPhoto(state.photo);
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
}
