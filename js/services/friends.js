import { state, targets } from '../core/store.js';
import { nutritionTotal, clamp } from '../core/math.js';
import { t, number } from '../core/i18n.js';
import { loadScript } from '../core/loader.js';
import { $, icon, initials, escapeHTML, onAction, changed, openDialog, closeDialog, toast, confirmAction } from '../ui/components.js';
import { activeTab } from '../ui/navigation.js';
import { animateProgress, captureLayout, animateList, enter, removeRow, MOTION } from '../ui/motion.js';

let database;
let connecting;
let publishTimer;
let connectedUid = '';
let presenceUnsubscribe;
let listVersion = 0;
let progressVersion = 0;
let inputFeedback = '';
let removingFriend = '';
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
  ++listVersion; ++progressVersion;
  for (const { ref, callback } of subscriptions.values()) ref.off('value', callback);
  subscriptions.clear();
}

function formatUid(id) {
  return String(id).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1 $2 $3 $4');
}

function friendName(id, data = friendData.get(id)) {
  return typeof data?.name === 'string' && data.name.trim() ? data.name : formatUid(id);
}

function isFriendsVisible() {
  return activeTab === 3 && document.body.dataset.screen === 'mainPage';
}

function setInputFeedback(key = '') {
  const changedMessage = inputFeedback !== key; inputFeedback = key;
  $('friendsIdFeedback').hidden = !key; $('friendsIdFeedback').textContent = key ? t(key) : '';
  if (key) $('friendUidInput').setAttribute('aria-invalid', 'true'); else $('friendUidInput').removeAttribute('aria-invalid');
  if (key && changedMessage) enter($('friendsIdFeedback'), { y: 4, duration: MOTION.press });
}

function renderFriendsList() {
  $('friendsUidDisplay').textContent = formatUid(state.uid);
  if (inputFeedback) $('friendsIdFeedback').textContent = t(inputFeedback);
  // A realtime reply must not replace the row while its removal is being animated.
  if (removingFriend) return;
  const list = $('friendsList'); const snapshot = captureLayout(list);
  const wasEmpty = Boolean(list.querySelector('.friends-empty'));
  $('friendsCount').textContent = number(state.friends.length); $('friendsListHeading').hidden = !state.friends.length;
  if (!state.friends.length) {
    list.removeAttribute('role');
    list.innerHTML = `<div class="friends-empty"><span class="friends-empty-art" aria-hidden="true"><span class="friends-empty-orb">${icon('users')}</span></span><h2>${t('friends_empty_title')}</h2><p>${t('friends_empty_description')}</p></div>`;
    if (!wasEmpty) enter(list.querySelector('.friends-empty'), { y: 8, duration: MOTION.list });
    return;
  }
  list.setAttribute('role', 'list');
  list.innerHTML = state.friends.map(id => {
    const data = friendData.get(id); const name = friendName(id, data);
    const named = typeof data?.name === 'string' && data.name.trim();
    const online = Boolean(navigator.onLine && data?.online);
    return `<div class="friend-item" role="listitem" data-friend-id="${escapeHTML(id)}" data-motion-key="friend-${escapeHTML(id)}"><span class="friend-avatar" aria-hidden="true">${named ? escapeHTML(initials(name)) : icon('user')}</span><button type="button" class="friend-details" data-action="showFriendProgress" data-value="${escapeHTML(id)}" aria-label="${escapeHTML(t('friends_view_progress') + ': ' + name)}" aria-haspopup="dialog" aria-controls="friendProgressModal"><strong>${escapeHTML(name)}</strong><span class="friend-meta${online ? ' is-online' : ''}"><span class="friend-presence" aria-hidden="true"></span>${data ? t(online ? 'online' : 'offline') : t('not_available')}</span>${named ? `<span class="friend-row-id">ID ${escapeHTML(formatUid(id))}</span>` : ''}${icon('chevron')}</button><button type="button" class="icon-button friend-remove" data-action="removeFriend" data-value="${escapeHTML(id)}" aria-label="${escapeHTML(t('friends_remove') + ': ' + name)}">${icon('trash')}</button></div>`;
  }).join('');
  animateList(list, snapshot);
}

function setConnectionStatus(error = false) {
  const region = $('friendsOfflineMsg');
  const message = !navigator.onLine ? t('friends_offline') : error ? t('network_error') : '';
  region.hidden = !message;
  region.innerHTML = message ? `${icon('refresh')}<span>${escapeHTML(message)}</span>${navigator.onLine && error ? `<button type="button" data-action="retryFriends">${t('retry')}</button>` : ''}` : '';
}

