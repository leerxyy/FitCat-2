import { state } from '../core/store.js';
import { t, number } from '../core/i18n.js';
import { loadScript, fetchJSON } from '../core/loader.js';
import { $, icon, escapeHTML, safeImage, onAction, changed, openDialog, closeDialog, toast, confirmAction } from '../ui/components.js';
import { showScreen } from '../ui/navigation.js';
import { openFood, fillFoodForm } from './diary.js';
import { play, MOTION } from '../ui/motion.js';

let suggestions = [];
let searchTimer;
let searchController;
let requestNumber = 0;
let searchPending = false;
let searchMessage = '';
let suggestionMotion;
let scannerToken = 0;
let reader = null;
let quagga = null;
let quaggaCallback = null;
let editIndex = -1;

export function productFromOFF(product) {
  const nutrients = product.nutriments || {};
  const value = key => Math.max(0, Number(nutrients[key]) || 0);
  return {
    name: product.product_name || product.product_name_en || '', brand: product.brands || '',
    kcal: nutrients['energy-kcal_100g'] != null ? value('energy-kcal_100g') : value('energy_100g') / 4.184,
    protein: value('proteins_100g'), fat: value('fat_100g'), carbs: value('carbohydrates_100g'),
    image: safeImage(product.image_front_small_url || product.image_small_url),
  };
}

function renderSuggestions() {
  const list = $('autocompleteList');
  const before = !list.hidden && list.getBoundingClientRect?.().height;
  const focused = document.activeElement?.closest?.('.autocomplete-item')?.dataset.value;
  suggestionMotion?.cancel();
  list.hidden = !suggestions.length && !searchPending;
  list.classList.toggle('search-loading', searchPending);
  list.setAttribute('aria-busy', String(searchPending));
  $('foodName').setAttribute('aria-busy', String(searchPending));
  $('foodName').setAttribute('aria-expanded', String(!list.hidden));
  $('searchStatus').textContent = searchMessage ? t(searchMessage) : '';
  list.innerHTML = suggestions.map((product, index) => `<button type="button" class="autocomplete-item" data-action="chooseProduct" data-value="${index}">${icon(product.local ? 'template' : 'search')}<span><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.brand || t(product.local ? 'local_product' : 'per_100g'))} · ${number(product.kcal)} ${t('kcal')}</small></span></button>`).join('')
    + (searchPending ? `<div class="search-skeleton" aria-hidden="true">${Array.from({ length: 3 }, () => '<div class="search-skeleton-row"><i></i><span><b></b><small></small></span></div>').join('')}</div>` : '');
  if (focused != null) list.querySelector(`[data-value="${focused}"]`)?.focus({ preventScroll: true });
  if (!list.hidden) {
    const after = list.getBoundingClientRect?.().height;
    const frames = before && after ? [{ height: `${before}px`, opacity: .75 }, { height: `${after}px`, opacity: 1 }] : [{ opacity: .6, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'translateY(0)' }];
    suggestionMotion = play(list, frames, { duration: MOTION.close });
  }
}

function stopSearch() {
  ++requestNumber; clearTimeout(searchTimer); searchController?.abort(); searchController = null;
  searchPending = false; searchMessage = ''; suggestions = []; renderSuggestions();
}

