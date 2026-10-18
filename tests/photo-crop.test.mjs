import test from 'node:test';
import assert from 'node:assert/strict';
import { cropFrame, cropLayout, cropRectangle, zoomCrop } from '../js/core/photo-crop.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);

test('a landscape and a portrait photo start with a centered square, without stretching', () => {
  assert.deepEqual(cropRectangle(2400, 1600, {}), { x: 400, y: 0, size: 1600 });
  assert.deepEqual(cropRectangle(1600, 2400, {}), { x: 0, y: 400, size: 1600 });
  assert.deepEqual(cropLayout(2400, 1600, {}), { width: 1.5, height: 1, left: -.25, top: 0 });
  assert.throws(() => cropFrame(0, 1600), /photo_dimensions/);
});

test('panning cannot expose empty corners at any supported zoom or aspect ratio', () => {
  for (const [width, height] of [[4000, 600], [600, 4000], [1024, 1024], [4032, 3024]]) {
    for (const zoom of [1, 1.01, 2.5, 4, 900, -5]) for (const x of [-99, -.4, 0, .7, 99]) for (const y of [-99, 0, 99]) {
      const frame = cropFrame(width, height, { zoom, x, y });
      const source = cropRectangle(width, height, frame), view = cropLayout(width, height, frame);
      assert.ok(source.x >= 0 && source.y >= 0 && source.size > 0);
      assert.ok(source.x + source.size <= width + 1e-8 && source.y + source.size <= height + 1e-8);
      assert.ok(view.left <= 1e-8 && view.top <= 1e-8 && view.left + view.width >= 1 - 1e-8 && view.top + view.height >= 1 - 1e-8);
    }
  }
});

test('the preview and saved canvas use the same source pixels at every thumbnail size', () => {
  for (const [width, height] of [[2400, 1600], [1600, 2400], [900, 900]]) {
    const frame = cropFrame(width, height, { zoom: 2.4, x: .31, y: -.23 });
    const rect = cropRectangle(width, height, frame), layout = cropLayout(width, height, frame);
    for (const displaySize of [36, 64, 268, 512]) {
      const scale = layout.width * displaySize / width;
      near(rect.x * scale + layout.left * displaySize, 0);
      near(rect.y * scale + layout.top * displaySize, 0);
      near(rect.size * scale, displaySize);
    }
  }
});

test('pinch zoom retains its focal point and combines zooming with finger translation', () => {
  const frame = cropFrame(2400, 1600, { zoom: 2, x: .15, y: -.12 });
  const from = { x: -.2, y: .1 }, to = { x: -.1, y: .13 };
  const next = zoomCrop(2400, 1600, frame, 2.7, from, to);
  const originalLayout = cropLayout(2400, 1600, frame), nextLayout = cropLayout(2400, 1600, next);
  near((from.x + .5 - originalLayout.left) / originalLayout.width, (to.x + .5 - nextLayout.left) / nextLayout.width);
  near((from.y + .5 - originalLayout.top) / originalLayout.height, (to.y + .5 - nextLayout.top) / nextLayout.height);
  const reset = zoomCrop(2400, 1600, { zoom: 4, x: .9, y: .9 }, 1);
  assert.equal(reset.y, 0); assert.ok(Math.abs(reset.x) <= .25);
});
