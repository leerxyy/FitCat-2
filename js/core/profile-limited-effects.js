import { LIMITED_PROFILE_COVERS, LIMITED_PROFILE_FRAMES } from './profile-limited.js';
import { LIMITED_FRAME_GEOMETRY } from './profile-limited-geometry.js';
import { appAssetURL, cssAssetURL } from './asset-url.js';

const star = (x,y,size,phase) => `<path class="limited-star" style="transform-origin:${x}px ${y}px;--part-phase:${phase}s" d="M ${x-size} ${y} Q ${x-1} ${y-1} ${x} ${y-size*1.7} Q ${x+1} ${y-1} ${x+size} ${y} Q ${x+1} ${y+1} ${x} ${y+size*1.7} Q ${x-1} ${y+1} ${x-size} ${y}Z"/>`;
const coord = value => 32+value*960;
const inlineAsset = path => cssAssetURL(path).replaceAll('"', '&quot;');
function jewel(x,y,phase,size=30) {
  return `<i class="limited-jewel" style="left:${(coord(x)/1024*100).toFixed(3)}%;top:${(coord(y)/1024*100).toFixed(3)}%;width:${size/1024*100}%;height:${size*1.3/1024*100}%;--part-phase:${phase}s"></i>`;
}
export function limitedFrameEffectsMarkup(frame) {
  if (!LIMITED_PROFILE_FRAMES.includes(frame)) return '';
  const pieces=LIMITED_FRAME_GEOMETRY[frame].pieces.map(p=>`<span class="limited-piece" data-part="${p.id}" data-piece-type="${p.type}" style="left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%;transform-origin:${p.origin[0]}% ${p.origin[1]}%;--part-cycle:${p.seconds}s;--part-angle:${p.angle}deg;--part-phase:${p.phase}s;--piece-art:${inlineAsset(p.asset)}"><img src="${appAssetURL(p.asset)}" alt="" draggable="false" decoding="async"><i class="limited-piece-light"></i></span>`).join('');
  let details='',gems='';
  if(frame==='kitsune'){
    details=[star(350,180,9,-2),star(815,740,11,-5),star(506,111,8,-3.7)].join('');
    for(const[x,y,delay]of [[76,452,-2.3],[924,389,-6.2],[99,755,-4.5]])details+=`<g class="limited-fox-fire" style="--part-phase:${delay}s;transform-origin:${x}px ${y}px"><path class="fox-fire-halo" d="M ${x} ${y+33} C ${x-34} ${y+10} ${x+5} ${y-10} ${x-6} ${y-43} C ${x+31} ${y-10} ${x+4} ${y+4} ${x+17} ${y+16} Q ${x+22} ${y+31} ${x} ${y+33}Z"/><path class="fox-fire-core" d="M ${x} ${y+22} Q ${x-12} ${y+7} ${x+4} ${y-13} Q ${x-1} ${y+6} ${x+8} ${y+9} Q ${x+14} ${y+20} ${x} ${y+22}Z"/></g>`;
    gems=jewel(.5,.127,-1.8,35)+jewel(.2,.38,-4.4,22)+jewel(.8,.38,-6.7,22);
  }
  if(frame==='pearlguard'){
    details=[star(259,300,12,-2.4),star(782,743,10,-5.2),star(516,106,8,-.6),star(231,797,8,-3.8)].join('');
    for(let i=0;i<5;i++){const x=i%2?952-i*5:66+i*6,y=340+i*102;details+=`<circle class="limited-frame-bubble" cx="${x}" cy="${y}" r="${5+i%3*3}" style="--part-cycle:${13+i*1.7}s;--part-phase:${-i*3.4}s"/>`;}
    gems=[[.5,.09],[.434,.13],[.566,.13],[.17,.33],[.83,.33],[.16,.71],[.84,.71],[.5,.81]].map(([x,y],i)=>jewel(x,y,-i*1.9,31)).join('');
  }
  if(frame==='seraph'){
    details=`<g class="limited-halo"><ellipse cx="512" cy="96" rx="155" ry="32"/><path d="M 512 47 V 63 M 504 55 H 520"/></g>`+[star(367,181,9,-1.4),star(685,191,9,-4.8),star(217,455,10,-6.4),star(806,453,10,-2.7),star(335,710,9,-3.9),star(689,718,9,-.8)].join('');
    gems=[[.5,.13],[.197,.435],[.803,.435],[.5,.75],[.316,.646],[.684,.646]].map(([x,y],i)=>jewel(x,y,-i*1.4,36)).join('');
  }
  return `<span class="limited-material"><i></i></span>${pieces}<span class="limited-jewels">${gems}</span><svg class="limited-frame-life" viewBox="0 0 1024 1024" aria-hidden="true">${details}</svg>`;
}

