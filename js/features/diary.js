import { state, targets, uid } from '../core/store.js';
import { nutritionTotal, portion, clamp } from '../core/math.js';
import { t, number } from '../core/i18n.js';
import { $, icon, escapeHTML, safeImage, animateNumber, onAction, changed, openDialog, closeDialog, toast, confirmAction, promptValue } from '../ui/components.js';
import { animateProgress, captureLayout, animateList, removeRow, toggleMeal } from '../ui/motion.js';

const meals = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];
const mealIcons = { breakfast: 'sun', lunch: 'meal', dinner: 'moon', snack: 'apple', other: 'meal' };
let editingFood = null;
let selectedImage = '';
let foodSignature = '';
let revealFoodId = '';

export function renderSummary() {
  const total = nutritionTotal(state.foods); const goal = targets();
  const remaining = goal.kcal - total.kcal;
  animateNumber($('caloriesRemaining'), Math.abs(remaining));
  animateNumber($('caloriesEaten'), total.kcal);
  animateNumber($('caloriesTarget'), goal.kcal);
  $('remainingLabel').textContent = t(remaining < 0 ? 'over_target' : 'remaining');
  animateProgress($('calorieRing'), clamp(total.kcal / goal.kcal), 'ring');
  $('calorieRing').classList.toggle('is-over', remaining < 0);
  for (const key of ['protein', 'fat', 'carbs']) {
    animateNumber($(`${key}Current`), total[key]);
    $(`${key}Target`).textContent = number(goal[key]);
    animateProgress($(`${key}Bar`), clamp(total[key] / goal[key]));
  }
  $('mealTotal').textContent = `${number(total.kcal)} ${t('kcal')}`;
  renderWater();
}

export function renderWater() {
  const goal = targets(); const fraction = clamp(state.water / goal.water);
  animateNumber($('waterCurrent'), state.water / 1000, 2);
  $('waterGoal').textContent = `${number(goal.water / 1000, 2)} ${t('l')}`;
  animateProgress($('waterFill'), fraction);
  $('waterProgress').setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  $('waterProgress').setAttribute('aria-label', t('water_title'));
  const extra = state.profile ? goal.water - Math.round(state.profile.weight * 35) : 0;
  $('smartWaterHint').hidden = !state.preferences.smartWaterEnabled || !extra;
  $('smartWaterHint').textContent = `${t('smart_water')}: +${number(extra)} ${t('ml')}`;
}

export function renderFoods() {
  const container = $('foodListContainer');
  const signature = state.preferences.lang + JSON.stringify(state.foods);
  if (signature === foodSignature) return;
  foodSignature = signature;
  const previous = captureLayout(container);
  const highlightId = revealFoodId; revealFoodId = '';
  const expanded = new Set([...container.querySelectorAll('details[open]')].map(item => item.dataset.meal));
  if (!state.foods.length) {
    container.innerHTML = `<div class="empty-state">${icon('meal')}<strong>${t('empty_title')}</strong><p>${t('empty_description')}</p></div>`;
    animateList(container, previous);
    return;
  }
  container.innerHTML = meals.map(meal => {
    const foods = state.foods.filter(food => (meals.includes(food.meal) ? food.meal : 'other') === meal);
    if (!foods.length) return '';
    const total = nutritionTotal(foods, false);
    const image = safeImage(foods.find(food => safeImage(food.image))?.image);
    const thumb = image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy" decoding="async" data-food-image>` : icon(mealIcons[meal]);
    const open = expanded.has(meal) || foods.some(food => food.id === highlightId);
    return `<details class="meal-group" data-meal="${meal}" data-motion-key="meal-${meal}" ${open ? 'open' : ''}>
      <summary class="meal-summary" aria-expanded="${open}"><span class="meal-thumb">${thumb}</span><span class="meal-description"><strong>${t(meal)}</strong><small>${escapeHTML(foods.map(food => food.name).join(', '))}</small></span><span class="meal-kcal">${number(total.kcal)} ${t('kcal')}</span>${icon('chevron', 'meal-chevron')}</summary>
      <div class="meal-contents">${foods.map(food => foodRow(food)).join('')}<button type="button" class="text-button" data-action="openFood" data-value="${meal}">${icon('plus')}<span>${t('add_food')}</span></button></div>
    </details>`;
  }).join('');
  container.querySelectorAll('.meal-summary').forEach(summary => summary.addEventListener('click', event => { event.preventDefault(); toggleMeal(summary.parentElement); }));
  container.querySelectorAll('[data-food-image]').forEach(image => image.addEventListener('error', () => { image.parentElement.innerHTML = icon('meal'); }, { once: true }));
  animateList(container, previous, highlightId);
}

