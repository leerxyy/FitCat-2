import { state, persist } from '../core/store.js';
import { localDate } from '../core/math.js';
import { hasTodayWeather, locationKey, weatherTimeZone } from '../core/weather.js';
import { fetchDailyWeather, locateForWeather, searchWeatherCities } from '../services/weather.js';
import { t, locale } from '../core/i18n.js';
import { $, onAction, toast } from '../ui/components.js';

let generation = 0;
let controller;
let pending;
let busy = '';
let error = '';
let cityOpen = false;
let cityController;
let cityGeneration = 0;
let cityMessage = '';
let cityBusy = false;
let cities = [];
let lastAttempt = { key: '', at: 0 };

const automatic = () => state.preferences.waterTemperatureMode === 'auto';
const usable = () => Boolean(state.profile && state.preferences.smartWaterEnabled && automatic());
const notify = () => document.dispatchEvent(new CustomEvent('fitcat:change'));

function save(nextWeather, mode, temperature) {
  const previous = { weather: state.weather, mode: state.preferences.waterTemperatureMode, temperature: state.preferences.currentTemp };
  state.weather = nextWeather;
  state.preferences.waterTemperatureMode = mode;
  state.preferences.currentTemp = temperature;
  try { persist(); }
  catch {
    state.weather = previous.weather; state.preferences.waterTemperatureMode = previous.mode;
    state.preferences.currentTemp = previous.temperature;
    throw new Error('weather_save_error');
  }
  notify();
}

export function stopWeatherRequest() {
  ++generation; controller?.abort(); controller = null; pending = null; busy = ''; error = '';
  ++cityGeneration; cityController?.abort(); cityController = null; cityBusy = false; cityMessage = ''; cities = [];
}

export function useManualTemperature(value = state.preferences.currentTemp) {
  stopWeatherRequest();
  const temperature = Math.round(Math.max(-10, Math.min(40, Number(value) || 0)));
  try { save(state.weather, 'manual', temperature); }
  catch (failure) { error = failure.message; renderWeather(); toast(t(error)); }
}

export function renderWeather() {
  const auto = automatic();
  const weather = state.weather;
  const today = hasTodayWeather(weather);
  $('manualTempControls').hidden = auto;
  $('weatherAutoPanel').hidden = !auto;
  $('weatherFixedStamp').hidden = !auto || !today;
  $('weatherManualHint').hidden = auto;
  for (const button of document.querySelectorAll('[data-action="waterTemperatureMode"]')) {
    const selected = button.dataset.mode === state.preferences.waterTemperatureMode;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  $('weatherPlace').textContent = weather.location?.name || t(weather.location ? 'weather_saved_place' : 'weather_no_location');
  $('weatherPlace').classList.toggle('is-empty', !weather.location);
  $('weatherDayMean').hidden = !weather.daily;
  $('weatherStatus').textContent = t(busy || error || (today ? 'weather_ready' : 'weather_no_location'));
  $('weatherStatus').classList.toggle('is-error', Boolean(error));
  $('weatherStatus').hidden = !busy && !error && Boolean(weather.daily) && !today;
  $('weatherDate').hidden = !weather.daily;
  if (weather.daily) {
    const calculated = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(weather.daily.fetchedAt));
    $('weatherDate').textContent = `${t('weather_updated')}: ${calculated}`;
  }
  $('weatherFallback').hidden = !auto || today;
  $('weatherFallback').textContent = weather.daily
    ? `${t('weather_cached')} ${new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(weather.daily.date + 'T12:00:00'))}.`
    : t('weather_fallback');
  const showCities = cityOpen || !weather.location;
  $('weatherCityPicker').hidden = !showCities;
  $('weatherCityToggle').setAttribute('aria-expanded', String(showCities));
  $('weatherRefresh').hidden = !weather.location;
  $('weatherAutoPanel').setAttribute('aria-busy', String(Boolean(busy)));
  for (const id of ['weatherLocate', 'weatherRefresh']) $(id).disabled = Boolean(busy);
  $('weatherCitySubmit').disabled = cityBusy || Boolean(busy);
  $('weatherCityStatus').textContent = cityMessage ? t(cityMessage) : '';
  $('weatherCityStatus').hidden = !cityMessage;
  $('weatherCityResults').replaceChildren();
  cities.forEach((city, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'weather-city-result'; button.dataset.action = 'weatherChooseCity';
    button.dataset.index = String(index); button.textContent = city.name; button.disabled = Boolean(busy);
    $('weatherCityResults').append(button);
  });
}