async function searchProducts() {
  const query = $('foodName').value.trim();
  const request = ++requestNumber;
  searchController?.abort();
  clearTimeout(searchTimer);
  searchPending = false; searchMessage = '';
  if (query.length < 2) { suggestions = []; renderSuggestions(); return; }
  const local = state.products.filter(product => product.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 5).map(product => ({ ...product, local: true }));
  suggestions = local; renderSuggestions();
  if (!state.preferences.smartSearchEnabled) return;
  if (navigator.onLine === false) { searchMessage = 'network_error'; renderSuggestions(); return; }
  searchPending = true; searchMessage = 'searching'; renderSuggestions();
  searchTimer = setTimeout(async () => {
    if (request !== requestNumber || !$('foodEntryModal').open) return;
    const controller = new AbortController(); searchController = controller;
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.search = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: String(state.preferences.smartSearchResults), fields: 'product_name,brands,nutriments,image_front_small_url,image_small_url' });
    try {
      const data = await fetchJSON(url, 12000, { signal: controller.signal });
      if (request !== requestNumber) return;
      const products = (data.products || []).map(productFromOFF).filter(product => product.name);
      const names = new Set(local.map(product => product.name.toLocaleLowerCase()));
      suggestions = [...local, ...products.filter(product => !names.has(product.name.toLocaleLowerCase()))];
      searchPending = false; searchMessage = suggestions.length ? '' : 'product_not_found'; renderSuggestions();
    } catch (error) {
      if (request !== requestNumber) return;
      suggestions = local; searchPending = false; searchMessage = 'network_error'; renderSuggestions();
    } finally {
      if (request === requestNumber) searchController = null;
    }
  }, 400);
}

export function renderProducts() {
  $('productsList').innerHTML = state.products.length ? state.products.map((product, index) => `
    <div class="product-item"><div><strong>${escapeHTML(product.name)}</strong><small>${number(product.kcal)} ${t('kcal')} · ${t('protein_short')} ${number(product.protein, 1)} · ${t('fat_short')} ${number(product.fat, 1)} · ${t('carbs_short')} ${number(product.carbs, 1)} / 100 ${t('g')}</small></div><button type="button" class="icon-button" data-action="editProduct" data-value="${index}" aria-label="${escapeHTML(t('edit') + ': ' + product.name)}">${icon('edit')}</button><button type="button" class="icon-button" data-action="deleteProduct" data-value="${index}" aria-label="${escapeHTML(t('delete') + ': ' + product.name)}">${icon('trash')}</button></div>`).join('') : `<div class="empty-state">${icon('meal')}<strong>${t('no_history')}</strong><p>${t('empty_food')}</p></div>`;
}

