// Original imagegen artwork, mechanically split into bounded animation layers.
// Run once during authoring. None of this image processing runs in the PWA.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { FRAME_PARTS, COVER_REGIONS } from './profile_limited_geometry.mjs';
import { measureFrameAperture } from './frame_aperture.mjs';
import {prepareCoverLayers} from './profile_cover_layers.mjs';
const require = createRequire(import.meta.url);
const sharp = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp') : 'sharp');
const source = resolve(process.argv[2] || '../work/limited-approved-source');
const target = resolve('assets/profile-limited');
await Promise.all(['frames','covers','effects'].map(dir=>mkdir(join(target,dir),{recursive:true})));
const geometry={}, receipts=[];
const pct = n => Number((n*100).toFixed(5));
const px = n => 32+n*960;
const polygon = (points,w,h,frame=false) => points.map(([x,y])=>`${frame?px(x):x*w},${frame?px(y):y*h}`).join(' ');
async function matte(polygons,w,h,{frame=false,stroke=0,blur=0}={}) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${blur?'<defs><filter id="soft"><feGaussianBlur stdDeviation="'+blur+'"/></filter></defs>':''}<g fill="white" stroke="white" stroke-width="${stroke}"${blur?' filter="url(#soft)"':''}>${polygons.map(p=>'<polygon points="'+polygon(p,w,h,frame)+'"/>').join('')}</g></svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
}
async function webp(raw,w,h,path,quality=88) {
  await sharp(raw,{raw:{width:w,height:h,channels:4}}).webp({quality,alphaQuality:100,effort:5}).toFile(join(target,path));
  return {file:'assets/profile-limited/'+path,bytes:(await stat(join(target,path))).size};
}
const hash = data => createHash('sha256').update(data).digest('hex');
for(const [id,parts] of Object.entries(FRAME_PARTS)) {
  const original=await readFile(join(source,id+'.png'));
  const raw=await sharp(original).resize(960,960,{fit:'contain',background:'#00000000'}).extend({top:32,bottom:32,left:32,right:32,background:'#00000000'}).ensureAlpha().raw().toBuffer();
  if(raw[(512*1024+512)*4+3]!==0)throw new Error('Avatar opening is not transparent: '+id);
  const body=Buffer.from(raw),assets=[],descriptors=[];
  assets.push(await webp(raw,1024,1024,`frames/${id}.webp`,91));
  const thumb=await sharp(raw,{raw:{width:1024,height:1024,channels:4}}).resize(320,320).raw().toBuffer();
  assets.push(await webp(thumb,320,320,`frames/${id}-thumb.webp`,85));
  for(const p of parts) {
    const mask=await matte([p.points],1024,1024,{frame:true});
    let left=1024,top=1024,right=0,bottom=0;
    const layer=Buffer.alloc(raw.length);
    for(let y=0;y<1024;y++)for(let x=0;x<1024;x++) {
      const q=(y*1024+x)*4,a=mask[q+3];
      if(!a||!raw[q+3])continue;
      raw.copy(layer,q,q,q+4);layer[q+3]=Math.round(raw[q+3]*a/255);
      if(a>240)body[q+3]=0;
      if(layer[q+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    }
    if(right<=left||bottom<=top)throw new Error('Empty articulated piece: '+id+'/'+p.id);
    left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(1023,right+2);bottom=Math.min(1023,bottom+2);
    const width=right-left+1,height=bottom-top+1;
    const cropped=await sharp(layer,{raw:{width:1024,height:1024,channels:4}}).extract({left,top,width,height}).raw().toBuffer();
    const file=`frames/${id}-${p.id}.webp`;
    assets.push(await webp(cropped,width,height,file,90));
    descriptors.push({id:p.id,type:p.type,asset:'assets/profile-limited/'+file,left:pct(left/1024),top:pct(top/1024),width:pct(width/1024),height:pct(height/1024),origin:[pct((px(p.origin[0])-left)/width),pct((px(p.origin[1])-top)/height)],seconds:p.seconds,angle:p.angle,phase:p.phase});
  }
  assets.push(await webp(body,1024,1024,`frames/${id}-body.webp`,91));
  // Keep the photo beneath the inner edge without covering the inward mask.
  const distances=[];
  for(let degree=0;degree<360;degree+=2){const a=degree*Math.PI/180;for(let r=210;r<390;r++){const x=Math.round(512+Math.cos(a)*r),y=Math.round(512+Math.sin(a)*r);if(raw[(y*1024+x)*4+3]>150){distances.push(r);break;}}}
  distances.sort((a,b)=>a-b);const radius=distances[Math.floor(distances.length*.60)];
  if(!(radius>=245&&radius<=350))throw new Error('Unexpected opening radius: '+id+' '+radius);
  geometry[id]={hole:Number(((radius+4)/512).toFixed(5)),clear:Number((Math.min(radius-28,244)/1024*100).toFixed(3)),pieces:descriptors};
  const {mask:openingMask,fit}=measureFrameAperture(raw),aperture=`assets/profile-limited/frames/${id}-aperture.webp`;
  const aperturePixels=Buffer.alloc(1024*1024*4);
  for(let p=0;p<openingMask.length;p++){aperturePixels[p*4]=aperturePixels[p*4+1]=aperturePixels[p*4+2]=255;aperturePixels[p*4+3]=openingMask[p];}
  await sharp(aperturePixels,{raw:{width:1024,height:1024,channels:4}}).resize(512,512).webp({lossless:true,alphaQuality:100,effort:5}).toFile(aperture);
  assets.push({file:aperture,bytes:(await stat(aperture)).size});
  geometry[id].photo={...fit,aperture};
  const n=512,small=await sharp(body,{raw:{width:1024,height:1024,channels:4}}).resize(n,n).raw().toBuffer();
  const light=Buffer.alloc(n*n*4),aura=Buffer.alloc(n*n*4),material=Buffer.alloc(n*n*4);
  for(let i=0;i<small.length;i+=4){
    const a=small[i+3],lum=(small[i]+small[i+1]+small[i+2])/3,bright=Math.max(small[i],small[i+1],small[i+2]);
    light[i]=light[i+1]=light[i+2]=255;light[i+3]=Math.round(a*Math.max(0,Math.min(1,(lum-80)/150)));
    const rgb=id==='kitsune'?[255,177,94]:id==='pearlguard'?[143,232,255]:[255,224,163];
    [aura[i],aura[i+1],aura[i+2]]=rgb;aura[i+3]=Math.round(a*Math.max(0,(bright-155)/100)*.48);
    material[i]=material[i+1]=material[i+2]=255;material[i+3]=Math.round(a*Math.max(0,Math.min(1,(lum-110)/120))*.9);
  }
  for(const[suffix,map]of[['light',light],['aura',aura],['material',material]])assets.push(await webp(map,n,n,`frames/${id}-${suffix}.webp`,82));
  receipts.push({kind:'frame',id,generated:true,master_sha256:hash(original),geometry:{hole:geometry[id].hole,clear:geometry[id].clear,photo:geometry[id].photo},articulated_pieces:descriptors,assets});
}
for(const[id,regions]of Object.entries(COVER_REGIONS)) {
  const original=await readFile(join(source,id+'.png'));
  const layers=await prepareCoverLayers(sharp,original,id,regions);
  receipts.push({kind:'cover',id,generated:true,master_sha256:hash(original),...layers});
}
// Small code-authored light textures, not video frames or runtime noise.
for(let variant=0;variant<2;variant++){
  let seed=137+variant*41;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  let paths='';
  for(let row=-1;row<7;row++)for(let col=-1;col<8;col++){
    const x=col*77+(row%2)*32+(random()-.5)*22,y=row*83+(random()-.5)*24,r=25+random()*22;
    paths+=`<path d="M ${x-r} ${y} C ${x-r*.9} ${y-r*1.15} ${x+r*.6} ${y-r} ${x+r} ${y} S ${x+r*.6} ${y+r} ${x} ${y+r*.7} S ${x-r*1.5} ${y+r*.3} ${x-r} ${y}Z"/>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><filter id="glow"><feGaussianBlur stdDeviation="1.4"/></filter></defs><g fill="none" stroke="#c1efff" stroke-width="5" opacity=".3" filter="url(#glow)">${paths}</g><g fill="none" stroke="white" stroke-width="1.3" opacity=".82">${paths}</g></svg>`;
  const map=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
  const asset=await webp(map,512,512,`effects/caustics-${variant+1}.webp`,82);receipts.push({kind:'effect',id:'caustics-'+(variant+1),code_authored:true,assets:[asset]});
}
await writeFile('js/core/profile-limited-geometry.js','// Generated from the production alpha sprites and authored cutting mattes.\nexport const LIMITED_FRAME_GEOMETRY = Object.freeze('+JSON.stringify(geometry,null,2)+');\n');
await writeFile(join(target,'sources.json'),JSON.stringify({version:1,method:'Built-in imagegen; original artwork derived from the three user-approved FitCat concept boards. Native masks/crops/compression and light maps are build-time derivatives.',items:receipts},null,2)+'\n');
const files=receipts.flatMap(r=>r.assets);console.log(JSON.stringify({files:files.length+1,bytes:files.reduce((s,f)=>s+f.bytes,0),frames:Object.fromEntries(Object.entries(geometry).map(([id,g])=>[id,{hole:g.hole,pieces:g.pieces.length}])),items:receipts.length}));