function foodRow(food) {
  const id = escapeHTML(food.id);
  return `<div class="food-item" data-food-id="${id}" data-motion-key="food-${id}">
    <button type="button" class="food-toggle ${food.checked ? 'checked' : ''}" data-action="toggleFood" data-value="${id}" aria-pressed="${Boolean(food.checked)}" aria-label="${escapeHTML(t('already_eaten') + ': ' + food.name)}">${icon('check')}</button>
    <div class="food-info"><div class="food-name">${escapeHTML(food.name)}</div><div class="food-details">${number(food.weight, 1)} ${t('g')} · ${number(food.kcal)} ${t('kcal')}${food.checked ? '' : ` · ${t('planned')}`}</div></div>
    <button type="button" class="icon-button" data-action="editFood" data-value="${id}" aria-label="${escapeHTML(t('edit') + ': ' + food.name)}">${icon('edit')}</button>
    <button type="button" class="icon-button" data-action="deleteFood" data-value="${id}" aria-label="${escapeHTML(t('delete') + ': ' + food.name)}">${icon('x')}</button>
  </div>`;
}

export function defaultMeal() {
  const hour = new Date().getHours();
  return hour < 11 ? 'breakfast' : hour < 17 ? 'lunch' : hour < 22 ? 'dinner' : 'snack';
}

export function openFood(meal) {
  editingFood = null; selectedImage = '';
  $('foodForm').reset();
  $('foodMeal').value = meals.includes(meal) && meal !== 'other' ? meal : defaultMeal();
  $('foodDialogTitle').textContent = t('add_food');
  $('portionPreview').textContent = '';
  $('autocompleteList').hidden = true;
  $('foodName').setAttribute('aria-expanded', 'false');
  $('searchStatus').textContent = '';
  openDialog('foodEntryModal');
}

export function fillFoodForm(product) {
  $('foodName').value = product.name || '';
  for (const [field, key] of [['foodKcal100','kcal'], ['foodProt100','protein'], ['foodFat100','fat'], ['foodCarb100','carbs']]) {
    $(field).value = Math.round((Number(product[key]) || 0) * 10) / 10;
  }
  selectedImage = safeImage(product.image);
  $('autocompleteList').hidden = true;
  $('foodName').setAttribute('aria-expanded', 'false');
  $('foodWeight').focus();
  updatePortionPreview();
}

function productFromForm() {
  return {
    name: $('foodName').value.trim(),
    kcal: Number($('foodKcal100').value) || 0,
    protein: Number($('foodProt100').value) || 0,
    fat: Number($('foodFat100').value) || 0,
    carbs: Number($('foodCarb100').value) || 0,
    image: selectedImage,
  };
}

function updatePortionPreview() {
  const weight = Number($('foodWeight').value);
  if (!weight || weight < 0) { $('portionPreview').textContent = ''; return; }
  const total = portion(productFromForm(), weight);
  $('portionPreview').textContent = `${t('per_portion')}: ${number(total.kcal)} ${t('kcal')} · ${t('protein_short')} ${number(total.protein, 1)} · ${t('fat_short')} ${number(total.fat, 1)} · ${t('carbs_short')} ${number(total.carbs, 1)}`;
}

function saveFood(event) {
  event.preventDefault();
  if (!$('foodForm').reportValidity()) return;
  const product = productFromForm();
  if (!product.name) { $('foodName').focus(); return; }
  const weight = Number($('foodWeight').value);
  const existingIndex = state.foods.findIndex(food => food.id === editingFood);
  const food = {
    ...(existingIndex >= 0 ? state.foods[existingIndex] : {}),
    id: editingFood || uid(), name: product.name, weight,
    ...portion(product, weight), meal: $('foodMeal').value,
    checked: $('foodEaten').checked, image: selectedImage,
  };
  if (existingIndex >= 0) state.foods[existingIndex] = food; else state.foods.push(food);
  revealFoodId = food.id;
  if (!state.products.some(item => item.name.toLocaleLowerCase() === product.name.toLocaleLowerCase())) state.products.push(product);
  changed({ nutrition: true }); closeDialog('foodEntryModal'); toast(t('food_saved'));
 
}

