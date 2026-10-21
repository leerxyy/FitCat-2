import { localDate } from '../core/math.js';
import { daytimeAverage, locationKey, normalizeLocation, weatherTimeZone } from '../core/weather.js';

// Open-access endpoint for this non-commercial prototype. Commercial release needs
// a licensed provider/endpoint; never embed a paid API secret in the static PWA.
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CITY_URL = 'https://geocoding-api.open-meteo.com/v1/search';

async function requestJSON(url, { fetcher = globalThis.fetch, signal, timeout = 12000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  try {
    const response = await fetcher(url, {
      signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'weather_rate_limit' : 'weather_network');
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw new Error('weather_cancelled');
    if (timedOut) throw new Error('weather_timeout');
    if (String(error.message).startsWith('weather_')) throw error;
    throw new Error('weather_network');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

export async function fetchDailyWeather(location, { now = new Date(), timeZone = weatherTimeZone(), ...options } = {}) {
  const place = normalizeLocation(location);
  if (!place) throw new Error('weather_location_required');
  const date = localDate(now);
  const url = new URL(FORECAST_URL);
  url.search = new URLSearchParams({
    latitude: String(place.latitude), longitude: String(place.longitude),
    hourly: 'temperature_2m', temperature_unit: 'celsius', timezone: timeZone,
    start_date: date, end_date: date,
  });
  const payload = await requestJSON(url.href, options);
  return {
    date, timeZone, temperature: daytimeAverage(payload, date),
    fetchedAt: now.getTime(), locationKey: locationKey(place),
  };
}

export async function searchWeatherCities(query, { language = 'ru', ...options } = {}) {
  const name = String(query).trim();
  if (name.length < 2 || name.length > 100) throw new Error('weather_city_short');
  const url = new URL(CITY_URL);
  url.search = new URLSearchParams({ name, count: '5', language: language === 'cn' ? 'zh' : language, format: 'json' });
  const payload = await requestJSON(url.href, options);
  return (Array.isArray(payload?.results) ? payload.results : []).map(city => normalizeLocation({
    latitude: city.latitude, longitude: city.longitude, source: 'city',
    name: [city.name, city.admin1, city.country].filter((part, i, list) => typeof part === 'string' && part && list.indexOf(part) === i).join(', '),
  })).filter(Boolean);
}

export function locateForWeather({ geolocation = globalThis.navigator?.geolocation, secure = globalThis.isSecureContext, signal, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (secure === false) { reject(new Error('weather_secure')); return; }
    if (!geolocation?.getCurrentPosition) { reject(new Error('weather_geo_unavailable')); return; }
    let finished = false;
    let timer;
    const finish = (error, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(new Error(error)); else resolve(value);
    };
    const abort = () => finish('weather_cancelled');
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish('weather_geo_timeout'), timeout + 500);
    try {
      geolocation.getCurrentPosition(position => {
        const place = normalizeLocation({ latitude: position?.coords?.latitude, longitude: position?.coords?.longitude, source: 'gps' });
        finish(place ? null : 'weather_geo_unavailable', place);
      }, error => finish(error?.code === 1 ? 'weather_geo_denied' : error?.code === 3 ? 'weather_geo_timeout' : 'weather_geo_unavailable'), {
        enableHighAccuracy: false, maximumAge: 600000, timeout,
      });
    } catch { finish('weather_geo_unavailable'); }
  });
}
