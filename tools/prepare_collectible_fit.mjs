// Refresh fit metadata and contour masks without changing approved artwork.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {FRAME_GEOMETRY} from '../js/core/profile-frame-geometry.js';
import {writeFrameFit,writeFrameContour} from './frame_fit_assets.mjs';
const sharp=createRequire(import.meta.url)(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'):'sharp');
const folder='assets/profile-frames',records=JSON.parse(await readFile(`${folder}/frames.sources.json`,'utf8')),geometry=structuredClone(FRAME_GEOMETRY);
for(const record of records) {
  const id=record.frame,raw=await sharp(`${folder}/${id}.webp`).ensureAlpha().raw().toBuffer();
  const {photo,asset}=await writeFrameFit(sharp,raw,folder,id),assets=[asset];
  geometry[id].photo=photo;record.geometry=geometry[id];
  if(['dragon','phoenix','frostcrown'].includes(id))assets.push(await writeFrameContour(sharp,raw,folder,id));
  record.assets=record.assets.filter(item=>!assets.some(f=>f.file===item.file)).concat(assets);
}
await writeFile('js/core/profile-frame-geometry.js','// Generated from real alpha apertures, independent of ornament symmetry.\nexport const FRAME_GEOMETRY = Object.freeze('+JSON.stringify(geometry,null,2)+');\n');
await writeFile(`${folder}/frames.sources.json`,JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify(records.map(r=>({id:r.frame,center:[r.geometry.photo.centerX,r.geometry.photo.centerY],size:r.geometry.photo.size}))));
