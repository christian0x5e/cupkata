import { describe, expect, it } from 'vitest';
import { EXPORT_PRESETS, estimateBytes, formatBytes } from '../src/exportPresets.js';

describe('formatBytes', () => {
  it('rounds to megabytes below a gigabyte', () => {
    expect(formatBytes(999.4e6)).toBe('999 Mo');
    expect(formatBytes(0)).toBe('1 Mo');
  });
  it('switches to gigabytes when the megabytes would round to 1000', () => {
    expect(formatBytes(999.5e6)).toBe('1,0 Go');
    expect(formatBytes(1e9)).toBe('1,0 Go');
    expect(formatBytes(2.5e9)).toBe('2,5 Go');
  });
  it('shows a dash for an invalid size', () => {
    for (const b of [NaN, Infinity, undefined, -1]) expect(formatBytes(b)).toBe('—');
  });
});

describe('estimateBytes', () => {
  const youtube = EXPORT_PRESETS.find((p) => p.id === 'youtube');
  it('still uses the preset bitrates', () => {
    expect(estimateBytes(youtube, 1920, 1080, 30, 8)).toBe(10192000);
  });
  it('still falls back on constant quality without a preset', () => {
    expect(estimateBytes(null, 100, 100, 10, 1)).toBe((12000 + 192000) / 8);
  });
  it('is 0 for an invalid or negative length', () => {
    for (const s of [NaN, Infinity, undefined, -3]) expect(estimateBytes(youtube, 1920, 1080, 30, s)).toBe(0);
  });
});
