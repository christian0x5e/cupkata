import { describe, expect, it } from 'vitest';
import { formatShort, formatTime } from '../src/format.js';

describe('formatShort', () => {
  it('keeps minutes and seconds under an hour', () => {
    expect(formatShort(65)).toBe('1:05');
    expect(formatShort(59.6)).toBe('1:00');
  });
  it('shows hours from one hour on', () => {
    expect(formatShort(3600)).toBe('1:00:00');
    expect(formatShort(3700)).toBe('1:01:40');
    expect(formatShort(3599.6)).toBe('1:00:00');
  });
  it('shows 0:00 for negative or invalid times', () => {
    for (const t of [-5, NaN, Infinity, undefined]) expect(formatShort(t)).toBe('0:00');
  });
});

describe('formatTime', () => {
  it('keeps minutes, seconds and frames under an hour', () => {
    expect(formatTime(65.5)).toBe('01:05:15');
    expect(formatTime(3599.5)).toBe('59:59:15');
  });
  it('shows hours from one hour on', () => {
    expect(formatTime(3661.5)).toBe('1:01:01:15');
  });
  it('shows zero for negative or invalid times', () => {
    for (const t of [-5, NaN, Infinity, undefined]) expect(formatTime(t)).toBe('00:00:00');
  });
});
