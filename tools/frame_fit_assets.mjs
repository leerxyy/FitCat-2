// Authoring only: fit the photograph to the actual alpha aperture and bake a
// small edge-light mask. No pixel inspection or blur runs on the device.
import {stat} from 'node:fs/promises';
import {measureFrameAperture} from './frame_aperture.mjs';

export async function writeFrameFit(sharp, raw, folder, id) {
  const {mask,fit}=measureFrameAperture(raw),rgba=Buffer.alloc(1024*1024*4);
  for(let p=0;p<mask.length;p++) { rgba[p*4]=rgba[p*4+1]=rgba[p*4+2]=255;rgba[p*4+3]=mask[p]; }
  const file=`${folder}/${id}-aperture.webp`;
  await sharp(rgba,{raw:{width:1024,height:1024,channels:4}}).resize(512,512).webp({lossless:true,alphaQuality:100,effort:5}).toFile(file);
  return {photo:{...fit,aperture:file},asset:{file,bytes:(await stat(file)).size}};
}

export async function writeFrameContour(sharp,raw,folder,id) {
  const n=512,small=await sharp(raw,{raw:{width:1024,height:1024,channels:4}}).resize(n,n).raw().toBuffer(),edge=Buffer.alloc(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const p=(y*n+x)*4,a=small[p+3];if(!a)continue;
    let neighbor=a;
    for(const[dx,dy]of [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,3],[3,-3],[-3,-3]]) {
      const xx=x+dx,yy=y+dy;
      neighbor=Math.min(neighbor,xx<0||yy<0||xx>=n||yy>=n?0:small[(yy*n+xx)*4+3]);
    }
    edge[p]=edge[p+1]=edge[p+2]=255;
    edge[p+3]=Math.round(Math.min(255,(a-neighbor)*1.25));
  }
  const file=`${folder}/${id}-contour.webp`;
  await sharp(edge,{raw:{width:n,height:n,channels:4}}).webp({lossless:true,alphaQuality:100,effort:5}).toFile(file);
  return {file,bytes:(await stat(file)).size};
}
