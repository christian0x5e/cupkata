import { buildLut, FILTER_CATEGORIES as CATEGORIES, LUT_SIZE, PRESETS as LOOKS } from '../shared/filters.mjs';
import { T } from './i18n.js';

export const FILTER_CATEGORIES = CATEGORIES.map((category) => T(category));
export const PRESETS = LOOKS.map((look) => ({ ...look, name: T(look.name), cat: T(look.cat) }));
export const DEFAULT_FILTER_AMOUNT = 0.8;

// An adjustment layer: its settings become a table of its own, which every filter path already knows.
export function adjustmentFilter({ exposure = 0, contrast = 0, saturation = 0, temperature = 0 }, name) {
  const data = buildLut({ exp: exposure, con: contrast, sat: saturation, temp: temperature });
  return { id: `custom:${crypto.randomUUID()}`, name, size: LUT_SIZE, data };
}

const cache = new Map();

// Looks a filter up among the presets and the project's imported filters; tables are built once.
export function filterInfo(id, custom = []) {
  if (!id) return null;
  const preset = PRESETS.find((p) => p.id === id);
  if (preset) {
    if (!cache.has(id)) cache.set(id, buildLut(preset.p));
    return { id, name: preset.name, size: LUT_SIZE, data: cache.get(id), custom: false };
  }
  const own = custom.find((f) => f.id === id);
  if (!own) return null;
  if (!cache.has(id)) cache.set(id, new Float32Array(own.data));
  return { id, name: own.name, size: own.size, data: cache.get(id), custom: true };
}

// Applies a filter-track item to the whole picture already in ctx, blended by its fade weight
// (the filter's own amount is applied inside the LUT pass). Shared by the preview and the export.
export function applyFilterItem(ctx, W, H, item, weight, custom, engine) {
  const look = clipFilter(item, custom);
  if (!look || weight <= 0) return;
  const out = engine.renderLut(ctx.canvas, look.id, look.data, look.size, look.amount);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = weight;
  ctx.drawImage(out, 0, 0);
  ctx.restore();
}

export function clipFilter(clip, custom) {
  const f = clip?.filter;
  const info = f?.id ? filterInfo(f.id, custom) : null;
  return info ? { ...info, amount: f.amount ?? DEFAULT_FILTER_AMOUNT } : null;
}
