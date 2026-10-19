import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, temperatureBonus } from '../js/core/math.js';
import { daytimeAverage, emptyWeather, hasTodayWeather, locationKey, normalizeLocation, normalizeWeather } from '../js/core/weather.js';
import { fetchDailyWeather, searchWeatherCities, locateForWeather } from '../js/services/weather.js';
import { loadState, state, persist, exportSnapshot, importSnapshot, clearAccount } from '../js/core/store.js';

const now = new Date(2026, 9, 18, 7, 45);
const date = localDate(now);
const place = { latitude: 55.16, longitude: 61.4, name: 'Челябинск', source: 'city' };
const payload = (temperature = 27, day = date) => ({ hourly: {
  time: Array.from({ length: 24 }, (_, hour) => `${day}T${String(hour).padStart(2, '0')}:00`),
  temperature_2m: Array.from({ length: 24 }, (_, hour) => hour >= 9 && hour < 21 ? temperature : -5),
} });
const snapshot = { date, timeZone: 'Asia/Yekaterinburg', temperature: 27, fetchedAt: now.getTime(), locationKey: locationKey(place) };
const storage = () => {
  const map = new Map();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
};

test('daytime average uses all twelve daytime hours and excludes the cold night', () => {
  const forecast = payload(); forecast.hourly.temperature_2m[10] = 28.2;
  assert.equal(daytimeAverage(forecast, date), 27.1);
  assert.equal(temperatureBonus(daytimeAverage(forecast, date)), 300);
});

test('missing, null, non-finite or wrong-day readings cannot become a made-up forecast', () => {
  for (const bad of [null, NaN, '27', undefined, 1000]) {
    const forecast = payload(); forecast.hourly.temperature_2m[12] = bad;
    assert.throws(() => daytimeAverage(forecast, date), /weather_incomplete/);
  }
  assert.throws(() => daytimeAverage(payload(), '2026-02-30'), /weather_incomplete/);
  assert.throws(() => daytimeAverage(payload(), '2026-10-19'), /weather_incomplete/);
});

test('GPS is rounded before use and precise coordinates never enter the saved weather record', () => {
  const gps = normalizeLocation({ latitude: 55.164441, longitude: 61.403321, source: 'gps', name: 'private address' });
  assert.deepEqual(gps, { latitude: 55.16, longitude: 61.4, source: 'gps', name: '' });
  assert.equal(normalizeLocation({ latitude: null, longitude: 0, source: 'gps' }), null);
  assert.equal(normalizeLocation({ latitude: 91, longitude: 0, source: 'gps' }), null);
});

test('a daily lock expires on the local date, a changed place or a changed timezone', () => {
  const weather = normalizeWeather({ location: place, daily: snapshot });
  assert.equal(hasTodayWeather(weather, now, 'Asia/Yekaterinburg'), true);
  assert.equal(hasTodayWeather(weather, new Date(2026, 9, 19, 0, 1), 'Asia/Yekaterinburg'), false);
  assert.equal(hasTodayWeather(weather, now, 'Europe/Moscow'), false);
  assert.equal(hasTodayWeather({ ...weather, location: { ...place, latitude: 56 } }, now, 'Asia/Yekaterinburg'), false);
  assert.equal(normalizeWeather({ location: place, daily: { ...snapshot, temperature: null } }).daily, null);
});

test('forecast request sends only rounded coordinates, Celsius, the local day and the chosen timezone', async () => {
  let request;
  const daily = await fetchDailyWeather({ ...place, latitude: 55.164441 }, { now, timeZone: 'Asia/Yekaterinburg', fetcher: async (url, options) => {
    request = { url: new URL(url), options }; return { ok: true, json: async () => payload() };
  } });
  assert.equal(request.url.origin, 'https://api.open-meteo.com');
  assert.equal(request.url.searchParams.get('latitude'), '55.16');
  assert.equal(request.url.searchParams.get('timezone'), 'Asia/Yekaterinburg');
  assert.equal(request.url.searchParams.get('start_date'), date);
  assert.equal(request.url.searchParams.get('end_date'), date);
  assert.equal(request.url.searchParams.get('hourly'), 'temperature_2m');
  assert.equal(request.options.credentials, 'omit'); assert.equal(request.options.cache, 'no-store');
  assert.deepEqual(daily, snapshot);
});