export async function lookupBarcode(barcode) {
  const cleaned = String(barcode || '').replace(/[\s-]/g, '');
  if (!/^\d{6,14}$/.test(cleaned)) { $('manualBarcode').focus(); return; }
  $('scannerHint').textContent = t('searching');
  try {
    const data = await fetchJSON(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(cleaned)}.json`);
    if (!data.product || data.status === 0) { $('scannerHint').textContent = t('product_not_found'); return; }
    fillFoodForm(productFromOFF(data.product)); stopScanner(); closeDialog('scannerModal');
  } catch { $('scannerHint').textContent = t('network_error'); }
}

export function stopScanner() {
  scannerToken++;
  try { reader?.reset(); } catch { /* Camera may already be stopped. */ }
  reader = null;
  if (quagga) {
    try { if (quaggaCallback) quagga.offDetected(quaggaCallback); quagga.stop(); } catch { /* Not started. */ }
  }
  quagga = null; quaggaCallback = null;
  document.querySelectorAll('#scannerModal video').forEach(video => {
    video.srcObject?.getTracks().forEach(track => track.stop()); video.srcObject = null;
  });
  $('quaggaView')?.remove();
}

export async function openScanner() {
  document.dispatchEvent(new Event('fitcat:scanner'));
  if (!$('foodEntryModal').open) openFood();
  openDialog('scannerModal');
  $('scannerHint').textContent = t('scanner_loading');
  if (!navigator.mediaDevices?.getUserMedia) { $('scannerHint').textContent = t('camera_unavailable'); return; }
  stopScanner(); const token = scannerToken;
  $('scannerVideo').hidden = false;
  try {
    const ZXing = await loadScript('https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js', 'ZXing');
    if (token !== scannerToken || !$('scannerModal').open) return;
    reader = new ZXing.BrowserMultiFormatReader();
    await reader.decodeFromVideoDevice(null, $('scannerVideo'), result => {
      if (result && token === scannerToken) { const value = result.getText?.() || result.text; stopScanner(); lookupBarcode(value); }
    });
    if (token === scannerToken) $('scannerHint').textContent = t('scanner_hint');
  } catch (error) {
    try { reader?.reset(); } catch { /* Nothing to reset. */ }
    reader = null;
    if (token !== scannerToken || !$('scannerModal').open) return;
    if (['NotAllowedError', 'SecurityError'].includes(error.name)) { $('scannerHint').textContent = t('camera_error'); return; }
    try {
      const Quagga = await loadScript('https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js', 'Quagga');
      if (token !== scannerToken || !$('scannerModal').open) return;
      const view = document.createElement('div'); view.id = 'quaggaView'; $('scannerVideo').after(view); $('scannerVideo').hidden = true;
      quagga = Quagga;
      await new Promise((resolve, reject) => Quagga.init({ inputStream: { type: 'LiveStream', target: view, constraints: { facingMode: 'environment' } }, decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader'] }, locate: true, numOfWorkers: 0 }, error => error ? reject(error) : resolve()));
      if (token !== scannerToken) { Quagga.stop(); return; }
      quaggaCallback = result => { if (result?.codeResult?.code && token === scannerToken) { const value = result.codeResult.code; stopScanner(); lookupBarcode(value); } };
      Quagga.onDetected(quaggaCallback); Quagga.start(); $('scannerHint').textContent = t('scanner_hint');
    } catch { $('scannerHint').textContent = t('camera_error'); }
  }
}

export function initProducts() {
  $('foodName').addEventListener('input', searchProducts);
  $('foodName').addEventListener('keydown', event => {
    if (event.key === 'Escape') stopSearch();
    if (event.key === 'ArrowDown' && !$('autocompleteList').hidden) { event.preventDefault(); $('autocompleteList').querySelector('button')?.focus(); }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.with-autocomplete') && (!$('autocompleteList').hidden || searchPending)) stopSearch();
  });
  $('foodEntryModal').addEventListener('close', stopSearch);
  document.addEventListener('fitcat:food-open', stopSearch);
  document.addEventListener('fitcat:product-picked', stopSearch);
  document.addEventListener('fitcat:language', renderSuggestions);
  document.addEventListener('fitcat:change', () => { if (!state.preferences.smartSearchEnabled && searchPending) stopSearch(); });
  onAction('chooseProduct', button => {
    const product = suggestions[Number(button.dataset.value)]; if (product) { fillFoodForm(product); $('searchStatus').textContent = ''; }
  });
  onAction('showProductsManager', () => { closeDialog('mealToolsModal'); renderProducts(); showScreen('productsPage'); });
  onAction('editProduct', button => {
    editIndex = Number(button.dataset.value); const product = state.products[editIndex]; if (!product) return;
    $('productEditName').value = product.name;
    for (const key of ['kcal','protein','fat','carbs']) $('productEdit' + key[0].toUpperCase() + key.slice(1)).value = Number(product[key]) || 0;
    openDialog('productEditModal');
  });
  $('productEditForm').addEventListener('submit', event => {
    event.preventDefault(); if (!$('productEditForm').reportValidity() || !state.products[editIndex]) return;
    const name = $('productEditName').value.trim(); if (!name) return;
    const product = { ...state.products[editIndex], name };
    for (const key of ['kcal','protein','fat','carbs']) product[key] = Number($('productEdit' + key[0].toUpperCase() + key.slice(1)).value);
    state.products[editIndex] = product; changed(); closeDialog('productEditModal'); renderProducts(); toast(t('saved'));
  });
  onAction('deleteProduct', async button => {
    if (!(await confirmAction(t('delete_product')))) return;
    state.products.splice(Number(button.dataset.value), 1); changed(); renderProducts();
  });
  onAction('openScanner', openScanner);
  onAction('closeScanner', () => { stopScanner(); closeDialog('scannerModal'); });
  onAction('lookupBarcode', () => lookupBarcode($('manualBarcode').value));
  $('manualBarcode').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); lookupBarcode(event.target.value); } });
  $('scannerModal').addEventListener('close', stopScanner);
  window.addEventListener('pagehide', stopScanner);
}
