// The preview's pixel transitions, held against what FFmpeg's xfade writes for the same pictures.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpegPath } from '../electron/media.cjs';
import { sanitize } from '../electron/project.cjs';
import { TRANSITIONS } from '../src/project.js';
import { PIXEL_TRANSITIONS, transitionPixels } from '../src/transitions.js';

const W = 320;
const H = 180;
const FPS = 30;
const SAMPLES = [4, 8, 15, 22, 27];

const raw = (...args) => execFileSync(ffmpegPath, ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 28 });
const rgba = (rgb) => {
  const out = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i];
    out[j + 1] = rgb[i + 1];
    out[j + 2] = rgb[i + 2];
    out[j + 3] = 255;
  }
  return out;
};

let dir;
let a;
let b;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupkata-transitions-'));
  raw('-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=${FPS}`, '-frames:v', '1', path.join(dir, 'a.png'));
  raw('-f', 'lavfi', '-i', `smptebars=s=${W}x${H}:r=${FPS}`, '-frames:v', '1', path.join(dir, 'b.png'));
  const read = (name) => rgba(raw('-i', path.join(dir, name), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'));
  a = read('a.png');
  b = read('b.png');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Share of the colour values further than a few levels from FFmpeg's picture.
function difference(type, frames, n) {
  const start = n * W * H * 3;
  const want = rgba(frames.subarray(start, start + W * H * 3));
  const got = new Uint8ClampedArray(W * H * 4);
  transitionPixels(type, a, b, got, W, H, 1 - Math.fround(n / FPS));
  let off = 0;
  for (let i = 0; i < got.length; i += 4) for (let c = 0; c < 3; c++) if (Math.abs(got[i + c] - want[i + c]) > 3) off++;
  return off / (W * H * 3);
}

describe('pixel transitions', () => {
  for (const type of PIXEL_TRANSITIONS) {
    it(`${type} matches FFmpeg`, () => {
      const frames = raw('-loop', '1', '-r', String(FPS), '-i', path.join(dir, 'a.png'), '-loop', '1', '-r', String(FPS), '-i', path.join(dir, 'b.png'),
        '-filter_complex', `[0]format=gbrp[x];[1]format=gbrp[y];[x][y]xfade=transition=${type}:duration=1:offset=0`,
        '-frames:v', '28', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
      for (const n of SAMPLES) expect(difference(type, frames, n), `image ${n}`).toBeLessThan(0.01);
    }, 30000);
  }
  // FFmpeg 6.1's squeezev crashes outright, which is why it isn't offered: every other one must get to the end.
  it('runs each of them to the end, in the export format', () => {
    for (const type of PIXEL_TRANSITIONS) {
      raw('-loop', '1', '-r', String(FPS), '-i', path.join(dir, 'a.png'), '-loop', '1', '-r', String(FPS), '-i', path.join(dir, 'b.png'),
        '-filter_complex', `[0]format=yuv420p[x];[1]format=yuv420p[y];[x][y]xfade=transition=${type}:duration=1:offset=0`, '-frames:v', '40', '-f', 'null', '-');
    }
  }, 120000);
  it('offers each of them, and saving keeps them', () => {
    const ids = TRANSITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const media = [{ id: 'm', path: 'a.mp4', name: 'a', type: 'video', duration: 2 }];
    for (const type of ids) {
      const out = sanitize({ app: 'cupkata', media, clips: [{ id: 'c', mediaId: 'm', track: 'video', start: 0, in: 0, duration: 2, transition: { type, duration: 1 } }] });
      expect(out.clips[0].transition?.type, type).toBe(type);
    }
    for (const type of PIXEL_TRANSITIONS) expect(ids).toContain(type);
  });
});