test('network and API limit failures are distinguishable without overwriting the old forecast', async () => {
  await assert.rejects(fetchDailyWeather(place, { now, fetcher: async () => { throw new Error('offline'); } }), /weather_network/);
  await assert.rejects(fetchDailyWeather(place, { now, fetcher: async () => ({ ok: false, status: 429 }) }), /weather_rate_limit/);
  await assert.rejects(fetchDailyWeather(place, { now, fetcher: async () => ({ ok: true, json: async () => ({ hourly: {} }) }) }), /weather_incomplete/);
});

test('city search encodes input, maps Chinese locale and filters invalid coordinates', async () => {
  let url;
  const result = await searchWeatherCities('北京 & test', { language: 'cn', fetcher: async value => {
    url = new URL(value); return { ok: true, json: async () => ({ results: [
      { name: '北京', country: '中国', latitude: 39.90421, longitude: 116.4074 },
      { name: 'Broken', latitude: null, longitude: 0 },
    ] }) };
  } });
  assert.equal(url.searchParams.get('name'), '北京 & test'); assert.equal(url.searchParams.get('language'), 'zh');
  assert.equal(result.length, 1); assert.equal(result[0].name, '北京, 中国'); assert.equal(result[0].latitude, 39.9);
  await assert.rejects(searchWeatherCities('a'), /weather_city_short/);
});

test('geolocation handles approval, rejection, missing support and cancellation', async () => {
  const gps = await locateForWeather({ secure: true, geolocation: { getCurrentPosition(success, failure, options) {
    assert.equal(options.enableHighAccuracy, false); success({ coords: { latitude: 55.164441, longitude: 61.403321 } });
  } } });
  assert.equal(gps.latitude, 55.16);
  await assert.rejects(locateForWeather({ secure: false }), /weather_secure/);
  await assert.rejects(locateForWeather({ secure: true, geolocation: null }), /weather_geo_unavailable/);
  await assert.rejects(locateForWeather({ secure: true, geolocation: { getCurrentPosition(success, failure) { failure({ code: 1 }); } } }), /weather_geo_denied/);
  const controller = new AbortController();
  const pending = locateForWeather({ secure: true, signal: controller.signal, geolocation: { getCurrentPosition() {} } });
  controller.abort(); await assert.rejects(pending, /weather_cancelled/);
});

test('weather survives reload and backups while diary, wallet and subscription keys keep their data', () => {
  const adapter = storage(); loadState(adapter);
  state.profile = { name: 'Тест', age: 20, gender: 'male', weight: 52, height: 170, goal: 'maintain' };
  state.water = 750; state.preferences.waterTemperatureMode = 'auto'; state.preferences.currentTemp = 27;
  state.weather = { version: 1, location: place, daily: snapshot }; persist();
  // Wallets now participate in backups, so use an actual valid legacy ledger.
  const wallet = JSON.stringify({ version: 1, balance: 47, entries: [{ id: 'legacy-credit', kind: 'promo', amount: 47, at: now.getTime(), balanceAfter: 47 }], redeemed: [], subscription: null });
  adapter.setItem('fitcat_wallet_v1', wallet); adapter.setItem('fitcat_subscription_v1', 'subscription-preserved');
  loadState(adapter); assert.deepEqual(state.weather.daily, snapshot); assert.equal(state.water, 750);
  const backup = structuredClone(exportSnapshot()); state.weather = emptyWeather(); persist(); importSnapshot(backup); loadState(adapter);
  assert.deepEqual(state.weather.daily, snapshot); assert.equal(state.preferences.currentTemp, 27);
  assert.equal(adapter.getItem('fitcat_wallet_v1'), wallet); assert.equal(adapter.getItem('fitcat_subscription_v1'), 'subscription-preserved');
  clearAccount(); assert.equal(adapter.getItem('fitcat_weather_v1'), null); assert.equal(adapter.getItem('fitcat_wallet_v1'), wallet);
});
