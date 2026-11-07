import { describe, expect, it } from 'vitest';
import { SHORT_MAX_SECONDS, shortPlan as f } from '../src/short.js';

const media = [
  { id: 'v', type: 'video' },
  { id: 'i', type: 'image' },
  { id: 'gone', type: 'video', missing: true },
];
const clip = (id, start, duration, extra = {}) => ({ id, mediaId: 'v', track: 'video', start, duration, ...extra });

describe('shortPlan', () => {
  it('handles an empty project', () => {
    expect(f([], media)).toEqual({ targets: [], framed: 0, stills: 0, missing: 0, total: 0, tooLong: false });
  });
  it('returns the main-track videos to reframe, sorted by start', () => {
    const plan = f([clip('b', 5, 5), clip('a', 0, 5, { lane: 0 })], media);
    expect(plan.targets.map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('ignores overlays and other tracks, even in the total', () => {
    const plan = f([clip('a', 0, 5), clip('o', 0, 500, { lane: 1 }), clip('s', 0, 500, { track: 'audio' })], media);
    expect(plan.targets.map((c) => c.id)).toEqual(['a']);
    expect(plan.total).toBe(5);
    expect(plan.tooLong).toBe(false);
  });
  it('counts clips that cannot be reframed instead of targeting them', () => {
    const plan = f([
      clip('done', 0, 1, { reframe: [{ t: 0, x: 0.5 }] }),
      clip('still', 1, 1, { mediaId: 'i' }),
      clip('lost', 2, 1, { mediaId: 'gone' }),
      clip('unknown', 3, 1, { mediaId: 'nope' }),
      clip('ok', 4, 1, { reframe: [] }),
    ], media);
    expect(plan.targets.map((c) => c.id)).toEqual(['ok']);
    expect(plan).toMatchObject({ framed: 1, stills: 1, missing: 2, total: 5 });
  });
  it('measures the total at the end of the last clip, gaps included', () => {
    expect(f([clip('a', 0, 2), clip('b', 10, 3), clip('c', 4, 1)], media).total).toBe(13);
  });
  it('is too long only above the limit', () => {
    expect(f([clip('a', 0, SHORT_MAX_SECONDS)], media).tooLong).toBe(false);
    expect(f([clip('a', 0, SHORT_MAX_SECONDS + 0.5)], media).tooLong).toBe(true);
  });
  it('does not change its input', () => {
    const clips = [clip('b', 5, 5), clip('a', 0, 5)];
    f(clips, media);
    expect(clips.map((c) => c.id)).toEqual(['b', 'a']);
  });
});
