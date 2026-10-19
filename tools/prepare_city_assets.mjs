// Build-time only: node tools/prepare_city_assets.mjs /path/to/downloaded/photos
// Runtime needs no package or remote photo request. The originals are documented
// in CITY-CREDITS.md; each light map is derived from the same real photograph.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROFILE_CITY_CATALOG } from '../js/core/profile-cities.js';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '.', process.cwd()] }));
const folder = process.argv[2];
if (!folder) throw new Error('Provide the directory containing the credited original photographs.');
const out = path.resolve('assets/profile-covers'), fx = path.resolve('assets/profile-effects');
await fs.mkdir(out, { recursive: true }); await fs.mkdir(fx, { recursive: true });
const inputs = { tokyo: 'tokyo.jpg', chongqing: 'chongqing.png', moscow: 'moscow-night4.jpg', dubai: 'dubai-panorama.jpg' };
const report = [];
for (const [city, file] of Object.entries(inputs)) {
  const original = path.join(folder, file);
  // Preserve the actual photographed scene at its original 3:2 aspect ratio.
  // No building or sign is generated or moved. The Dubai panorama stays broad.
  const frame = await sharp(original).rotate().resize(1440, 960, { fit: 'cover', position: 'centre' }).toBuffer();
  await sharp(frame).webp({ quality: 87, effort: 6 }).toFile(path.join(out, city + '.webp'));
  await sharp(frame).resize(480, 320).webp({ quality: 78, effort: 6 }).toFile(path.join(out, city + '-thumb.webp'));
  const { data, info } = await sharp(frame).resize(720, 480).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(info.width * info.height * 4);
  for (let pixel = 0; pixel < info.width * info.height; pixel++) {
    const r = data[pixel * 3], g = data[pixel * 3 + 1], b = data[pixel * 3 + 2];
    const peak = Math.max(r, g, b), luma = .2126 * r + .7152 * g + .0722 * b;
    pixels[pixel * 4] = r; pixels[pixel * 4 + 1] = g; pixels[pixel * 4 + 2] = b;
    pixels[pixel * 4 + 3] = Math.round(Math.pow(Math.max(0, (peak - 125) / 130), 1.8) * Math.min(1, luma / 120) * 220);
  }
  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 79, alphaQuality: 85, effort: 6 }).toFile(path.join(fx, city + '-lights.webp'));
  const assets = [path.join(out, city + '.webp'), path.join(out, city + '-thumb.webp'), path.join(fx, city + '-lights.webp')];
  report.push({ city, ...PROFILE_CITY_CATALOG[city], assets: await Promise.all(assets.map(async filename => ({ file: path.relative(process.cwd(), filename), bytes: (await fs.stat(filename)).size }))) });
}
await fs.writeFile(path.join(out, 'cities.sources.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ cities: report.map(x => x.city), bytes: report.flatMap(x => x.assets).reduce((sum, x) => sum + x.bytes, 0) }));
