import { localDate } from './math.js';

export const WEATHER_VERSION = 1;
export const DAYTIME_START = 9;
export const DAYTIME_END = 21;
export const emptyWeather = () => ({ version: WEATHER_VERSION, location: null, daily: null });
const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) : '';
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;

export function normalizeLocation(value) {
  if (!value || !finite(value.latitude, -90, 90) || !finite(value.longitude, -180, 180)
    || !['gps', 'city'].includes(value.source)) return null;
  return {
    // A roughly kilometre-sized area is enough for weather. Never persist precise GPS.
    latitude: Math.round(value.latitude * 100) / 100,
    longitude: Math.round(value.longitude * 100) / 100,
    source: value.source, name: value.source === 'city' ? text(value.name) : '',
  };
}

export function locationKey(location) {
  const place = normalizeLocation(location);
  return place ? `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}` : '';
}

export function normalizeWeather(value) {
  const result = emptyWeather();
  result.location = normalizeLocation(value?.location);
  const daily = value?.daily;
  if (result.location && daily && validDate(daily.date) && finite(daily.temperature, -100, 70)
    && typeof daily.timeZone === 'string' && daily.timeZone.length <= 80
    && finite(daily.fetchedAt, 1, Number.MAX_SAFE_INTEGER) && daily.locationKey === locationKey(result.location)) {
    result.daily = {
      date: daily.date, temperature: Math.round(daily.temperature * 10) / 10,
      timeZone: daily.timeZone, fetchedAt: daily.fetchedAt, locationKey: daily.locationKey,
    };
  }
  return result;
}

export function weatherTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function hasTodayWeather(weather, now = new Date(), timeZone = weatherTimeZone()) {
  return Boolean(weather?.daily && weather.daily.date === localDate(now)
    && weather.daily.timeZone === timeZone && weather.daily.locationKey === locationKey(weather.location));
}

export function daytimeAverage(payload, date) {
  const times = payload?.hourly?.time;
  const values = payload?.hourly?.temperature_2m;
  if (!validDate(date) || !Array.isArray(times) || !Array.isArray(values)) throw new Error('weather_incomplete');
  const readings = [];
  for (let hour = DAYTIME_START; hour < DAYTIME_END; hour++) {
    const index = times.indexOf(`${date}T${String(hour).padStart(2, '0')}:00`);
    const value = values[index];
    if (index < 0 || !finite(value, -100, 70)) throw new Error('weather_incomplete');
    readings.push(value);
  }
  return Math.round(readings.reduce((sum, value) => sum + value, 0) / readings.length * 10) / 10;
}
