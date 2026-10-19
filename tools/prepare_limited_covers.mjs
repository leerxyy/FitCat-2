import {readFile,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {COVER_REGIONS} from './profile_limited_geometry.mjs';
import {prepareCoverLayers} from './profile_cover_layers.mjs';
const sharp=createRequire(import.meta.url)(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'):'sharp');
const file='assets/profile-limited/sources.json',receipt=JSON.parse(await readFile(file,'utf8'));
for(const[id,regions]of Object.entries(COVER_REGIONS)) {
  const original=await readFile(`../work/limited-approved-source/${id}.png`),layers=await prepareCoverLayers(sharp,original,id,regions);
  const item=receipt.items.find(item=>item.kind==='cover'&&item.id===id);
  Object.assign(item,layers,{master_sha256:createHash('sha256').update(original).digest('hex')});
  delete item.hidden_clean_plate_sha256;
  await unlink(`assets/profile-limited/covers/${id}-front.webp`).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
await writeFile(file,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt.items.filter(item=>item.kind==='cover').map(item=>({id:item.id,assets:item.assets.length,bytes:item.assets.reduce((a,b)=>a+b.bytes,0)}))));
