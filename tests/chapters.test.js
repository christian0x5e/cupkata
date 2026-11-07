import { describe, expect, it } from 'vitest';
import { markersToChapters as f } from '../src/chapters.js';

const m = (time, label = 'x', beat = false) => ({ id: String(time), time, label, beat });

describe('markersToChapters', () => {
  it('puts a label with line breaks or repeated spaces on one line', () => {
    expect(f([m(20, 'Un\n  deux\t trois'), m(40, ' B  C ')], 200)).toBe('00:00 Début\n00:20 Un deux trois\n00:40 B C');
  });
  it('numbers a label made only of whitespace', () => {
    expect(f([m(20, ' \n\t '), m(40, 'B')], 200)).toBe('00:00 Début\n00:20 Chapitre 2\n00:40 B');
  });
  it('builds lines and adds a first chapter', () => {
    expect(f([m(30, 'A'), m(65.9, 'B')], 200)).toBe('00:00 Début\n00:30 A\n01:05 B');
  });
  it('keeps a marker near the start as the first chapter', () => {
    expect(f([m(0.5, 'Intro'), m(30, 'A'), m(60, 'B')], 200)).toBe('00:00 Intro\n00:30 A\n01:00 B');
  });
  it('ignores beats and markers past the end', () => {
    expect(f([m(20, 'A'), m(40, 'beat', true), m(50, 'B'), m(300, 'C')], 200)).toBe('00:00 Début\n00:20 A\n00:50 B');
  });
  it('sorts without mutating the input', () => {
    const input = [m(50, 'B'), m(20, 'A')];
    expect(f(input, 200)).toBe('00:00 Début\n00:20 A\n00:50 B');
    expect(input.map((x) => x.time)).toEqual([50, 20]);
  });
  it('drops markers too close to the last kept chapter', () => {
    expect(f([m(5, 'no'), m(20, 'A'), m(25, 'no'), m(29.9, 'no'), m(30, 'B')], 200)).toBe('00:00 Début\n00:20 A\n00:30 B');
  });
  it('measures the 10 seconds on real times, not rounded ones', () => {
    expect(f([m(20.9, 'A'), m(30, 'no'), m(31, 'B')], 200)).toBe('00:00 Début\n00:20 A\n00:31 B');
    expect(f([m(20, 'A'), m(40, 'B'), m(90.5, 'no')], 100)).toBe('00:00 Début\n00:20 A\n00:40 B');
  });
  it('drops a last chapter that is too short, repeatedly', () => {
    expect(f([m(20, 'A'), m(40, 'B'), m(95, 'no')], 100)).toBe('00:00 Début\n00:20 A\n00:40 B');
    expect(f([m(20, 'A'), m(40, 'B')], 45)).toBe('');
  });
  it('returns nothing under 3 chapters', () => {
    expect(f([], 200)).toBe('');
    expect(f([m(20, 'A')], 200)).toBe('');
    expect(f([m(0, 'A'), m(20, 'B')], 200)).toBe('');
  });
  it('numbers empty labels by final position and trims the others', () => {
    expect(f([m(0, ' '), m(5, 'no'), m(20, ''), m(40, '  B  ')], 200)).toBe('00:00 Chapitre 1\n00:20 Chapitre 2\n00:40 B');
    expect(f([{ time: 20 }, m(40, 'B')], 200)).toBe('00:00 Début\n00:20 Chapitre 2\n00:40 B');
  });
  it('formats hours', () => {
    expect(f([m(30, 'A'), m(3723.7, 'B')], 4000)).toBe('00:00 Début\n00:30 A\n1:02:03 B');
  });
});
