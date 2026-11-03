// Real exports through FFmpeg: the colours and the length of what comes out.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExportArgs, ffmpegPath, ffprobePath, gpuJobs } from '../electron/media.cjs';

const COLOR = [191, 30, 62];
const TOLERANCE = 4;
const rgbSource = (w, h) => `color=c=0xC02040:s=${w}x${h}:r=30:d=1`;
const ffmpeg = (...args) => execFileSync(ffmpegPath, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
const X264 = ['-c:v', 'libx264', '-crf', '4'];

let dir;
const at = (name) => path.join(dir, name);

// The colour a player shows: it reads the file's tags, and they must say BT.709.
function shownColor(file) {
  return [...ffmpeg('-i', file, '-frames:v', '1', '-vf', 'crop=8:8:600:300,scale=1:1:flags=area:in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', '-')];
}
function info(file) {
  const { streams, format } = JSON.parse(execFileSync(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  return { video: streams.find((s) => s.codec_type === 'video'), audio: streams.find((s) => s.codec_type === 'audio'), duration: Number(format.duration) };
}
function project(name, type, overrides = {}) {
  const media = [{ id: 'm', path: at(name), name, type, duration: 1, width: 1280, height: 720, hasAudio: false, ...overrides }];
  return { width: 1280, height: 720, fps: 30, media, clips: [{ id: 'c', mediaId: 'm', track: 'video', lane: 0, start: 0, in: 0, duration: 1 }] };
}
function run(p, out, opts) {
  ffmpeg(...buildExportArgs(p, at(out), () => true, new Map(), opts).args.slice(1));
  return at(out);
}
const expectColor = (file) => shownColor(file).forEach((v, i) => expect(Math.abs(v - COLOR[i])).toBeLessThanOrEqual(TOLERANCE));

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupkata-export-'));
  ffmpeg('-f', 'lavfi', '-i', rgbSource(1280, 720), '-frames:v', '1', at('image.png'));
  const hd = ['-f', 'lavfi', '-i', rgbSource(1280, 720), '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', ...X264];
  ffmpeg(...hd, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', at('hd-tagged.mp4'));
  ffmpeg(...hd, at('hd-untagged.mp4'));
  ffmpeg('-f', 'lavfi', '-i', rgbSource(1280, 720), '-vf', 'scale=out_color_matrix=bt709:out_range=pc,format=yuvj420p', ...X264, '-colorspace', 'bt709', '-color_range', 'pc', at('hd-full.mp4'));
  ffmpeg('-f', 'lavfi', '-i', rgbSource(640, 480), '-vf', 'scale=out_color_matrix=bt601:out_range=tv,format=yuv420p', ...X264, at('sd-untagged.mp4'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('couleurs à l’export', () => {
  it('une image garde sa couleur', () => expectColor(run(project('image.png', 'image'), 'o1.mp4')));
  it('une vidéo HD BT.709 garde sa couleur', () => expectColor(run(project('hd-tagged.mp4', 'video', { colorSpace: 'bt709' }), 'o2.mp4')));
  it('une vidéo HD sans balise garde sa couleur', () => expectColor(run(project('hd-untagged.mp4', 'video'), 'o3.mp4')));
  it('une vidéo en plage complète (téléphone) garde sa couleur', () => expectColor(run(project('hd-full.mp4', 'video', { colorSpace: 'bt709' }), 'o9.mp4')));
  it('une vidéo SD sans balise garde sa couleur', () => expectColor(run(project('sd-untagged.mp4', 'video', { width: 640, height: 480 }), 'o4.mp4')));

  it('un long montage passé par des blocs garde sa couleur', () => {
    const p = project('image.png', 'image');
    const block = run(p, 'block.mkv', { range: { first: 0, last: 0, L: 1 } });
    expectColor(run(p, 'o5.mp4', { chunks: [{ path: block, L: 1 }] }));
  });

  it('un calque par-dessus une vidéo garde sa couleur', () => {
    ffmpeg('-i', at('image.png'), '-frames:v', '1', '-vf', 'format=rgba', at('overlay.png'));
    const p = project('hd-tagged.mp4', 'video', { colorSpace: 'bt709' });
    p.overlays = [{ path: at('overlay.png'), start: 0, end: 1 }];
    expectColor(run(p, 'o6.mp4'));
  });

  it('une vidéo HD entre avec la bonne couleur dans un effet GPU', () => {
    for (const [name, extra] of [['hd-tagged.mp4', { colorSpace: 'bt709' }], ['hd-untagged.mp4', {}]]) {
      const p = project(name, 'video', extra);
      p.clips[0].effect = { type: 'swirl' };
      const [job] = gpuJobs(p, () => true);
      const raw = ffmpeg(...job.inputArgs, '-filter_complex', `[0:v]${job.chain},crop=8:8:600:300,scale=1:1:flags=area,format=rgb24[o]`, '-map', '[o]', '-frames:v', '1', '-f', 'rawvideo', '-');
      [...raw].forEach((v, i) => expect(Math.abs(v - COLOR[i])).toBeLessThanOrEqual(TOLERANCE));
    }
  });

  it('le fichier annonce BT.709', () => {
    const { video } = info(run(project('image.png', 'image'), 'o7.mp4'));
    expect(video).toMatchObject({ color_space: 'bt709', color_primaries: 'bt709', color_transfer: 'bt709', color_range: 'tv' });
  });
});

describe('fichier exporté', () => {
  it('a la bonne taille, la bonne durée et du son', () => {
    const p = project('image.png', 'image');
    p.clips[0].duration = 2;
    const { video, audio, duration } = info(run(p, 'o8.mp4'));
    expect(video).toMatchObject({ codec_name: 'h264', pix_fmt: 'yuv420p', width: 1280, height: 720 });
    expect(audio.codec_name).toBe('aac');
    expect(duration).toBeGreaterThan(1.9);
    expect(duration).toBeLessThan(2.15);
  });
});
