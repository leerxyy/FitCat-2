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
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  let radius = 0;
  for (let i = 0; i < tail; i++) { const p = queue[i]; radius = Math.max(radius, Math.hypot(p % size - cx, Math.floor(p / size) - cy)); }
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
    fit: { centerX: pct(cx), centerY: pct(cy), size: pct(photoSize), left: pct(cx-photoSize/2), top: pct(cy-photoSize/2), iconSize: pct(photoSize*.44), iconLeft: pct(cx-photoSize*.22), iconTop: pct(cy-photoSize*.22), bounds: {left,top,right,bottom}, openingPixels:tail },
  };
}
