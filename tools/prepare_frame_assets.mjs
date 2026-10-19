// Build-time derivatives of the five original imagegen alpha masters.
// No image processing, noise generation or canvas work runs on the phone.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { COLLECTIBLE_PROFILE_FRAMES } from '../js/core/profile-frames.js';
const require = createRequire(import.meta.url);
const sharp = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp') : 'sharp');
const source = resolve(process.argv[2] || '../work/frame-approved-source');
const target = resolve('assets/profile-frames');
await mkdir(target, { recursive: true });
const geometry = {}, provenance = [];
for (const frame of COLLECTIBLE_PROFILE_FRAMES) {
  const original = await readFile(join(source, frame + '.png'));
  const { data, info } = await sharp(original).resize(1024, 1024, { fit: 'contain', background: '#00000000' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const center = 512, distances = [];
  for (let angle = 0; angle < 360; angle += 2) {
    const a = angle * Math.PI / 180;
    for (let r = 240; r < 410; r++) {
      const x = Math.round(center + Math.cos(a) * r), y = Math.round(center + Math.sin(a) * r);
      if (data[(y * 1024 + x) * 4 + 3] > 150) { distances.push(r); break; }
    }
  }
  distances.sort((a, b) => a - b);
  const radius = distances[Math.floor(distances.length * .60)];
  if (!(radius >= 240 && radius <= 360)) throw new Error('Unexpected avatar opening: ' + frame);
  // The photograph bleeds slightly behind the crafted inner edge. A native
  // radial mask also removes any decorative orbit crossing the face.
  geometry[frame] = { hole: Number(((radius + 3) / 512).toFixed(5)), clear: Number((Math.min(radius - 15, 255) / 1024 * 100).toFixed(3)) };
  const files = [];
  for (const [suffix, size, quality] of [['',1024,91],['-thumb',320,84]]) {
    const name = frame + suffix + '.webp';
    await sharp(data, { raw: info }).resize(size,size).webp({ quality, alphaQuality: 100, effort: 5 }).toFile(join(target,name));
    files.push({ file: 'assets/profile-frames/' + name, bytes: (await stat(join(target,name))).size });
  }
  const n = 512;
  const rgba = await sharp(data, { raw: info }).resize(n,n).raw().toBuffer();
  const light = Buffer.alloc(n*n*4), haze = Buffer.alloc(n*n*4);
  for (let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const p=(y*n+x)*4, a=rgba[p+3];
    const r=Math.hypot(x/n-.5,y/n-.5);
    const brightest=Math.max(rgba[p],rgba[p+1],rgba[p+2]);
    const lum=(rgba[p]+rgba[p+1]+rgba[p+2])/3;
    const shine=Math.min(1,Math.max(0,(lum-65)/155));
    light[p]=light[p+1]=light[p+2]=255;light[p+3]=r>.235?Math.round(a*shine*.84):0;
    const cool=frame==='eclipse'||frame==='frostcrown';
    haze[p]=cool?145:255;haze[p+1]=cool?195:frame==='dragon'?226:158;haze[p+2]=cool?255:frame==='dragon'?149:59;
    // Restrict the moving aura to the existing art and its emissive edge.
    haze[p+3]=r>.27?Math.round(a*Math.max(0,(brightest-150)/105)*.6):0;
  }
  for(const [suffix,raw] of [['light',light],['aura',haze]]) {
    const name=frame+'-'+suffix+'.webp';
    await sharp(raw,{raw:{width:n,height:n,channels:4}}).webp({quality:82,alphaQuality:100,effort:5}).toFile(join(target,name));
    files.push({file:'assets/profile-frames/'+name,bytes:(await stat(join(target,name))).size});
  }
  provenance.push({ frame, generated:true, generation:'Original FitCat frame generated from the user-approved collectible concept sheet.', master_sha256:createHash('sha256').update(original).digest('hex'), geometry:geometry[frame], assets:files });
}
await writeFile('js/core/profile-frame-geometry.js','// Generated at build time from original alpha masters.\nexport const FRAME_GEOMETRY = Object.freeze('+JSON.stringify(geometry,null,2)+');\n');
await writeFile(join(target,'frames.sources.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({frames:provenance.map(x=>({frame:x.frame,bytes:x.assets.reduce((s,f)=>s+f.bytes,0),geometry:x.geometry})),totalBytes:provenance.flatMap(x=>x.assets).reduce((s,f)=>s+f.bytes,0)}));