function petals() {
  return Array.from({length:12},(_,i)=>{
    const x=120+(i*197)%1290,y=95+(i*131)%640,scale=.65+(i%4)*.23;
    return `<g class="limited-petal" style="--part-cycle:${16.3+i*.91}s;--part-phase:${-i*2.41}s;--petal-x:${60+i%4*35}px;--petal-y:${180+i%3*55}px"><g class="limited-petal-turn" style="transform-origin:${x}px ${y}px;--part-cycle:${6.3+i*.4}s;--part-phase:${-i*1.9}s"><path d="M ${x} ${y} q ${19*scale} ${-17*scale} ${26*scale} ${-4*scale} q ${-2*scale} ${21*scale} ${-26*scale} ${4*scale}Z"/><path class="petal-vein" d="M ${x+3} ${y} l ${16*scale} ${-4*scale}"/></g></g>`;
  }).join('');
}
function bubbles() {
  return Array.from({length:9},(_,i)=>{
    const x=230+i*133%1090,y=590+i*37%230;
    return `<g class="limited-bubble-rise" style="--part-cycle:${17+i*1.8}s;--part-phase:${-i*3.73}s;--bubble-x:${i%2?-24:28}px"><circle cx="${x}" cy="${y}" r="${4+i%4*2.4}"/><path d="M ${x-2} ${y-3} l 2 -1"/></g>`;
  }).join('');
}
function shoals() {
  return Array.from({length:3},(_,school)=>{
    const x=285+school*310,y=240+school*125;
    let shapes='';
    for(let i=0;i<4;i++){const a=x+i*43,b=y+(i%2)*22;shapes+=`<path d="M ${a-12} ${b} Q ${a} ${b-10} ${a+14} ${b} Q ${a} ${b+9} ${a-12} ${b} L ${a-21} ${b-7} V ${b+7}Z"/>`;}
    return `<g class="limited-shoal" style="--part-cycle:${33+school*8.9}s;--part-phase:${-school*12.6}s;--school-x:${school%2?-290:330}px">${shapes}</g>`;
  }).join('');
}
function dust() {
  return Array.from({length:14},(_,i)=>`<circle class="limited-dust" cx="${80+i*107%1190}" cy="${170+i*109%630}" r="${1.7+i%3*.8}" style="--part-cycle:${15.7+i*.9}s;--part-phase:${-i*2.83}s;--dust-x:${12+i%4*14}px"/>`).join('');
}
export function limitedCoverMarkup(cover) {
  if(!LIMITED_PROFILE_COVERS.includes(cover))return '';
  const folder='assets/profile-limited/covers/';
  const properties=['light-a','light-b','glow-mask','surface-mask','occlusion','rays'].map(suffix=>`--limited-${suffix}:${inlineAsset(folder+cover+'-'+suffix+'.webp')}`).join(';');
  const caustics=cover==='atlantis'?'<span class="limited-caustics"><i></i><i></i></span>':'';
  const lights='<i class="limited-light-a"></i><i class="limited-light-b"></i>';
  const life=cover==='scarlet'?petals():cover==='atlantis'?bubbles():dust();
  return `<div class="limited-world" data-world="${cover}" style="${properties}"><div class="limited-far"><div class="limited-camera">${lights}<span class="limited-light-flow"><i></i></span><span class="limited-surface">${caustics}</span><i class="limited-source-glow"></i></div></div><div class="limited-depth"><div class="limited-cloud-bed"><i class="limited-cloud-one"></i><i class="limited-cloud-two"></i></div><i class="limited-rays"></i><svg class="limited-mid-life" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${cover==='atlantis'?shoals():''}</svg></div><div class="limited-near"><svg class="limited-cover-life" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${life}</svg><i class="limited-mist-near"></i></div></div>`;
}
