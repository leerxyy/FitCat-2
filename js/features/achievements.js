import { state, syncAchievements } from '../core/store.js';
import { ACHIEVEMENT_IDS, STABILITY_LEVELS, achievementProgress, ACHIEVEMENTS_KEY, normalizeAchievements } from '../core/achievements.js';
import { achievementArt as art } from '../ui/achievement-art.js';
import { $, icon, escapeHTML, onAction, openDialog, toast } from '../ui/components.js';
import { t, number } from '../core/i18n.js';
import { enter } from '../ui/motion.js';

let selected = 'first', signatures = new WeakMap();
const label = id => t('achievement_' + (id.startsWith('stable') ? 'stability' : id === 'dev' ? 'developer' : id));
const levelLabel = id => t('achievement_days').replace('{days}', number(Number(id.replace('stable', ''))));
const material = id => t('achievement_' + ({ stable7:'silver', stable30:'gold', stable60:'platinum', stable90:'diamond' }[id] || 'stability'));
function item(id, compact = false) {
 const earned = id === 'dev' ? state.achievements.developer : Boolean(state.achievements.unlocked[id]);
 const title = id.startsWith('stable') ? `${label(id)} · ${levelLabel(id)}` : label(id);
 return `<button type="button" class="achievement-tile${compact ? ' is-compact' : ''}${earned ? ' is-earned' : ' is-locked'}" data-action="openAchievement" data-achievement="${id}" aria-label="${escapeHTML(title + '. ' + t(earned ? 'achievement_earned' : 'achievement_locked'))}"><span class="achievement-visual">${art(id)}</span>${compact ? '' : `<strong>${escapeHTML(title)}</strong><small>${escapeHTML(id.startsWith('stable') ? material(id) : t(earned ? 'achievement_earned' : 'achievement_locked'))}</small>`}<span class="achievement-state" aria-hidden="true">${icon(earned ? 'check' : 'lock')}</span></button>`;
}
function update(node, signature, html) {
 if (!node || signatures.get(node) === signature) return;
 node.innerHTML = html(); signatures.set(node, signature);
}
export function renderAchievements() {
 if (state.profile) try { syncAchievements(); } catch { /* Data remains visible; the next save retries storage. */ }
 const data = state.achievements;
 const signature = state.preferences.lang + JSON.stringify(data.unlocked) + data.developer;
 const stable = [...STABILITY_LEVELS].reverse().find(level => data.unlocked['stable'+level]) || 7;
 update($('profileAchievementList'), signature, () => ['first','rhythm','stable'+stable,'balance','choice'].map(id => item(id,true)).join(''));
 update($('achievementsGrid'), signature, () => [...ACHIEVEMENT_IDS, ...(data.developer ? ['dev'] : [])].map(id => item(id)).join(''));
 const count = ACHIEVEMENT_IDS.filter(id => data.unlocked[id]).length;
 $('profileAchievementsText').textContent = t('achievements_count').replace('{count}',number(count)).replace('{total}',number(ACHIEVEMENT_IDS.length));
 $('profileDeveloperBadge').hidden = !data.developer;
 if ($('achievementDetailModal').open) renderDetail();
}
function renderDetail() {
 const data = state.achievements, developer = selected === 'dev';
 const title = label(selected);
 $('achievementDetailTitle').textContent = title;
 $('achievementDetailName').textContent = selected.startsWith('stable') ? `${levelLabel(selected)} · ${material(selected)}` : title;
 update($('achievementDetailArt'), selected + state.preferences.lang, () => art(selected));
 $('achievementDescription').textContent = t(developer ? 'achievement_developer_desc' : selected.startsWith('stable') ? 'achievement_stability_desc' : 'achievement_'+selected+'_desc').replace('{days}',number(Number(selected.replace('stable',''))));
 const progress = developer ? { unlocked: data.developer, count:1, target:1 } : achievementProgress(data,selected);
 $('achievementStatus').textContent = t(progress.source === 'developer' ? 'achievement_dev_unlocked' : progress.unlocked ? 'achievement_earned' : 'achievement_locked');
 $('achievementStatus').dataset.earned = String(progress.unlocked);
 $('achievementProgress').hidden = developer || progress.unlocked || selected === 'balance';
 $('achievementProgressText').textContent = `${number(progress.count)} / ${number(progress.target)}`;
 $('achievementProgressFill').style.width = `${progress.count/progress.target*100}%`;
 $('achievementLevels').hidden = !selected.startsWith('stable');
 $('achievementLevels').querySelectorAll('button').forEach(button => { const active = button.dataset.achievement === selected; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
}
export function initAchievements() {
 onAction('openAchievements', () => { renderAchievements(); openDialog('achievementsModal'); });
 onAction('openAchievement', button => {
  const id = button.dataset.achievement;
  if (!ACHIEVEMENT_IDS.includes(id) && id !== 'dev') return;
  selected = id; renderDetail(); openDialog('achievementDetailModal'); enter($('achievementDetailArt'),{ y:3 });
 });
 window.addEventListener('storage', event => {
  if (event.key !== ACHIEVEMENTS_KEY) return;
  try { state.achievements = normalizeAchievements(JSON.parse(event.newValue)); }
  catch { state.achievements = normalizeAchievements(null); }
  renderAchievements();
 });
 if (globalThis.IntersectionObserver) {
  const observer = new IntersectionObserver(entries => { for (const entry of entries) entry.target.dataset.inView = String(entry.isIntersecting); },{ threshold:.01 });
  observer.observe($('profileAchievementList'));
 } else $('profileAchievementList').dataset.inView = 'true';
 renderAchievements();
}
