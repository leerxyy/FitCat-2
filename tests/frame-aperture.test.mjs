import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {measureFrameAperture} from '../tools/frame_aperture.mjs';
import {LIMITED_FRAME_GEOMETRY} from '../js/core/profile-limited-geometry.js';

function fixture(size=400){
  const rgba=new Uint8Array(size*size*4),cx=size*.5,cy=size*.4,rx=size*.285,ry=size*.263;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,interior=((x-cx)/rx)**2+((y-cy)/ry)**2<1,outer=Math.hypot(x-cx,y-cy)>size*.4;
    rgba[i]=rgba[i+1]=rgba[i+2]=255;rgba[i+3]=interior||outer?0:255;
  }
  return rgba;
}
test('avatar fit follows an off-centre opening instead of the ornament canvas',()=>{
  const size=400,raw=fixture(size),{fit,opening}=measureFrameAperture(raw,size);
  assert.ok(Math.abs(fit.centerX-50)<.2);assert.ok(Math.abs(fit.centerY-40)<.2);assert.ok(fit.centerY<45);
  const cx=(fit.left+fit.size/2)/100*size,cy=(fit.top+fit.size/2)/100*size,r=fit.size/200*size;
  for(let p=0;p<opening.length;p++)if(opening[p])assert.ok(Math.hypot(p%size-cx,Math.floor(p/size)-cy)<r,'The photo must cover the whole opening');
});
test('opaque backing covers every interior pixel and leaves exterior ornament gaps transparent',()=>{
  const size=400,{mask,opening}=measureFrameAperture(fixture(size),size);
  for(let p=0;p<opening.length;p++)if(opening[p])assert.equal(mask[p],255);
  assert.equal(mask[0],0);assert.equal(mask[399],0);assert.equal(mask[399*400+200],0);
  assert.ok(mask.some((value,p)=>value===255&&!opening[p]),'An antialias bleed is required beneath the inner rim');
});
test('invalid or unclosed artwork cannot produce a giant mask over the whole profile',()=>{
  assert.throws(()=>measureFrameAperture(new Uint8Array(10),400),/invalid_frame_pixels/);
  assert.throws(()=>measureFrameAperture(new Uint8Array(400*400*4),400),/unclosed_avatar_opening/);
  const solid=new Uint8Array(400*400*4).fill(255);assert.throws(()=>measureFrameAperture(solid,400),/opaque_avatar_opening/);
});
test('each production frame has an independent measured opening and a tiny offline alpha mask',()=>{
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8'),source=JSON.parse(readFileSync(new URL('../assets/profile-limited/sources.json',import.meta.url),'utf8'));
  assert.ok(LIMITED_FRAME_GEOMETRY.pearlguard.photo.centerY<45);assert.ok(LIMITED_FRAME_GEOMETRY.seraph.photo.centerY<46);
  for(const[id,g]of Object.entries(LIMITED_FRAME_GEOMETRY)){
    const f=g.photo;assert.ok(f.size>50&&f.size<65);assert.ok(f.left>15&&f.top>10);assert.ok(f.left+f.size<85&&f.top+f.size<85);
    assert.ok(Math.abs(f.left+f.size/2-f.centerX)<.000002);assert.ok(Math.abs(f.top+f.size/2-f.centerY)<.000002);
    const file=readFileSync(new URL('../'+f.aperture,import.meta.url));assert.equal(file.subarray(8,12).toString(),'WEBP');assert.ok(file.length<12000);
    assert.ok(sw.includes("'"+f.aperture+"'"));assert.deepEqual(source.items.find(x=>x.kind==='frame'&&x.id===id).geometry.photo,f);
  }
});
test('limited art uses its own alpha and a co-located opaque photo backing without resizing the profile',()=>{
  const css=readFileSync(new URL('../styles/profile-limited.css',import.meta.url),'utf8');
  assert.match(css,/\.avatar-frame\[data-limited="true"\] > \.collectible-shell \{ -webkit-mask: none; mask: none; \}/);
  assert.match(css,/mask: var\(--limited-avatar-aperture\) center \/ 100% 100% no-repeat/);
  assert.match(css,/inset: -3px; z-index: 1; margin: 0; width: auto; height: auto/);
  assert.match(css,/background: #0c3149/);assert.match(css,/left: var\(--limited-photo-left\); top: var\(--limited-photo-top\)/);
  assert.doesNotMatch(css,/#profileIdentityCard\[data-collectible-frame=/);assert.doesNotMatch(css,/#frameStylePreview\[data-collectible=/);
});
