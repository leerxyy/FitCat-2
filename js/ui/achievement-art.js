// Inline vectors have an intrinsic size and no image request, sprite offset or
// mask dependency. Each instance owns its gradient IDs, including nested sheets.
let serial = 0;
export function achievementArt(id) {
  if (id === 'dev') return '<span class="developer-art" aria-hidden="true"><svg width="32" height="28" viewBox="0 0 32 28" fill="none"><path d="m10 7-7 7 7 7m12-14 7 7-7 7M19 3l-6 22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const uid = 'achievement-' + (++serial);
  const days = Number(id.replace('stable', ''));
  const shield = [7,30,60,90].includes(days);
  const colors = ({stable7:['#f0f7ff','#9baac1','#455973'],stable30:['#fff0b7','#d5a84d','#77552a'],stable60:['#f2fbff','#9dcbd9','#52628d'],stable90:['#dcffff','#57dce8','#5774cf'],first:['#d5faff','#6ed3f5','#455caa'],rhythm:['#ffe0ce','#edaa82','#944e74'],balance:['#d6ffee','#73d3b4','#3b747a'],choice:['#ede4ff','#b19bdf','#64518f']})[id] || ['#d5faff','#6ed3f5','#455caa'];
  const body = shield ? 'M48 7 77 18v26c0 19-12 34-29 43-17-9-29-24-29-43V18Z' : 'M48 7 78 24v35L48 87 18 59V24Z';
  const inner = shield ? 'M48 14 70 23v21c0 15-9 27-22 35-13-8-22-20-22-35V23Z' : 'M48 14 71 28v28L48 78 25 56V28Z';
  const symbols = {
    first:'<path d="m48 28 5 13 14 5-14 5-5 14-5-14-14-5 14-5Z"/><path d="m65 27 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" fill="currentColor" stroke="none"/>',
    rhythm:'<path d="M49 24c2 12 13 14 13 26 0 10-7 17-16 17-11 0-17-8-15-18 1-6 5-10 8-14-1 9 3 12 6 11 4-2 4-13 4-22Z"/><path d="M47 49c-6 5-6 12 0 14 6-1 7-8 0-14Z" fill="currentColor" stroke="none"/>',
    balance:'<circle cx="48" cy="47" r="15"/><path d="M48 32v15l12 8M28 30v21m-4-21v9c0 5 8 5 8 0v-9m39 0c-6 5-6 13 0 15v19"/>',
    choice:'<path d="M33 59c-3-18 10-28 29-28 0 18-10 31-28 29m0 0 21-21m-21 21-4 7"/><path d="m45 49 9 1m-9-1v-9"/>',
  };
  const symbol = shield ? `<text x="48" y="53" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Arial,sans-serif" font-size="${days===7?30:27}" font-weight="750" fill="${colors[0]}" stroke="none">${days}</text><path d="m37 62 7 4 15-10"/>${days===90?'<path d="m48 16 6 6-6 6-6-6Z" fill="currentColor" stroke="none"/>':''}` : symbols[id] || symbols.first;
  return `<span class="achievement-art" data-art="${id}" aria-hidden="true"><svg class="achievement-vector" width="80" height="88" viewBox="0 0 96 96" fill="none"><defs><linearGradient id="${uid}-rim" x1="18" y1="9" x2="78" y2="86" gradientUnits="userSpaceOnUse"><stop stop-color="${colors[0]}"/><stop offset=".37" stop-color="${colors[1]}"/><stop offset=".64" stop-color="${colors[2]}"/><stop offset="1" stop-color="${colors[0]}"/></linearGradient><linearGradient id="${uid}-face" x1="26" y1="17" x2="68" y2="81" gradientUnits="userSpaceOnUse"><stop stop-color="${colors[1]}" stop-opacity=".35"/><stop offset="1" stop-color="#071c2c"/></linearGradient></defs><path d="${body}" fill="url(#${uid}-rim)" stroke="${colors[0]}" stroke-opacity=".7" stroke-width="1.2"/><path d="${inner}" fill="url(#${uid}-face)" stroke="#061724" stroke-opacity=".55"/><path d="${inner}" stroke="${colors[0]}" stroke-opacity=".35" stroke-width=".8"/><g color="${colors[0]}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbol}</g><path class="achievement-highlight" d="M28 24 48 15 65 23" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg><i class="achievement-glint"></i></span>`;
}
