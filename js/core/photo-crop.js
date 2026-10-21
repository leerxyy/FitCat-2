// Offsets use fractions of the square viewport, so the same frame works at
// editor, profile and header sizes, and survives resizing the original photo.
export const MAX_PHOTO_ZOOM = 4;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function cropFrame(width, height, frame = {}) {
  if (!(width > 0 && height > 0)) throw new Error('photo_dimensions');
  const zoom = clamp(finite(frame.zoom, 1), 1, MAX_PHOTO_ZOOM);
  const edge = Math.min(width, height);
  const limitX = (width / edge * zoom - 1) / 2;
  const limitY = (height / edge * zoom - 1) / 2;
  return { zoom, x: clamp(finite(frame.x), -limitX, limitX), y: clamp(finite(frame.y), -limitY, limitY) };
}

export function cropLayout(width, height, frame) {
  const value = cropFrame(width, height, frame);
  const edge = Math.min(width, height);
  const w = width / edge * value.zoom, h = height / edge * value.zoom;
  return { width: w, height: h, left: (1 - w) / 2 + value.x, top: (1 - h) / 2 + value.y };
}

export function cropRectangle(width, height, frame) {
  const value = cropFrame(width, height, frame);
  const size = Math.min(width, height) / value.zoom;
  return { x: clamp((width - size) / 2 - value.x * size, 0, width - size),
    y: clamp((height - size) / 2 - value.y * size, 0, height - size), size };
}

export function zoomCrop(width, height, frame, zoom, from = { x: 0, y: 0 }, to = from) {
  const previous = cropFrame(width, height, frame);
  const nextZoom = clamp(finite(zoom, 1), 1, MAX_PHOTO_ZOOM);
  const ratio = nextZoom / previous.zoom;
  return cropFrame(width, height, { zoom: nextZoom,
    x: to.x + (previous.x - from.x) * ratio, y: to.y + (previous.y - from.y) * ratio });
}
