// Build-time measurement of the real transparent opening, not the sprite box.
// The upper mask, wings and bottom pendants need not be symmetric around it.
export function measureFrameAperture(rgba, size = 1024) {
  if (rgba.length !== size * size * 4) throw new Error('invalid_frame_pixels');
  const middle = Math.floor(size / 2), start = middle * size + middle;
  if (rgba[start * 4 + 3] > 119) throw new Error('opaque_avatar_opening');
  const seen = new Uint8Array(size * size), opening = new Uint8Array(size * size), queue = new Int32Array(size * size);
  let head = 0, tail = 1, left = size, top = size, right = 0, bottom = 0;
  queue[0] = start; seen[start] = 1;
  while (head < tail) {
    const p = queue[head++], x = p % size, y = Math.floor(p / size);
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) throw new Error('unclosed_avatar_opening');
    opening[p] = 1; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    for (const q of [p-1,p+1,p-size,p+size]) {
      if (q < 0 || q >= size * size || seen[q] || Math.abs(q % size - x) > 1) continue;
      seen[q] = 1;
      if (rgba[q * 4 + 3] < 120) queue[tail++] = q;
    }
  }
  if (tail < size * size * .1 || tail > size * size * .5) throw new Error('invalid_avatar_opening');
  const seedX=(left+right)/2,seedY=(top+bottom)/2;
  let seedRadius=0;
  for(let i=0;i<tail;i++){const p=queue[i];seedRadius=Math.max(seedRadius,Math.hypot(p%size-seedX,Math.floor(p/size)-seedY));}
  // A thin orbital wire can divide one avatar hole into several components.
  // Join nearby ENCLOSED regions of that same aperture, never the outside
  // background or remote gaps between filigree and pendants.
  const visited=new Uint8Array(opening),candidates=[];
  for(let start=0;start<opening.length;start++) {
    if(visited[start]||rgba[start*4+3]>=120)continue;
    let h=0,t=1,sx=0,sy=0,outside=false;queue[0]=start;visited[start]=1;
    while(h<t) {
      const p=queue[h++],x=p%size,y=Math.floor(p/size);sx+=x;sy+=y;
      if(x===0||y===0||x===size-1||y===size-1)outside=true;
      for(const q of [p-1,p+1,p-size,p+size]) {
        if(q<0||q>=opening.length||visited[q]||Math.abs(q%size-x)>1)continue;
        visited[q]=1;if(rgba[q*4+3]<120)queue[t++]=q;
      }
    }
    if(!outside&&t>=12&&Math.hypot(sx/t-seedX,sy/t-seedY)<=seedRadius*1.08)candidates.push(queue.slice(0,t));
  }
  while(candidates.length) {
    const distance=new Uint16Array(opening.length);distance.fill(65530);
    for(let p=0;p<opening.length;p++)if(opening[p])distance[p]=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const p=y*size+x;let d=distance[p];if(x)d=Math.min(d,distance[p-1]+1);if(y)d=Math.min(d,distance[p-size]+1);if(x&&y)d=Math.min(d,distance[p-size-1]+1);if(x<size-1&&y)d=Math.min(d,distance[p-size+1]+1);distance[p]=d;}
    for(let y=size-1;y>=0;y--)for(let x=size-1;x>=0;x--){const p=y*size+x;let d=distance[p];if(x<size-1)d=Math.min(d,distance[p+1]+1);if(y<size-1)d=Math.min(d,distance[p+size]+1);if(x<size-1&&y<size-1)d=Math.min(d,distance[p+size+1]+1);if(x&&y<size-1)d=Math.min(d,distance[p+size-1]+1);distance[p]=d;}
    let joined=false;
    for(let i=candidates.length-1;i>=0;i--){const pixels=candidates[i];if(!pixels.some(p=>distance[p]<=10))continue;for(const p of pixels)opening[p]=1;candidates.splice(i,1);joined=true;}
    if(!joined)break;
  }
  left=top=size;right=bottom=0;let openingCount=0;
  for(let p=0;p<opening.length;p++)if(opening[p]){const x=p%size,y=Math.floor(p/size);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);openingCount++;}
  if(openingCount>size*size*.5)throw new Error('invalid_avatar_opening');
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  let radius = 0;
  for(let p=0;p<opening.length;p++)if(opening[p])radius=Math.max(radius,Math.hypot(p%size-cx,Math.floor(p/size)-cy));
  // Fill six source pixels under the opaque inner edge. This protects the join from
  // resampling without filling the separate holes in external filigree.
  const bleed = 6, mask = new Uint8Array(size * size);
  for (let y = top-bleed; y <= bottom+bleed; y++) for (let x = left-bleed; x <= right+bleed; x++) {
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    let inside = false;
    for (let dy = -bleed; dy <= bleed && !inside; dy++) for (let dx = -bleed; dx <= bleed; dx++) {
      const xx = x+dx, yy = y+dy;
      if (dx*dx+dy*dy <= bleed*bleed && xx >= 0 && yy >= 0 && xx < size && yy < size && opening[yy*size+xx]) { inside = true; break; }
    }
    if (inside) mask[y*size+x] = 255;
  }
  const photoSize = Math.ceil((radius + bleed + 2) * 2), pct = value => Number((value/size*100).toFixed(6));
  return {
    opening, mask,
    fit: { centerX: pct(cx), centerY: pct(cy), size: pct(photoSize), left: pct(cx-photoSize/2), top: pct(cy-photoSize/2), iconSize: pct(photoSize*.44), iconLeft: pct(cx-photoSize*.22), iconTop: pct(cy-photoSize*.22), bounds: {left,top,right,bottom}, openingPixels:openingCount },
  };
}
