// Build-time only. Input: approved chongqing/moscow/dubai/hongkong.png masters.
// No downloads. Runtime only transforms or fades small pre-rendered layers.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { PROFILE_CITY_CATALOG } from '../js/core/profile-cities.js';
import { CITY_EFFECTS, cityEffectAssets } from '../js/core/profile-city-effects.js';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '.', process.cwd()] }));
const folder = process.argv[2];
if (!folder) throw new Error('Provide the directory containing the four approved generated masters.');
const out = path.resolve('assets/profile-covers'), fx = path.resolve('assets/profile-effects');
await fs.mkdir(out, { recursive: true }); await fs.mkdir(fx, { recursive: true });
const width = 768, height = 512, report = [];
const svgRegion = polygons => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${polygons.map(points => `<polygon fill="white" points="${points.map(([x,y]) => `${x*width},${y*height}`).join(' ')}"/>`).join('')}</svg>`);
const write = async (buffer, target) => sharp(buffer, { raw: { width, height, channels: 4 } }).webp({ quality: 80, alphaQuality: 88, effort: 6 }).toFile(target);
for (const city of Object.keys(PROFILE_CITY_CATALOG)) {
  const master = await fs.readFile(path.join(folder, city + '.png'));
  const frame = await sharp(master).rotate().resize(1536,1024,{fit:'cover',position:'centre'}).toBuffer();
  const full = path.join(out,city+'.webp'), thumb = path.join(out,city+'-thumb.webp');
  await sharp(frame).webp({quality:88,effort:6}).toFile(full);
  await sharp(frame).resize(480,320).webp({quality:80,effort:6}).toFile(thumb);
  const rgb = await sharp(frame).resize(width,height).removeAlpha().raw().toBuffer();
  const water = await sharp(svgRegion([CITY_EFFECTS[city].water])).ensureAlpha().raw().toBuffer();
  const glass = await sharp(svgRegion(CITY_EFFECTS[city].glass)).ensureAlpha().raw().toBuffer();
  const layers = Object.fromEntries(['light-a','light-b','glass','water-mask','water-a','water-b'].map(key => [key,Buffer.alloc(width*height*4)]));
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    const i=y*width+x,j=i*4,k=i*3,r=rgb[k],g=rgb[k+1],b=rgb[k+2],peak=Math.max(r,g,b);
    const wet=water[j+3]/255,facade=glass[j+3]/255;
    const brightness=Math.pow(Math.max(0,(peak-95)/160),1.65);
    const section=((Math.floor(x/9)*73856093)^(Math.floor(y/7)*19349663))>>>0;
    const group=b>r*1.12?0:r>b*1.22?1:section%2;
    for (let groupIndex=0;groupIndex<2;groupIndex++) {
      const layer=layers['light-'+(groupIndex?'b':'a')];
      layer[j]=Math.min(255,r*1.2);layer[j+1]=Math.min(255,g*1.2);layer[j+2]=Math.min(255,b*1.2);
      layer[j+3]=Math.round(brightness*(1-wet)*235*(groupIndex===group?1:.08));
    }
    layers.glass[j]=255;layers.glass[j+1]=255;layers.glass[j+2]=255;
    layers.glass[j+3]=Math.round(facade*Math.max(.08,(peak-55)/200)*255);
    layers['water-mask'][j]=255;layers['water-mask'][j+1]=255;layers['water-mask'][j+2]=255;layers['water-mask'][j+3]=water[j+3];
    for (let phase=0;phase<2;phase++) {
      const layer=layers['water-'+(phase?'b':'a')];
      const bend=Math.sin(y*1.27+phase*2.1)*2.1+Math.sin(y*.23+x*.01+phase)*2.8;
      const sx=Math.max(0,Math.min(width-1,Math.round(x+bend))),sample=(y*width+sx)*3;
      layer[j]=Math.min(255,rgb[sample]*1.45);layer[j+1]=Math.min(255,rgb[sample+1]*1.45);layer[j+2]=Math.min(255,rgb[sample+2]*1.45);
      const ripple=.18+.82*Math.pow(Math.sin(y*2.7+x*.015+phase*1.6),2);
      layer[j+3]=Math.round(wet*(.12+Math.pow(peak/255,1.6)*.8)*ripple*220);
    }
  }
  const assets=cityEffectAssets(city);
  for (const [key,buffer] of Object.entries(layers)) await write(buffer,path.resolve(assets[key]));
  const paths=[full,thumb,...Object.values(assets).map(x=>path.resolve(x))];
  report.push({city,...PROFILE_CITY_CATALOG[city],generation:'Original image generated in this conversation; approved by user',master_sha256:createHash('sha256').update(master).digest('hex'),assets:await Promise.all(paths.map(async filename=>({file:path.relative(process.cwd(),filename),bytes:(await fs.stat(filename)).size})))});
}
await fs.writeFile(path.join(out,'cities.sources.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cities:report.map(x=>x.city),bytes:report.flatMap(x=>x.assets).reduce((sum,x)=>sum+x.bytes,0)}));
