import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectEncoder, finalArgs, proxyArgs, withFallback } from '../electron/encoders.cjs';
import { buildExportArgs, ffmpegPath, ffprobePath } from '../electron/media.cjs';
import { createProxies, needsProxy, trimCache } from '../electron/proxies.cjs';
import { correctedRate, inWindow, SEEK_ABOVE, visibleWindow } from '../src/sync.js';

const ffmpeg = (...args) => execFileSync(ffmpegPath, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
const probe = (file) => JSON.parse(execFileSync(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
const SOURCE = [190, 30, 60];
const TOLERANCE = 4;
const shown = (file) => [...ffmpeg('-i', file, '-frames:v', '1', '-vf', 'crop=8:8:iw/2:ih/2,scale=1:1:flags=area:in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', '-')];

let dir;
let encoder;
const at = (name) => path.join(dir, name);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupkata-speed-'));
  encoder = await detectEncoder(ffmpegPath);
  ffmpeg('-f', 'lavfi', '-i', 'color=c=0xC02040:s=2560x1440:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=330:d=2', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-c:a', 'aac', at('big.mp4'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));

describe('synchronisation de la lecture', () => {
  it('ne touche à rien pour un écart infime', () => {
    expect(correctedRate(0.01, 1)).toBe(1);
    expect(correctedRate(-0.019, 2)).toBe(2);
  });
  it('ralentit si la vidéo est en avance, accélère si elle est en retard', () => {
    expect(correctedRate(0.03, 1)).toBeLessThan(1);
    expect(correctedRate(-0.03, 1)).toBeGreaterThan(1);
  });
  it('ne corrige jamais de plus de 5 %, quelle que soit la vitesse du clip', () => {
    expect(correctedRate(0.2, 1)).toBeCloseTo(0.95);
    expect(correctedRate(-0.2, 2)).toBeCloseTo(2.1);
  });
  it('saute seulement au-delà de 0,25 s', () => expect(SEEK_ABOVE).toBe(0.25));
});

describe('clips visibles de la timeline', () => {
  const clip = (start, duration = 1) => ({ start, duration });
  it('dessine tout tant que la largeur est inconnue', () => {
    expect(inWindow(clip(9999), 100, visibleWindow(0, 0))).toBe(true);
  });
  it('garde les clips visibles et une marge, pas les autres', () => {
    const view = visibleWindow(5000, 1000);
    expect(inWindow(clip(50), 100, view)).toBe(true);
    expect(inWindow(clip(46), 100, view)).toBe(true);
    expect(inWindow(clip(10), 100, view)).toBe(false);
    expect(inWindow(clip(200), 100, view)).toBe(false);
  });
  it('couvre toujours ce qui est à l’écran pendant le défilement', () => {
    for (let left = 0; left < 10000; left += 137) {
      const view = visibleWindow(left, 1000);
      expect(view.from).toBeLessThanOrEqual(left);
      expect(view.to).toBeGreaterThanOrEqual(left + 1000);
    }
  });
  it('un même bloc ne redessine pas', () => {
    expect(visibleWindow(5010, 1000)).toEqual(visibleWindow(5400, 1000));
  });
});

describe('copies légères', () => {
  const big = { type: 'video', width: 2560, height: 1440 };
  it('seulement pour les vidéos plus grandes que la Full HD', () => {
    expect(needsProxy(big)).toBe(true);
    expect(needsProxy({ ...big, height: 2560, width: 1440 })).toBe(true);
    expect(needsProxy({ ...big, width: 1920, height: 1080 })).toBe(false);
    expect(needsProxy({ ...big, type: 'image' })).toBe(false);
    expect(needsProxy({ ...big, alpha: true })).toBe(false);
    expect(needsProxy({ ...big, missing: true })).toBe(false);
  });

  it('crée une copie légère fidèle, une seule fois', async () => {
    const proxyDir = at('proxies');
    const ready = [];
    let done;
    const finished = new Promise((r) => { done = r; });
    const proxies = createProxies({
      dir: proxyDir, ffmpegPath, getEncoder: async () => encoder, encoderArgs: proxyArgs, isBusy: () => false,
      onReady: (file, out) => { ready.push(out); done(); },
      onFailed: () => done(),
    });
    const m = { ...big, path: at('big.mp4'), colorSpace: 'bt709' };
    expect((await proxies.request(m)).status).toBe('pending');
    expect((await proxies.request(m)).status).toBe('pending');
    await finished;
    expect(ready).toHaveLength(1);
    expect((await proxies.request(m)).status).toBe('ready');
    const { streams, format } = probe(ready[0]);
    const video = streams.find((s) => s.codec_type === 'video');
    expect([video.width, video.height]).toEqual([1280, 720]);
    expect(streams.some((s) => s.codec_type === 'audio')).toBe(true);
    expect(Math.abs(Number(format.duration) - 2)).toBeLessThan(0.1);
    expect(video.color_space).toBe('bt709');
    shown(ready[0]).forEach((v, i) => expect(Math.abs(v - SOURCE[i])).toBeLessThanOrEqual(TOLERANCE));
    proxies.stop();
  });

  it('attend la fin de l’export pour commencer', async () => {
    let busy = true;
    let ready = 0;
    const proxies = createProxies({
      dir: at('proxies2'), ffmpegPath, getEncoder: async () => encoder, encoderArgs: proxyArgs, isBusy: () => busy,
      onReady: () => { ready++; }, onFailed: () => {},
    });
    await proxies.request({ ...big, path: at('big.mp4'), colorSpace: 'bt709' });
    await new Promise((r) => setTimeout(r, 300));
    expect(ready).toBe(0);
    busy = false;
    proxies.stop();
  });

  it('un fichier impossible à lire est signalé sans bloquer la file', async () => {
    fs.writeFileSync(at('bad.mp4'), 'pas une vidéo');
    const failed = await new Promise((resolve) => {
      const proxies = createProxies({
        dir: at('proxies3'), ffmpegPath, getEncoder: async () => encoder, encoderArgs: proxyArgs, isBusy: () => false,
        onReady: () => resolve(null), onFailed: resolve,
      });
      proxies.request({ ...big, path: at('bad.mp4') });
    });
    expect(failed).toBe(at('bad.mp4'));
    expect(fs.readdirSync(at('proxies3'))).toEqual([]);
  });

  it('supprime les copies les moins utilisées au-delà de la limite', async () => {
    const cache = at('cache');
    fs.mkdirSync(cache);
    for (const [name, age] of [['old', 30], ['mid', 20], ['new', 10]]) {
      const file = path.join(cache, `${name}.mp4`);
      fs.writeFileSync(file, Buffer.alloc(100));
      const when = new Date(Date.now() - age * 1000);
      fs.utimesSync(file, when, when);
    }
    await trimCache(cache, 250);
    expect(fs.readdirSync(cache).sort()).toEqual(['mid.mp4', 'new.mp4']);
  });
});

describe('encodeur de la carte graphique', () => {
  const project = () => ({
    width: 1280, height: 720, fps: 30,
    media: [{ id: 'm', path: at('big.mp4'), name: 'big', type: 'video', duration: 2, width: 2560, height: 1440, hasAudio: true, colorSpace: 'bt709' }],
    clips: [{ id: 'c', mediaId: 'm', track: 'video', lane: 0, start: 0, in: 0, duration: 2 }],
  });
  const run = (out, opts, p = project()) => {
    ffmpeg(...buildExportArgs(p, at(out), () => true, new Map(), opts).args.slice(1));
    return at(out);
  };
  const expectFaithful = (file) => shown(file).forEach((v, i) => expect(Math.abs(v - SOURCE[i])).toBeLessThanOrEqual(TOLERANCE));

  it('repasse sur le processeur si la carte refuse', async () => {
    const tried = [];
    const result = await withFallback('h264_nvenc', async (e) => {
      tried.push(e);
      if (e === 'h264_nvenc') throw new Error('Pilote refusé');
      return 'fait';
    });
    expect(result).toBe('fait');
    expect(tried).toEqual(['h264_nvenc', 'libx264']);
  });

  it('ne relance pas un export annulé', async () => {
    let runs = 0;
    await expect(withFallback('h264_nvenc', async () => { runs++; throw new Error('Export annulé'); })).rejects.toThrow('annulé');
    expect(runs).toBe(1);
  });

  it('signale une vraie panne du processeur', async () => {
    await expect(withFallback('libx264', async () => { throw new Error('Disque plein'); })).rejects.toThrow('Disque plein');
  });

  it('annonce un encodeur connu', () => expect(['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']).toContain(encoder));

  it('un débit demandé est bien transmis', () => {
    for (const e of ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']) expect(finalArgs(e, 8000)).toContain('8000k');
  });

  it('garde les couleurs et annonce BT.709', () => {
    const file = run('hw.mp4', { encoder });
    expectFaithful(file);
    const video = probe(file).streams.find((s) => s.codec_type === 'video');
    expect(video).toMatchObject({ codec_name: 'h264', pix_fmt: 'yuv420p', color_space: 'bt709' });
  });

  it('garde les couleurs à travers un bloc intermédiaire', () => {
    const block = run('hw-block.mkv', { encoder, range: { first: 0, last: 0, L: 2 } });
    expectFaithful(run('hw-final.mp4', { encoder, chunks: [{ path: block, L: 2 }] }));
  });

  it('respecte un débit cible', () => {
    const p = project();
    p.encode = { video: 4000 };
    const file = run('hw-rate.mp4', { encoder }, p);
    expect(Number(probe(file).format.bit_rate)).toBeLessThan(6000 * 1000);
  });
});