export async function loadFriends() {
  stopFriends(); const version = listVersion;
  renderFriendsList(); setConnectionStatus();
  if (!navigator.onLine || !state.friends.length || !isFriendsVisible()) return;
  try {
    const db = await connect();
    if (version !== listVersion || !isFriendsVisible()) return;
    for (const id of state.friends) {
      const ref = db.ref(`publicProgress/${id}`);
      const current = () => version === listVersion && isFriendsVisible() && state.friends.includes(id);
      const callback = snapshot => { if (!current()) return; friendData.set(id, snapshot.val()); renderFriendsList(); };
      ref.on('value', callback, () => { if (current()) setConnectionStatus(true); });
      subscriptions.set(id, { ref, callback });
    }
  } catch { if (version === listVersion && isFriendsVisible()) setConnectionStatus(true); }
}

async function showFriend(button) {
  const id = button.dataset.value;
  if (!state.friends.includes(id) || !isFriendsVisible()) return;
  const request = ++progressVersion;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  try {
    let data = friendData.get(id);
    if (!data && !navigator.onLine) { toast(t('friends_connect_progress')); return; }
    if (!data) { const db = await connect(); data = (await db.ref(`publicProgress/${id}`).once('value')).val(); }
    if (request !== progressVersion || !state.friends.includes(id) || !isFriendsVisible()) return;
    if (!data) { toast(t('not_available')); return; }
    $('friendModalName').textContent = friendName(id, data);
    const total = nutritionTotal(Array.isArray(data.todayFoods) ? data.todayFoods : []);
    const values = { ...total, water: Number(data.waterAmount) || 0 };
    const goals = data.dailyTargets || {};
    const fractions = new Map();
    $('friendProgressBars').innerHTML = ['kcal','protein','fat','carbs','water'].map(key => {
      const fraction = Number(goals[key]) > 0 ? clamp(values[key] / Number(goals[key])) : 0;
      fractions.set(key, fraction);
      const label = t(key === 'kcal' ? 'calories' : key === 'water' ? 'water_title' : key);
      const value = `${number(values[key])} / ${number(goals[key])} ${t(key === 'kcal' ? 'kcal' : key === 'water' ? 'ml' : 'g')}`;
      return `<div class="friend-progress-item"><div><span>${label}</span><strong>${value}</strong></div><div class="macro-track" role="progressbar" aria-label="${escapeHTML(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fraction * 100)}" aria-valuetext="${escapeHTML(value)}"><i data-friend-progress="${key}"></i></div></div>`;
    }).join('');
    openDialog('friendProgressModal');
    $('friendProgressBars').querySelectorAll('[data-friend-progress]').forEach(bar => animateProgress(bar, fractions.get(bar.dataset.friendProgress)));
    enter($('friendProgressBars'), { y: 8, duration: MOTION.screen });
  } catch { if (request === progressVersion && isFriendsVisible()) toast(t('network_error')); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

export function initFriends() {
  renderFriendsList();
  const addFriend = () => {
    const id = $('friendUidInput').value.replace(/[\s\u200b-]/g, '');
    if (!/^\d{11}$/.test(id)) { setInputFeedback('invalid_id'); $('friendUidInput').focus(); return; }
    if (id === state.uid) { setInputFeedback('own_id'); $('friendUidInput').focus(); return; }
    if (state.friends.includes(id)) { setInputFeedback('friends_already_added'); return; }
    state.friends.push(id); changed(); setInputFeedback();
    $('friendUidInput').value = ''; $('friendUidInput').blur?.(); loadFriends(); toast(t('friends_added'));
  };
  onAction('addFriend', (_button, event) => { event?.preventDefault(); addFriend(); });
  $('friendAddForm').addEventListener('submit', event => { event.preventDefault(); addFriend(); });
  $('friendUidInput').addEventListener('input', () => setInputFeedback());
  onAction('removeFriend', async button => {
    const id = button.dataset.value;
    if (removingFriend || !state.friends.includes(id)) return;
    if (!(await confirmAction(t('friends_remove_confirm').replace('{name}', friendName(id))))) return;
    removingFriend = id;
    const row = button.closest('[data-friend-id]'); if (row) row.inert = true;
    state.friends = state.friends.filter(value => value !== id); friendData.delete(id); changed();
    try { await removeRow(row); }
    finally { removingFriend = ''; loadFriends(); toast(t('friends_removed')); }
  });
  onAction('showFriendProgress', showFriend);
  onAction('retryFriends', loadFriends);
  onAction('closeFriendProgress', () => closeDialog('friendProgressModal'));
  $('friendProgressModal').addEventListener('close', () => { progressVersion++; });
  document.addEventListener('fitcat:tab', event => { if (event.detail === 'friends') loadFriends(); else stopFriends(); });
  document.addEventListener('fitcat:screen', () => { if (isFriendsVisible()) loadFriends(); else stopFriends(); });
  window.addEventListener('online', () => { queuePublish(); if (activeTab === 3) loadFriends(); });
  window.addEventListener('offline', () => { if (activeTab === 3) loadFriends(); });
  window.addEventListener('pagehide', () => { stopFriends(); clearTimeout(publishTimer); });
}
