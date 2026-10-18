import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { setupDOM } from './dom.mjs';
import { BACKGROUNDS, THEME_PRESETS, ACCENTS } from '../js/core/appearance.js';
import { appearanceCopy } from '../js/core/appearance-copy.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('all seven photographic wallpapers and lightweight thumbnails are local, bounded and referenced by the preset gallery',()=>{
 const css=read('styles/appearance-backgrounds.css');let total=0;
 for(const id of ['mountains','cosmos','aurora','forest','coast','dunes','glacier']){
  const file='assets/backgrounds/'+id+'.webp',thumb='assets/backgrounds/'+id+'-thumb.webp';
  const bytes=statSync(new URL('../'+file,import.meta.url)).size;total+=bytes;
  assert.ok(bytes<350000,`${id}: ${bytes}`);assert.ok(statSync(new URL('../'+thumb,import.meta.url)).size<20000);
  assert.ok(css.includes(file));assert.ok(css.includes(thumb));
 }
 assert.ok(total<1500000,`total wallpaper bytes: ${total}`);
});
test('every theme, background and accent has labels in all three app languages',()=>{
 for(const copy of Object.values(appearanceCopy)){
  for(const key of Object.keys(THEME_PRESETS))assert.ok(copy['appearance_theme_'+key],key);
  for(const key of BACKGROUNDS)assert.ok(copy['appearance_bg_'+key],key);
  for(const key of Object.keys(ACCENTS))assert.ok(copy['appearance_accent_'+key],key);
 }
});
test('particle thumbnails use dispersed individual coordinates instead of a repeating tiled pattern',()=>{
 const env=setupDOM();try{
  const thumb=document.querySelector('.appearance-effect-thumb[data-effect="particles"]');
  const particles=thumb.querySelectorAll('i');assert.equal(particles.length,12);
  const positions=particles.map(node=>node.getAttribute('style'));
  assert.equal(new Set(positions).size,12);
  const ys=positions.map(value=>value.match(/--particle-y:([\d.]+)/)[1]);assert.ok(new Set(ys).size>10);
  const main=document.getElementById('ambientLight').querySelectorAll('.ambient-particles i');
  assert.equal(main.length,18);assert.deepEqual(main.slice(0,12).map(node=>node.getAttribute('style')),positions);
 }finally{env.restoreTimers();}
});
test('the legacy home opacity is variable; the effect pipeline has no animated paint-heavy gradient or blur filters',()=>{
 assert.match(read('styles/today.css'),/#todayPage \.card \{[^}]*var\(--appearance-glass-alpha/);
 const css=read('styles/appearance.css');
 for(const block of css.matchAll(/@keyframes appearance-(?:wave[^ ]*|light[^ ]*|flow[^ ]*|particle[^ ]*|edge[^ ]*)\s*\{([\s\S]*?)(?=\n@|$)/g)){
  assert.doesNotMatch(block[1],/background-position|filter:|box-shadow:/);
 }
 assert.doesNotMatch(css,/repeating-radial-gradient|blur\(22px\)|--card-shift/);
});
