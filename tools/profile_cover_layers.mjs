// Keep the approved cityscape intact. Separate atmospheric depth from light
// attached to its pixels: moving cut-out architecture caused visible seams.
import {stat} from 'node:fs/promises';

export async function prepareCoverLayers(sharp,original,id,regions,target='assets/profile-limited') {
  const w=1536,h=1024,n=768,m=512,assets=[];
  const raw=await sharp(original).resize(w,h,{fit:'cover'}).ensureAlpha().raw().toBuffer();
  async function save(input,suffix,width,height,quality=84,rawInput=true) {
    const file=`${target}/covers/${id}${suffix}.webp`;
    const image=rawInput?sharp(input,{raw:{width,height,channels:4}}):sharp(input);
    await image.webp({quality,alphaQuality:100,effort:5}).toFile(file);
    assets.push({file,bytes:(await stat(file)).size});
  }
  await save(raw,'',w,h,92);
  await save(await sharp(raw,{raw:{width:w,height:h,channels:4}}).resize(480,320).raw().toBuffer(),'-thumb',480,320);
  const small=await sharp(raw,{raw:{width:w,height:h,channels:4}}).resize(n,m).raw().toBuffer();
  const lightA=Buffer.alloc(n*m*4),lightB=Buffer.alloc(n*m*4),emission=Buffer.alloc(n*m*4);
  for(let y=0;y<m;y++)for(let x=0;x<n;x++) {
    const p=(y*n+x)*4,r=small[p],g=small[p+1],b=small[p+2],lum=(r+g+b)/3;
    const warm=r>b*1.16&&g>b*.91&&r>142&&g>94;
    const eligible=regions.light.warm?warm:(b>142&&g>145&&lum>155&&y>m*.22);
    if(!eligible)continue;
    const alpha=Math.round(Math.min(225,Math.max(0,(Math.max(r,g,b)-112)*1.55))),chosen=x/n<regions.light.splitX?lightA:lightB;
    chosen[p]=r;chosen[p+1]=g;chosen[p+2]=b;chosen[p+3]=alpha;
    emission[p]=emission[p+1]=emission[p+2]=255;emission[p+3]=alpha;
  }
  for(const[suffix,map]of [['-light-a',lightA],['-light-b',lightB],['-glow-mask',emission]])await save(map,suffix,n,m,83);
  const polygon=points=>points.map(([x,y])=>`${x*n},${y*m}`).join(' ');
  for(const[suffix,polygons,blur]of [['-surface-mask',regions.surface,3],['-occlusion',regions.atmosphere,14]]) {
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${m}"><defs><filter id="s"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><g fill="white" filter="url(#s)">${polygons.map(p=>`<polygon points="${polygon(p)}"/>`).join('')}</g></svg>`;
    await save(Buffer.from(svg),suffix,n,m,82,false);
  }
  const rays=id==='scarlet'
    ?'<path d="M1223 143 757 701 909 749Z" opacity=".17"/><path d="M1223 143 999 838 1125 860Z" opacity=".23"/><path d="M1223 143 1392 797 1487 760Z" opacity=".14"/><ellipse cx="1223" cy="143" rx="83" ry="76" opacity=".15"/>'
    :id==='atlantis'
    ?'<path d="M910 -40 265 1024 367 1024Z" opacity=".32"/><path d="M925 -40 524 1024 651 1024Z" opacity=".38"/><path d="M951 -40 899 1024 1029 1024Z" opacity=".33"/><path d="M985 -40 1227 1024 1350 1024Z" opacity=".27"/><path d="M1030 -40 1536 864 1536 1024 1448 1024Z" opacity=".21"/>'
    :'<path d="M692 276 1071 1024 1247 1024Z" opacity=".2"/><path d="M701 277 1417 1024 1536 1024 1536 919Z" opacity=".18"/><path d="M678 285 359 1024 455 1024Z" opacity=".24"/><ellipse cx="694" cy="285" rx="124" ry="70" opacity=".13"/>';
  const color=id==='atlantis'?'#d1fbff':id==='scarlet'?'#c9defe':'#ffe9ba';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><defs><filter id="s"><feGaussianBlur stdDeviation="16"/></filter><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="f"><rect width="1536" height="1024" fill="url(#fade)"/></mask></defs><g fill="${color}" filter="url(#s)" mask="url(#f)">${rays}</g></svg>`;
  await save(await sharp(Buffer.from(svg)).resize(n,m).ensureAlpha().raw().toBuffer(),'-rays',n,m,84);
  return {assets,composition:'Whole approved image, with pixel-registered emissive maps and separate soft atmospheric depth. No geometric foreground slicing or clean-plate replacement.',layer_dimensions:[w,h],effect_dimensions:[n,m]};
}
