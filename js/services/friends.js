import { state, targets } from '../core/store.js';
import { nutritionTotal, clamp } from '../core/math.js';
import { t, number } from '../core/i18n.js';
import { loadScript } from '../core/loader.js';
import { $, icon, initials, escapeHTML, onAction, changed, openDialog, closeDialog, toast, confirmAction } from '../ui/components.js';
import { activeTab } from '../ui/navigation.js';

let database;
let connecting;
let publishTimer;
let connectedUid = '';
let presenceUnsubscribe;
let listVersion = 0;
const subscriptions = new Map();
const friendData = new Map();

async function connect() {
  if (database) return database;
  if (connecting) return connecting;
  connecting = (async () => {
    const firebase = await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js', 'firebase');
    await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js', () => globalThis.firebase?.database);
    if (!firebase.apps.length) firebase.initializeApp({ databaseURL: 'https://fitcat-4a360-default-rtdb.asia-southeast1.firebasedatabase.app/' });
    database = firebase.database();
    return database;
  })();
  try { return await connecting; } finally { connecting = null; }
}

export function queuePublish() {
  clearTimeout(publishTimer);
  if (!state.profile || !navigator.onLine) return;
  publishTimer = setTimeout(() => publishProgress().catch(error => console.warn('FitCat friends:', error.message)), 600);
}

async function publishProgress() {
  if (!state.profile || !navigator.onLine) return;
  const db = await connect();
  if (!state.profile) return;
  const ref = db.ref(`publicProgress/${state.uid}`);
  if (connectedUid !== state.uid) {
    presenceUnsubscribe?.();
    connectedUid = state.uid;
    const connectedRef = db.ref('.info/connected');
    const presence = snapshot => {
      if (!snapshot.val()) return;
      ref.onDisconnect().update({ online: false, lastSeen: window.firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
      ref.update({ online: true, lastSeen: window.firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
    };
    connectedRef.on('value', presence);
    presenceUnsubscribe = () => connectedRef.off('value', presence);
  }
  await ref.update({ name: state.profile.name || '', dailyTargets: targets(), todayFoods: state.foods.map(food => ({ name: food.name, weight: food.weight, checked: Boolean(food.checked), kcal: food.kcal, protein: food.protein, fat: food.fat, carbs: food.carbs })), waterAmount: state.water, online: true, lastSeen: window.firebase.database.ServerValue.TIMESTAMP });
}

export function stopFriends() {
  ++listVersion;
  for (const { ref, callback } of subscriptions.values()) ref.off('value', callback);
  subscriptions.clear();
}

function renderFriendsList() {
  if (!state.friends.length) {
    $('friendsList').innerHTML = `<div class="empty-state">${icon('users')}<strong>${t('friends_empty')}</strong><p>${t('friends_empty_hint')}</p></div>`;
    return;
  }
  $('friendsList').innerHTML = state.friends.map(id => {
    const data = friendData.get(id);
    const name = data?.name || id;
    return `<div class="friend-item"><span class="friend-avatar">${escapeHTML(initials(name))}</span><button type="button" class="friend-details" data-action="showFriendProgress" data-value="${escapeHTML(id)}"><strong>${escapeHTML(name)}</strong><small class="${data?.online ? 'is-online' : ''}">${data ? t(data.online ? 'online' : 'offline') : t('not_available')}</small></button><button type="button" class="icon-button close-button" data-action="removeFriend" data-value="${escapeHTML(id)}" aria-label="${escapeHTML(t('delete') + ': ' + name)}">${icon('x')}</button></div>`;
  }).join('');
}

export async function loadFriends() {
  stopFriends(); const version = listVersion;
  renderFriendsList(); $('friendsOfflineMsg').hidden = navigator.onLine;
  $('friendsOfflineMsg').textContent = navigator.onLine ? '' : t('offline');
  if (!navigator.onLine || !state.friends.length) return;
  try {
    const db = await connect();
    if (version !== listVersion || activeTab !== 3) return;
    for (const id of state.friends) {
      const ref = db.ref(`publicProgress/${id}`);
      const callback = snapshot => { friendData.set(id, snapshot.val()); renderFriendsList(); };
      ref.on('value', callback, () => { $('friendsOfflineMsg').hidden = false; $('friendsOfflineMsg').textContent = t('network_error'); });
      subscriptions.set(id, { ref, callback });
    }
  } catch { $('friendsOfflineMsg').hidden = false; $('friendsOfflineMsg').textContent = t('network_error'); }
}

async function showFriend(id) {
  try {
    let data = friendData.get(id);
    if (!data) { const db = await connect(); data = (await db.ref(`publicProgress/${id}`).once('value')).val(); }
    if (!data) { toast(t('not_available')); return; }
    $('friendModalName').textContent = data.name || id;
    const total = nutritionTotal(Array.isArray(data.todayFoods) ? data.todayFoods : []);
    const values = { ...total, water: Number(data.waterAmount) || 0 };
    const goals = data.dailyTargets || {};
    $('friendProgressBars').innerHTML = ['kcal','protein','fat','carbs','water'].map(key => `<div class="friend-progress-item"><div><span>${t(key === 'kcal' ? 'calories' : key)}</span><strong>${number(values[key])} / ${number(goals[key])} ${t(key === 'kcal' ? 'kcal' : key === 'water' ? 'ml' : 'g')}</strong></div><div class="macro-track"><i style="--fraction:${clamp(values[key] / goals[key])}"></i></div></div>`).join('');
    openDialog('friendProgressModal');
  } catch { toast(t('network_error')); }
}

export function initFriends() {
  onAction('addFriend', () => {
    const id = $('friendUidInput').value.trim();
    if (!/^\d{11}$/.test(id)) { toast(t('invalid_id')); return; }
    if (id === state.uid) { toast(t('own_id')); return; }
    if (!state.friends.includes(id)) { state.friends.push(id); changed(); }
    $('friendUidInput').value = ''; loadFriends();
  });
  $('friendUidInput').inputMode = 'numeric'; $('friendUidInput').maxLength = 11;
  onAction('removeFriend', async button => {
    if (!(await confirmAction(t('delete_record')))) return;
    state.friends = state.friends.filter(id => id !== button.dataset.value); changed(); loadFriends();
  });
  onAction('showFriendProgress', button => showFriend(button.dataset.value));
  onAction('closeFriendProgress', () => closeDialog('friendProgressModal'));
  document.addEventListener('fitcat:tab', event => { if (event.detail === 'friends') loadFriends(); else stopFriends(); });
  window.addEventListener('online', () => { queuePublish(); if (activeTab === 3) loadFriends(); });
  window.addEventListener('offline', () => { if (activeTab === 3) loadFriends(); });
  window.addEventListener('pagehide', () => { stopFriends(); clearTimeout(publishTimer); });
}
