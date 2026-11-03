import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromaKeyFile, ffmpegPath, keyColorOf, probe, stabilizeFile, buildExportArgs } from '../electron/media.cjs';
import { sanitize } from '../electron/project.cjs';
import { initialState, reducer, SPEED_RAMPS } from '../src/project.js';
import { adjustmentFilter } from '../src/filters.js';

const ffmpeg = (...args) => execFileSync(ffmpegPath, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const near = (a, b, tolerance) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(tolerance));

let dir;
const at = (name) => path.join(dir, name);
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupkata-features-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));

describe('rampes de vitesse', () => {
  const media = { id: 'm', path: 'a.mp4', name: 'a', type: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true };
  const clip = (id, start, duration, extra = {}) => ({ id, mediaId: 'm', track: 'video', lane: 0, start, in: 4, duration, ...extra });
  const start = (clips) => reducer(initialState, { type: 'LOAD_PROJECT', media: [media], clips, filters: [], markers: [] });
  const ramp = (state, id, speeds) => reducer(state, { type: 'SPEED_RAMP', id, speeds });
  const main = (state) => state.clips.filter((c) => c.id !== 'next').sort((a, b) => a.start - b.start);

  it('couvre exactement la même partie de la source, sans trou', () => {
    const parts = main(ramp(start([clip('a', 0, 12)]), 'a', [0.5, 1, 2, 3]));
    expect(parts).toHaveLength(4);
    parts.forEach((p, i) => {
      expect(p.in).toBeCloseTo(4 + 3 * i);
      expect(p.duration * p.speed).toBeCloseTo(3);
      if (i) expect(p.start).toBeCloseTo(parts[i - 1].start + parts[i - 1].duration);
    });
  });

  it('décale ce qui suit sur la piste principale', () => {
    const state = ramp(start([clip('a', 0, 12), clip('next', 12, 2)]), 'a', [0.5, 0.5]);
    expect(state.clips.find((c) => c.id === 'next').start).toBeCloseTo(24);
  });

  it('garde les fondus aux deux bouts seulement', () => {
    const parts = main(ramp(start([clip('a', 0, 12, { fadeIn: 1, fadeOut: 2 })]), 'a', [1, 1, 1]));
    expect(parts.map((p) => [p.fadeIn, p.fadeOut])).toEqual([[1, 0], [0, 0], [0, 2]]);
  });

  it('respecte les vitesses permises', () => {
    const parts = main(ramp(start([clip('a', 0, 12)]), 'a', [100, 0.01]));
    expect(parts.map((p) => p.speed)).toEqual([4, 0.25]);
  });

  it('s’annule en une seule fois', () => {
    const before = start([clip('a', 0, 12), clip('next', 12, 2)]);
    expect(reducer(ramp(before, 'a', SPEED_RAMPS[0].speeds), { type: 'UNDO' }).clips).toEqual(before.clips);
  });

  it('s’exporte à la bonne durée', async () => {
    ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=330:d=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', at('ramp.mp4'));
    const m = { ...media, path: at('ramp.mp4'), duration: 8, width: 320, height: 180 };
    const state = reducer(reducer(initialState, { type: 'LOAD_PROJECT', media: [m], clips: [{ id: 'a', mediaId: 'm', track: 'video', lane: 0, start: 0, in: 0, duration: 6 }], filters: [], markers: [] }), { type: 'SPEED_RAMP', id: 'a', speeds: [0.5, 2] });
    const { args } = buildExportArgs({ width: 320, height: 180, fps: 30, media: [m], clips: state.clips }, at('ramp-out.mp4'));
    ffmpeg(...args.slice(1));
    const info = await probe(at('ramp-out.mp4'), dir);
    expect(Math.abs(info.duration - 7.5)).toBeLessThan(0.15);
  });
});

describe('calque de réglage', () => {
  it('crée une table de couleurs utilisable', () => {
    const filter = adjustmentFilter({ exposure: 0.5 }, 'Réglage 1');
    expect(filter.id.startsWith('custom:')).toBe(true);
    expect(filter.name).toBe('Réglage 1');
    expect(filter.data.length).toBe(filter.size ** 3 * 3);
  });
  it('sans réglage, l’image ne change pas', () => {
    const { data, size } = adjustmentFilter({}, 'x');
    const mid = (size - 1) / 2;
    const i = (mid + mid * size + mid * size * size) * 3;
    expect(data[i]).toBeCloseTo(0.5, 1);
  });
  it('l’exposition éclaircit', () => {
    const middle = ({ data, size }) => data[((size - 1) / 2) * (1 + size + size * size) * 3];
    expect(middle(adjustmentFilter({ exposure: 0.5 }, 'x'))).toBeGreaterThan(middle(adjustmentFilter({}, 'x')));
  });
});

