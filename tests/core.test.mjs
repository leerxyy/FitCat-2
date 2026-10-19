import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, loadState, persist, rollDay, recordNutrition, importSnapshot, exportSnapshot, clearAccount, updateStreak, setPhoto } from '../js/core/store.js';
import { calculateTargets, nutritionTotal, portion, localDate, bmi, temperatureBonus, stepsBonus } from '../js/core/math.js';

class MemoryStorage {
  constructor(data = {}) { this.map = new Map(Object.entries(data)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const profile = { name: 'Сергей', age: 20, gender: 'male', height: 180, weight: 80, goal: 'maintain', startWeight: 80, targetWeight: 75 };
const preferences = { dailyActivity: 1.375, workoutEnabled: false, workoutIntensity: 'light', smartWaterEnabled: false, currentTemp: 22, currentSteps: 8000 };
const eaten = { name: 'Йогурт', weight: 200, kcal: 120, protein: 9, fat: 4, carbs: 12, checked: true };
const planned = { name: 'Хлеб', weight: 100, kcal: 250, protein: 6, fat: 2, carbs: 45, checked: false };
let storage;
beforeEach(() => { storage = new MemoryStorage(); loadState(storage); });

test('daily targets retain the original male and female calculation results', () => {
  assert.deepEqual(calculateTargets(profile, preferences), { kcal: 2627, protein: 144, fat: 72, carbs: 351, water: 2800 });
  assert.deepEqual(calculateTargets({ ...profile, gender: 'female', goal: 'lose' }, preferences), { kcal: 1935, protein: 144, fat: 72, carbs: 178, water: 2800 });
});
test('activity, training and goal change calorie targets together', () => {
  const result = calculateTargets({ ...profile, goal: 'gain' }, { ...preferences, dailyActivity: 1.55, workoutEnabled: true, workoutIntensity: 'intense' });
  assert.equal(result.kcal, 3697); assert.equal(result.water, 3200);
});
test('smart water adds the selected weather, steps and training amounts once', () => {
  const result = calculateTargets(profile, { ...preferences, smartWaterEnabled: true, currentTemp: 32, currentSteps: 16000, workoutEnabled: true, workoutIntensity: 'moderate' });
  assert.equal(result.water, 3850);
  assert.equal(temperatureBonus(14), 0); assert.equal(temperatureBonus(15), 50);
  assert.equal(stepsBonus(2499), 0); assert.equal(stepsBonus(2500), 50);
});
test('planned food is excluded from eaten totals but may be included in a meal total', () => {
  assert.deepEqual(nutritionTotal([eaten, planned]), { kcal: 120, protein: 9, fat: 4, carbs: 12 });
  assert.deepEqual(nutritionTotal([eaten, planned], false), { kcal: 370, protein: 15, fat: 6, carbs: 57 });
});
test('portion editing recalculates nutrients without losing tenths of grams', () => {
  assert.deepEqual(portion({ kcal: 250, protein: 11.1, fat: 3.2, carbs: 42.6 }, 150), { kcal: 375, protein: 16.7, fat: 4.8, carbs: 63.9 });
  assert.equal(Math.round(bmi(profile) * 10) / 10, 24.7);
});
test('old storage keys load existing diary, products, templates, friends and photo', () => {
  const template = { name: 'Завтрак', foods: [eaten] };
  storage = new MemoryStorage({ fitnessProfile: JSON.stringify(profile), todayFoods: JSON.stringify([eaten, planned]),
    fitcat_products: JSON.stringify([{ name: 'Рис', kcal: 120 }]), fitcat_templates: JSON.stringify([template]),
    fitcat_friends: JSON.stringify(['82610170001']), fitcat_myUid: '82610170000', profilePhoto: 'data:image/png;base64,old',
    waterAmount: '1250', fitcat_lang: 'en', dailyActivity: '1.55', smartWaterEnabled: 'true' });
  loadState(storage);
  assert.equal(state.profile.name, profile.name); assert.equal(state.foods.length, 2); assert.equal(state.foods[1].checked, false);
  assert.ok(state.foods.every(food => food.id)); assert.notEqual(state.foods[0].id, state.foods[1].id);
  assert.equal(state.products[0].name, 'Рис'); assert.equal(state.templates[0].name, 'Завтрак');
  assert.equal(state.friends[0], '82610170001'); assert.equal(state.uid, '82610170000');
  assert.equal(state.water, 1250); assert.equal(state.photo, 'data:image/png;base64,old');
  assert.equal(state.preferences.lang, 'en'); assert.equal(state.preferences.dailyActivity, 1.55); assert.equal(state.preferences.smartWaterEnabled, true);
  persist(); loadState(storage); assert.equal(state.foods.length, 2); assert.equal(state.water, 1250);
});
test('a generated public ID has the original 11 digit shape', () => { assert.match(state.uid, /^8\d{10}$/); });
test('midnight archives yesterday instead of writing yesterday’s food under today', () => {
  const yesterday = new Date(2026, 9, 16, 22); const today = new Date(2026, 9, 17, 1);
  state.profile = { ...profile }; state.foods = [{ ...eaten }, { ...planned }]; state.water = 1000;
  state.lastDate = yesterday.toDateString(); state.preferences.workoutEnabled = true;
  assert.equal(rollDay(today), true);
  assert.deepEqual(state.nutrition, [{ date: '2026-10-16', kcal: 120, protein: 9, fat: 4, carbs: 12 }]);
  assert.deepEqual(state.foods, []); assert.equal(state.water, 0); assert.equal(state.preferences.workoutEnabled, false);
  assert.equal(state.lastDate, today.toDateString()); assert.equal(rollDay(today), false);
  loadState(storage); assert.equal(state.nutrition[0].date, '2026-10-16'); assert.equal(state.foods.length, 0);
});
test('recording a corrected day replaces that date rather than duplicating it', () => {
  state.foods = [{ ...eaten }]; recordNutrition('2026-10-15');
  state.foods[0].kcal = 200; recordNutrition('2026-10-15');
  assert.equal(state.nutrition.length, 1); assert.equal(state.nutrition[0].kcal, 200);
});
test('local dates do not switch to the preceding UTC date', () => {
  assert.equal(localDate(new Date(2026, 9, 17, 0, 1)), '2026-10-17');
});
test('daily streak advances once per local day', () => {
  const day = new Date(2026, 9, 16, 12); updateStreak(day); updateStreak(day); assert.equal(state.streak, 1);
  updateStreak(new Date(2026, 9, 17, 12)); assert.equal(state.streak, 2);
  updateStreak(new Date(2026, 9, 19, 12)); assert.equal(state.streak, 1);
});
test('a backup from the old single-file app can still be imported', () => {
  importSnapshot({ profile, foods: [eaten, planned], weight: [{ date: '2026-10-17', weight: 80 }] });
  loadState(storage); assert.equal(state.profile.name, profile.name); assert.equal(state.foods.length, 2);
  assert.equal(state.foods[1].checked, false); assert.deepEqual(state.weight, [{ date: '2026-10-17', weight: 80 }]);
});
test('new backups round-trip settings, photo, water and IDs as well as history', () => {
  state.profile = { ...profile }; state.foods = [{ ...eaten, id: 'old-id' }]; state.water = 750;
  state.preferences.lang = 'cn'; state.preferences.smartWaterEnabled = true; setPhoto('data:image/jpeg;base64,abc');
  const snapshot = structuredClone(exportSnapshot()); state.foods = []; state.water = 0;
  importSnapshot(snapshot); loadState(storage);
  assert.equal(state.water, 750); assert.equal(state.foods[0].id, 'old-id'); assert.equal(state.photo, snapshot.photo);
  assert.equal(state.preferences.lang, 'cn'); assert.equal(state.preferences.smartWaterEnabled, true);
});
test('a malformed backup does not replace existing data', () => {
  state.profile = { ...profile }; state.foods = [{ ...eaten }]; persist();
  const saved = structuredClone(state); const raw = new Map(storage.map);
  for (const bad of [{}, { profile, foods: [null], weight: [] }, { profile: { ...profile, age: 'oops' }, foods: [], weight: [] }, { profile, foods: [], weight: [null] }, { profile, foods: [], weight: [], templates: [{ name: 'Broken' }] }]) {
    assert.throws(() => importSnapshot(bad), /invalid_backup/);
    assert.deepEqual(state, saved); assert.deepEqual(storage.map, raw);
  }
});
test('failed import storage writes restore the original state and keys', () => {
  state.profile = { ...profile }; state.foods = [{ ...eaten }]; persist();
  const saved = structuredClone(state); const raw = new Map(storage.map); const write = storage.setItem.bind(storage);
  let fail = true; storage.setItem = (key, value) => { if (key === 'todayFoods' && fail) { fail = false; throw new Error('quota'); } write(key, value); };
  assert.throws(() => importSnapshot({ profile: { ...profile, name: 'Другой' }, foods: [planned], weight: [] }), /quota/);
  assert.deepEqual(state, saved); assert.deepEqual(storage.map, raw);
});
test('invalid optional settings fall back to supported controls', () => {
  importSnapshot({ profile, foods: [], weight: [], settings: { dailyActivity: 900, lang: 'invalid', workoutIntensity: 'unknown', currentSteps: 500000, smartSearchResults: 900 } });
  assert.equal(state.preferences.dailyActivity, 1.375); assert.equal(state.preferences.lang, 'ru');
  assert.equal(state.preferences.workoutIntensity, 'light'); assert.equal(state.preferences.currentSteps, 30000); assert.equal(state.preferences.smartSearchResults, 50);
});
test('deleting FitCat data leaves other GitHub Pages applications intact', () => {
  state.profile = { ...profile }; persist(); storage.setItem('other-app-document', 'keep'); clearAccount();
  assert.equal(storage.getItem('fitnessProfile'), null); assert.equal(storage.getItem('fitcat_myUid'), null);
  assert.equal(storage.getItem('other-app-document'), 'keep');
});
