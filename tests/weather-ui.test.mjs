import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, submit, activeProFixture } from './dom.mjs';

test('automatic weather remains fixed for the day, handles offline use and respects manual overrides', async t => {
  const env = setupDOM({ ...activeProFixture(), fitnessProfile: JSON.stringify({ name: 'Тест', age: 20, gender: 'male', height: 170, weight: 52, goal: 'maintain' }),
    lastDate: new Date().toDateString(), smartWaterEnabled: 'true', currentTemp: '22', currentSteps: '12800', waterAmount: '750' });
  const originalFetch = globalThis.fetch;
  const $ = id => document.getElementById(id);
  const { localDate } = await import('../js/core/math.js');
  const day = localDate();
  let forecastCalls = 0; let geoCalls = 0; let dailyTemperature = 27; let failNetwork = false; let holdForecast;
  globalThis.fetch = async (url, options) => {
    const address = new URL(url);
    if (address.hostname === 'geocoding-api.open-meteo.com') return { ok: true, json: async () => ({ results: [
      { name: '<Test City>', country: 'RU', latitude: 55.16, longitude: 61.4 },
    ] }) };
    assert.equal(address.hostname, 'api.open-meteo.com'); ++forecastCalls;
    if (holdForecast) await holdForecast;
    if (failNetwork) throw new Error('offline');
    const temperature = dailyTemperature;
    return { ok: true, json: async () => ({ hourly: {
      time: Array.from({ length: 24 }, (_, hour) => `${day}T${String(hour).padStart(2, '0')}:00`),
      temperature_2m: Array.from({ length: 24 }, (_, hour) => hour >= 9 && hour < 21 ? temperature : -10),
    } }) };
  };
  const click = async selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); await tick(); await tick(); };
  try {
    await import('../js/app.js');
    const { state, loadState, targets } = await import('../js/core/store.js');
    const { ensureDailyWeather } = await import('../js/features/weather.js');
    const { renderPreferences } = await import('../js/features/preferences.js');
    navigator.onLine = true;
    navigator.geolocation = { getCurrentPosition(success) { ++geoCalls; success({ coords: { latitude: 55.164441, longitude: 61.403321 } }); } };

    await t.test('activation requests no location until the location button is pressed', async () => {
      await click('[data-action="openSmartWater"]');
      await click('[data-action="waterTemperatureMode"][data-mode="auto"]');
      assert.equal(geoCalls, 0); assert.equal(forecastCalls, 0); assert.equal($('weatherAutoPanel').hidden, false);
      assert.equal($('manualTempControls').hidden, true); assert.equal($('weatherCityPicker').hidden, false);
      await click('#weatherLocate');
      assert.equal(geoCalls, 1); assert.equal(forecastCalls, 1); assert.equal(state.preferences.currentTemp, 27);
      assert.equal($('weatherFixedStamp').hidden, false); assert.equal($('tempBonusChip').textContent, '+300 мл');
      assert.equal($('smartWaterGoal').textContent, '2,37'); assert.equal($('waterGoal').textContent, '2,37 л');
      assert.equal(state.water, 750);
    });

    await t.test('reopening, background return and reload keep the day goal without new requests', async () => {
      dailyTemperature = 10;
      await ensureDailyWeather(); document.dispatchEvent(new Event('visibilitychange')); await tick();
      await click('#smartWaterModal [data-sheet-handle]'); await click('[data-action="openSmartWater"]');
      loadState(env.localStorage); renderPreferences(); await ensureDailyWeather();
      assert.equal(forecastCalls, 1); assert.equal(geoCalls, 1); assert.equal(state.preferences.currentTemp, 27);
      assert.equal(targets().water, 2370); assert.match($('weatherStatus').textContent, /зафиксирована/);
    });

    await t.test('offline failure keeps the saved adjustment and a retry replaces it only on request', async () => {
      navigator.onLine = false; await click('#weatherRefresh');
      assert.equal(state.preferences.currentTemp, 27); assert.match($('weatherStatus').textContent, /интернет/);
      navigator.onLine = true; await click('#weatherRefresh');
      assert.equal(forecastCalls, 2); assert.equal(state.preferences.currentTemp, 10); assert.equal(targets().water, 2070);
      assert.equal($('weatherFixedStamp').hidden, false);
    });

    await t.test('a city can replace GPS, and its name is rendered as text', async () => {
      await click('#weatherCityToggle'); $('weatherCityInput').value = 'Test'; submit($('weatherCityForm')); await tick(); await tick();
      const result = $('weatherCityResults').querySelector('button'); assert.ok(result); assert.match(result.textContent, /<Test City>/);
      assert.equal(result.querySelector('test'), null); await click('[data-action="weatherChooseCity"]');
      assert.equal(state.weather.location.source, 'city'); assert.equal($('weatherPlace').textContent, '<Test City>, RU');
      assert.equal($('weatherCityPicker').hidden, true);
    });

    await t.test('late results cannot overwrite a manual temperature or change the saved diary', async () => {
      let release; holdForecast = new Promise(resolve => { release = resolve; }); dailyTemperature = 35;
      const started = forecastCalls;
      await click('#weatherRefresh'); assert.equal(forecastCalls, started + 1);
      await click('[data-action="waterTemperatureMode"][data-mode="manual"]');
      $('tempSlider').value = '18'; $('tempSlider').dispatchEvent(new Event('input', { bubbles: true })); await tick();
      release(); holdForecast = null; await tick(); await tick();
      assert.equal(state.preferences.waterTemperatureMode, 'manual'); assert.equal(state.preferences.currentTemp, 18);
      assert.equal($('tempBonusChip').textContent, '+50 мл'); assert.equal(state.water, 750); assert.equal(env.localStorage.getItem('waterAmount'), '750');
    });

    await t.test('a new local day refreshes once and an unavailable next-day forecast is explicitly dated', async () => {
      await click('[data-action="waterTemperatureMode"][data-mode="auto"]');
      const before = forecastCalls;
      state.weather.daily.date = '2020-01-01'; failNetwork = true;
      await ensureDailyWeather(); await tick();
      assert.equal(forecastCalls, before + 1); assert.equal($('weatherFixedStamp').hidden, true);
      assert.equal($('weatherFallback').hidden, false); assert.match($('weatherFallback').textContent, /2020|янв/);
      await ensureDailyWeather(); assert.equal(forecastCalls, before + 1);
      failNetwork = false; await click('#weatherRefresh');
      assert.equal(state.weather.daily.date, day); assert.equal(state.preferences.currentTemp, 35);
      await ensureDailyWeather(); assert.equal(forecastCalls, before + 2);
    });

    await t.test('GPS rejection retains the old city, and weather controls translate', async () => {
      const oldCity = state.weather.location.name;
      navigator.geolocation = { getCurrentPosition(success, failure) { failure({ code: 1 }); } };
      await click('#weatherLocate'); assert.equal(state.weather.location.name, oldCity); assert.match($('weatherStatus').textContent, /закрыт/);
      state.preferences.lang = 'en'; document.dispatchEvent(new Event('fitcat:language')); await tick();
      assert.match($('weatherStatus').textContent, /blocked/); assert.equal($('weatherRefresh').textContent, 'Recalculate for today');
      state.preferences.lang = 'cn'; document.dispatchEvent(new Event('fitcat:language')); await tick();
      assert.match($('weatherStatus').textContent, /位置权限/); assert.equal($('weatherCityToggle').textContent, '选择城市');
    });
  } finally { globalThis.fetch = originalFetch; env.restoreTimers(); }
});
