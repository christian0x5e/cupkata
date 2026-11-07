// Which pictures the Transitions, Filters and Effects tiles show.
import { describe, expect, it } from 'vitest';
import { previewFiles } from '../src/previewPictures.js';

const media = [
  { id: 'song', type: 'audio', thumb: null },
  { id: 'a', type: 'video', thumb: 'a.jpg' },
  { id: 'b', type: 'image', thumb: 'b.jpg' },
  { id: 'c', type: 'video', thumb: 'c.jpg' },
  { id: 'gone', type: 'video', thumb: 'gone.jpg', missing: true },
];
const clip = (mediaId, start, track = 'video') => ({ mediaId, start, track });

describe('preview pictures', () => {
  it('has nothing to show without visual media, so the sample photos stay', () => {
    expect(previewFiles([], [])).toEqual([]);
    expect(previewFiles([clip('song', 0, 'audio')], [media[0]])).toEqual([]);
  });
  it('prefers the media asked for', () => {
    expect(previewFiles([clip('a', 0)], media, ['c', 'b'])).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
  });
  it('then follows the montage, then the bin', () => {
    expect(previewFiles([clip('c', 5), clip('b', 0)], media)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
  });
  it('never gives the same picture twice, so a cut within one file still shows two pictures when it can', () => {
    expect(previewFiles([clip('a', 0), clip('a', 3)], media, ['a', 'a'])).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
  it('skips missing files and unknown ids', () => {
    expect(previewFiles([clip('gone', 0)], media, [undefined, 'nope'])).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
});