async function updateForecast({ place = state.weather.location, locate = false } = {}) {
  stopWeatherRequest();
  const token = generation;
  controller = new AbortController();
  const signal = controller.signal;
  const now = new Date(); const timeZone = weatherTimeZone();
  busy = locate ? 'weather_locating' : 'weather_loading'; renderWeather();
  const operation = (async () => {
    try {
      if (globalThis.navigator?.onLine === false) throw new Error('weather_network');
      if (locate) place = await locateForWeather({ signal });
      if (token !== generation || !usable()) return false;
      busy = 'weather_loading'; renderWeather();
      const daily = await fetchDailyWeather(place, { now, timeZone, signal });
      if (token !== generation || !usable()) return false;
      if (localDate() !== localDate(now) || weatherTimeZone() !== timeZone) throw new Error('weather_day_changed');
      cityOpen = false; cities = []; error = '';
      save({ version: 1, location: place, daily }, 'auto', daily.temperature);
      return true;
    } catch (failure) {
      if (token === generation && failure.message !== 'weather_cancelled') {
        error = failure.message.startsWith('weather_') ? failure.message : 'weather_network';
        if (locate && !state.weather.location) cityOpen = true;
      }
      return false;
    } finally {
      if (token === generation) { busy = ''; controller = null; pending = null; renderWeather(); }
    }
  })();
  pending = operation;
  // The async body can finish synchronously (offline); avoid retaining a settled task.
  operation.finally(() => { if (pending === operation) pending = null; });
  return operation;
}

export function ensureDailyWeather() {
  if (!usable() || !state.weather.location || hasTodayWeather(state.weather)) return Promise.resolve(false);
  if (pending) return pending;
  const key = `${localDate()}|${weatherTimeZone()}|${locationKey(state.weather.location)}`;
  if (key === lastAttempt.key && Date.now() - lastAttempt.at < 300000) return Promise.resolve(false);
  lastAttempt = { key, at: Date.now() };
  return updateForecast();
}

export function initWeather() {
  onAction('waterTemperatureMode', button => {
    if (button.dataset.mode === 'manual') { useManualTemperature(); return; }
    stopWeatherRequest();
    try { save(state.weather, 'auto', state.weather.daily?.temperature ?? state.preferences.currentTemp); }
    catch (failure) { error = failure.message; renderWeather(); }
    void ensureDailyWeather();
  });
  onAction('weatherLocate', () => updateForecast({ locate: true }));
  onAction('weatherRefresh', () => updateForecast());
  onAction('weatherToggleCity', () => { cityOpen = !cityOpen; renderWeather(); if (cityOpen) $('weatherCityInput').focus({ preventScroll: true }); });
  onAction('weatherChooseCity', button => {
    const index = Number(button.dataset.index);
    const place = Number.isInteger(index) && index >= 0 ? cities[index] : null;
    if (place) return updateForecast({ place });
  });
  $('weatherCityForm').addEventListener('submit', async event => {
    event.preventDefault();
    ++cityGeneration; cityController?.abort();
    const token = cityGeneration; cityController = new AbortController();
    cityBusy = true; cityMessage = 'weather_searching'; cities = []; renderWeather();
    try {
      if (globalThis.navigator?.onLine === false) throw new Error('weather_network');
      const found = await searchWeatherCities($('weatherCityInput').value, { language: state.preferences.lang, signal: cityController.signal });
      if (token !== cityGeneration || !automatic()) return;
      cities = found; cityMessage = found.length ? '' : 'weather_city_empty';
    } catch (failure) {
      if (token === cityGeneration) cityMessage = failure.message.startsWith('weather_') ? failure.message : 'weather_network';
    } finally {
      if (token === cityGeneration) { cityBusy = false; cityController = null; renderWeather(); }
    }
  });
  window.addEventListener('online', () => { lastAttempt = { key: '', at: 0 }; void ensureDailyWeather(); });
}