function editFood(id) {
  const food = state.foods.find(item => item.id === id);
  if (!food) return;
  openFood(food.meal); editingFood = id;
  const multiplier = food.weight > 0 ? 100 / food.weight : 1;
  fillFoodForm({ name: food.name, image: food.image, ...Object.fromEntries(['kcal','protein','fat','carbs'].map(key => [key, food[key] * multiplier])) });
  $('foodWeight').value = food.weight;
  $('foodEaten').checked = Boolean(food.checked);
  $('foodDialogTitle').textContent = t('edit');
  updatePortionPreview();
}

export function addWater(amount) {
  if (!Number.isFinite(amount)) return;
  const previous = state.water;
  state.water = Math.max(0, state.water + amount);
  changed();
  $('waterCard').classList.remove('just-added');
  requestAnimationFrame(() => $('waterCard').classList.add('just-added'));
  toast(t('water_added'), { label: t('undo'), run: () => { state.water = previous; changed(); } });
 
}

export function renderTemplates() {
  $('templatesBar').innerHTML = state.templates.length ? state.templates.map((template, index) => `<div class="template-item"><button type="button" class="btn-secondary" data-action="loadTemplate" data-value="${index}">${icon('template')}<span>${escapeHTML(template.name)}</span></button><button type="button" class="icon-button" data-action="deleteTemplate" data-value="${index}" aria-label="${escapeHTML(t('delete') + ': ' + template.name)}">${icon('trash')}</button></div>`).join('') : `<p class="muted text-small">${t('no_templates')}</p>`;
}

export function initDiary() {
  $('foodForm').addEventListener('submit', saveFood);
  for (const id of ['foodWeight', 'foodKcal100', 'foodProt100', 'foodFat100', 'foodCarb100']) $(id).addEventListener('input', updatePortionPreview);
  onAction('openFood', button => openFood(button.dataset.value));
  onAction('editFood', button => editFood(button.dataset.value));
  onAction('toggleFood', button => {
    const food = state.foods.find(item => item.id === button.dataset.value);
    if (food) { food.checked = !food.checked; revealFoodId = food.id; changed({ nutrition: true }); }
  });
  onAction('deleteFood', async button => {
    const id = button.dataset.value;
    button.disabled = true;
    await removeRow(button.closest('.food-item'));
    const index = state.foods.findIndex(item => item.id === id);
    if (index < 0) return;
    const [food] = state.foods.splice(index, 1);
    changed({ nutrition: true });
    toast(t('food_deleted'), { label: t('undo'), run: () => { state.foods.splice(index, 0, food); revealFoodId = food.id; changed({ nutrition: true }); } });
  });
  onAction('addWater', button => addWater(Number(button.dataset.value)));
  onAction('openWater', () => { $('manualWaterInput').value = state.water; openDialog('waterEntryModal'); });
  $('waterForm').addEventListener('submit', event => {
    event.preventDefault(); if (!$('waterForm').reportValidity()) return;
    state.water = Math.max(0, Number($('manualWaterInput').value) || 0); changed(); closeDialog('waterEntryModal'); toast(t('saved'));
  });
  onAction('openMealTools', () => { renderTemplates(); openDialog('mealToolsModal'); });
  onAction('saveTemplate', async () => {
    if (!state.foods.length) { toast(t('no_dishes')); return; }
    const name = await promptValue(t('template_name'));
    if (!name) return;
    state.templates.push({ name, foods: structuredClone(state.foods) }); changed(); renderTemplates(); toast(t('template_saved'));
  });
  onAction('loadTemplate', async button => {
    const template = state.templates[Number(button.dataset.value)];
    if (!template || !(await confirmAction(t('load_template_confirm')))) return;
    state.foods = template.foods.map(food => ({ ...food, id: uid() }));
    changed({ nutrition: true }); closeDialog('mealToolsModal');
  });
  onAction('deleteTemplate', async button => {
    if (!(await confirmAction(t('delete_record')))) return;
    state.templates.splice(Number(button.dataset.value), 1); changed(); renderTemplates();
  });
  onAction('clearTodayFoods', async () => {
    if (!(await confirmAction(t('clear_food_confirm')))) return;
    state.foods = []; changed({ nutrition: true }); closeDialog('mealToolsModal');
  });
}
