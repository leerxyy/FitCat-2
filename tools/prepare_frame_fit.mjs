// Repair fit metadata without recompressing or replacing approved artwork.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {LIMITED_FRAME_GEOMETRY} from '../js/core/profile-limited-geometry.js';
import {measureFrameAperture} from './frame_aperture.mjs';
const sharp=createRequire(import.meta.url)(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'):'sharp');
const sourceFile='assets/profile-limited/sources.json',sources=JSON.parse(await readFile(sourceFile,'utf8'));
const geometry=structuredClone(LIMITED_FRAME_GEOMETRY),report=[];
for(const id of Object.keys(geometry)){
 const raw=await sharp(`assets/profile-limited/frames/${id}.webp`).ensureAlpha().raw().toBuffer();
 const {mask,fit}=measureFrameAperture(raw),file=`assets/profile-limited/frames/${id}-aperture.webp`;
 const rgba=Buffer.alloc(1024*1024*4);
 for(let p=0;p<mask.length;p++){rgba[p*4]=rgba[p*4+1]=rgba[p*4+2]=255;rgba[p*4+3]=mask[p];}
 await sharp(rgba,{raw:{width:1024,height:1024,channels:4}}).resize(512,512).webp({lossless:true,alphaQuality:100,effort:5}).toFile(file);
 geometry[id].photo={...fit,aperture:file};
 const item=sources.items.find(item=>item.kind==='frame'&&item.id===id);
 item.geometry.photo=geometry[id].photo;
 item.assets=item.assets.filter(asset=>asset.file!==file);item.assets.push({file,bytes:(await stat(file)).size});
 report.push({id,center:[fit.centerX,fit.centerY],photoSize:fit.size,bytes:(await stat(file)).size});
}
await writeFile('js/core/profile-limited-geometry.js','// Generated from original alpha sprites; photo fit follows each real opening.\nexport const LIMITED_FRAME_GEOMETRY = Object.freeze('+JSON.stringify(geometry,null,2)+');\n');
await writeFile(sourceFile,JSON.stringify(sources,null,2)+'\n');
console.log(JSON.stringify(report));
