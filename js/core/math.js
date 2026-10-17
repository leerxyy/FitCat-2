// Formula coefficients are retained from the supplied FitCat source.
export const ACTIVITY_LEVELS = [1.2, 1.375, 1.55, 1.725];
export const WORKOUT_CALORIES = { light: 150, moderate: 250, intense: 400 };
export const WORKOUT_WATER = { light: 150, moderate: 250, intense: 400 };

export function temperatureBonus(value) {
  if (value < 15) return 0;
  if (value < 20) return 50;
  if (value < 25) return 150;
  if (value < 30) return 300;
  return 500;
}

export function stepsBonus(value) {
  if (value < 2500) return 0;
  if (value < 5000) return 50;
  if (value < 7500) return 100;
  if (value < 10000) return 150;
  if (value < 12500) return 200;
  if (value < 15000) return 250;
  return 300;
}

export function calculateTargets(profile, preferences) {
  if (!profile) return { kcal: 0, protein: 0, fat: 0, carbs: 0, water: 0 };
  const { weight, height, age, gender, goal = 'lose' } = profile;
  const bmr = gender === 'female'
    ? 447.6 + 9.2 * weight + 3.1 * height - 4.3 * age
    : 88.36 + 13.4 * weight + 4.8 * height - 5.7 * age;
  const training = preferences.workoutEnabled ? WORKOUT_CALORIES[preferences.workoutIntensity] || 150 : 0;
  const tdee = bmr * preferences.dailyActivity + training;
  const multiplier = goal === 'lose' ? 0.85 : goal === 'gain' ? 1.10 : 1;
  const waterTraining = preferences.workoutEnabled ? WORKOUT_WATER[preferences.workoutIntensity] || 150 : 0;
  const waterExtras = preferences.smartWaterEnabled
    ? temperatureBonus(preferences.currentTemp) + stepsBonus(preferences.currentSteps) : 0;
  return {
    kcal: Math.round(tdee * multiplier),
    protein: Math.round(weight * 1.8),
    fat: Math.round(weight * 0.9),
    carbs: Math.max(0, Math.round((tdee * multiplier - weight * 1.8 * 4 - weight * 0.9 * 9) / 4)),
    water: Math.round(weight * 35) + waterTraining + waterExtras,
  };
}

export function nutritionTotal(foods, checkedOnly = true) {
  const total = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const food of foods) {
    if (checkedOnly && !food.checked) continue;
    for (const key of Object.keys(total)) total[key] += Number(food[key]) || 0;
  }
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value * 10) / 10]));
}

export function portion(product, weight) {
  const multiplier = weight / 100;
  return {
    protein: Math.round(product.protein * multiplier * 10) / 10,
    fat: Math.round(product.fat * multiplier * 10) / 10,
    carbs: Math.round(product.carbs * multiplier * 10) / 10,
    kcal: Math.round(product.kcal * multiplier),
  };
}

export function bmi(profile) {
  return profile?.height > 0 ? profile.weight / (profile.height / 100) ** 2 : 0;
}

export function bmiCategory(value) {
  if (value < 16) return 'bmi_underweight_severe';
  if (value < 18.5) return 'bmi_underweight';
  if (value < 25) return 'bmi_normal';
  if (value < 30) return 'bmi_overweight';
  if (value < 35) return 'bmi_obese_i';
  if (value < 40) return 'bmi_obese_ii';
  return 'bmi_obese_iii';
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