describe('stabilisation', () => {
  // How far the picture moves between two frames, in pixels, as the motion detector itself sees it.
  const shake = (file) => {
    const work = fs.mkdtempSync(path.join(dir, 'motion-'));
    execFileSync(ffmpegPath, ['-y', '-v', 'error', '-i', file, '-vf', 'vidstabdetect=shakiness=6:accuracy=12:fileformat=ascii:result=m.trf', '-f', 'null', '-'], { cwd: work, stdio: 'ignore' });
    const moves = fs.readFileSync(path.join(work, 'm.trf'), 'latin1').split('\n').filter((l) => l.startsWith('Frame')).map((line) => {
      const vectors = [...line.matchAll(/LM (-?\d+) (-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      if (!vectors.length) return null;
      const median = (k) => vectors.map((v) => v[k]).sort((x, y) => x - y)[vectors.length >> 1];
      return Math.hypot(median(0), median(1));
    }).filter((v) => v != null);
    return moves.reduce((x, y) => x + y, 0) / moves.length;
  };

  it('réduit nettement les tremblements et garde le son et la durée', async () => {
    ffmpeg('-f', 'lavfi', '-i', 'testsrc=s=960x540:r=30:d=1', '-frames:v', '1', at('still.png'));
    ffmpeg('-loop', '1', '-framerate', '30', '-t', '4', '-i', at('still.png'), '-f', 'lavfi', '-i', 'sine=f=330:d=4', '-vf', "crop=800:450:'80+22*sin(n/3)+7*sin(n*1.3)':'45+14*cos(n/4)+5*cos(n*1.7)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', at('shaky.mp4'));
    await stabilizeFile(at('shaky.mp4'), at('stable.mp4'), 'libx264', ['-preset', 'ultrafast', '-crf', '12']);
    const before = shake(at('shaky.mp4'));
    const after = shake(at('stable.mp4'));
    console.log(`tremblement : ${before.toFixed(2)} -> ${after.toFixed(2)} px par image`);
    expect(before).toBeGreaterThan(2);
    expect(after).toBeLessThan(before * 0.5);
    const info = await probe(at('stable.mp4'), dir);
    expect(info.hasAudio).toBe(true);
    expect(Math.abs(info.duration - 4)).toBeLessThan(0.15);
    expect([info.width, info.height]).toEqual([800, 450]);
  }, 120000);

  it('signale un fichier illisible', async () => {
    fs.writeFileSync(at('bad.mp4'), 'rien');
    await expect(stabilizeFile(at('bad.mp4'), at('bad-out.mp4'), 'libx264', [])).rejects.toThrow();
  });
});

describe('fond vert', () => {
  const pixel = (file, x, y, decoder = []) => [...ffmpeg(...decoder, '-i', file, '-frames:v', '1', '-vf', `crop=8:8:${x}:${y},scale=1:1:flags=area,format=rgba`, '-f', 'rawvideo', '-')];
  beforeAll(() => {
    // A dull studio green, not the pure green, with a red subject in the middle.
    ffmpeg('-f', 'lavfi', '-i', 'color=c=0x2FA84F:s=640x360:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=0xC02040:s=200x200:r=30:d=1', '-filter_complex', '[0][1]overlay=220:80', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p', at('green.mp4'));
    ffmpeg('-i', at('green.mp4'), '-frames:v', '1', at('green.png'));
  });

  it('lit la couleur du fond dans les coins', async () => {
    const color = await keyColorOf(at('green.mp4'), 0);
    const v = parseInt(color.slice(1), 16);
    near([v >> 16, (v >> 8) & 255, v & 255], [0x2f, 0xa8, 0x4f], 12);
  });

  it('une vidéo garde le sujet et perd le fond', async () => {
    const out = at('keyed.webm');
    await chromaKeyFile({ file: at('green.mp4'), isImage: false, start: 0, span: 1 }, out);
    const info = await probe(out, dir);
    expect(info.alpha).toBe(true);
    const vp9 = ['-c:v', 'libvpx-vp9'];
    expect(pixel(out, 20, 20, vp9)[3]).toBeLessThan(30);
    const subject = pixel(out, 300, 170, vp9);
    expect(subject[3]).toBeGreaterThan(225);
    expect(subject[0]).toBeGreaterThan(subject[1] + 80);
  }, 60000);

  it('une image aussi', async () => {
    const out = at('keyed.png');
    await chromaKeyFile({ file: at('green.png'), isImage: true }, out);
    expect(pixel(out, 20, 20)[3]).toBeLessThan(30);
    expect(pixel(out, 300, 170)[3]).toBeGreaterThan(225);
  });

  it('reste invisible sur un fond bleu uni', async () => {
    ffmpeg('-f', 'lavfi', '-i', 'color=c=0x1040D0:s=640x360:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=0xC02040:s=200x200:r=30:d=1', '-filter_complex', '[0][1]overlay=220:80', '-frames:v', '1', at('blue.png'));
    await chromaKeyFile({ file: at('blue.png'), isImage: true }, at('blue-out.png'));
    expect(pixel(at('blue-out.png'), 20, 20)[3]).toBeLessThan(30);
    expect(pixel(at('blue-out.png'), 300, 170)[3]).toBeGreaterThan(225);
  });
});

describe('projet', () => {
  it('garde la stabilisation à la réouverture', () => {
    const m = (id) => ({ id, path: `${id}.mp4`, name: id, type: 'video', duration: 5, width: 100, height: 100, hasAudio: false });
    const clip = { id: 'c', mediaId: 'copy', track: 'video', lane: 0, start: 0, in: 1, duration: 2, stable: { mediaId: 'orig', in: 1 } };
    const back = sanitize({ app: 'cupkata', media: [m('orig'), m('copy')], clips: [clip] });
    expect(back.clips[0].stable).toEqual({ mediaId: 'orig', in: 1 });
  });
});
