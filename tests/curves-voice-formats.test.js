// Keyframe curves, voice effects and export formats, the last two through real FFmpeg runs.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExportArgs, ffmpegPath, ffprobePath, voiceEffectFile, VOICE_EFFECTS } from '../electron/media.cjs';
import { detectEncoder, finalArgs, withFallback } from '../electron/encoders.cjs';
import { sanitize } from '../electron/project.cjs';
import { estimateBytes } from '../src/exportPresets.js';
import { setKeyframe, setKeyframeEase, valueAt } from '../src/keyframes.js';

const ffmpeg = (...args) => execFileSync(ffmpegPath, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
const clip = (ease) => ({ in: 0, speed: 1, keyframes: { x: [{ t: 0, v: 0, ...(ease ? { ease } : {}) }, { t: 1, v: 1 }] } });

describe('keyframe curves', () => {
  it('follows each curve between two keyframes', () => {
    expect(valueAt(clip(), 'x', 0.5, 0)).toBeCloseTo(0.5);
    expect(valueAt(clip('in'), 'x', 0.5, 0)).toBeCloseTo(0.25);
    expect(valueAt(clip('out'), 'x', 0.5, 0)).toBeCloseTo(0.75);
    expect(valueAt(clip('inOut'), 'x', 0.25, 0)).toBeCloseTo(0.15625);
    expect(valueAt(clip('hold'), 'x', 0.99, 0)).toBe(0);
  });
  it('reaches the next keyframe exactly', () => {
    for (const ease of ['in', 'out', 'inOut', 'hold']) expect(valueAt(clip(ease), 'x', 1, 0)).toBe(1);
  });
  it('keeps the volume on straight lines, as the export does', () => {
    const c = { in: 0, speed: 1, keyframes: { volume: [{ t: 0, v: 0, ease: 'in' }, { t: 1, v: 1 }] } };
    expect(valueAt(c, 'volume', 0.5, 0)).toBeCloseTo(0.5);
  });
  it('sets a curve, goes back to linear, and keeps it when the value changes', () => {
    const eased = { ...clip(), ...setKeyframeEase(clip(), 'x', 0, 'out') };
    expect(eased.keyframes.x[0].ease).toBe('out');
    expect(eased.keyframes.x[1].ease).toBeUndefined();
    expect(setKeyframe(eased, 'x', 0, 0.2).keyframes.x[0]).toEqual({ t: 0, v: 0.2, ease: 'out' });
    expect(setKeyframeEase(eased, 'x', 0, 'linear').keyframes.x[0].ease).toBeUndefined();
  });
  it('survives saving, without unknown curves or a curve on the volume', () => {
    const media = [{ id: 'm', path: 'a.mp4', name: 'a', type: 'video', duration: 2 }];
    const keyframes = {
      x: [{ t: 0, v: 0, ease: 'out' }, { t: 1, v: 1, ease: 'bad' }],
      volume: [{ t: 0, v: 1, ease: 'in' }],
    };
    const out = sanitize({ app: 'cupkata', media, clips: [{ id: 'c', mediaId: 'm', track: 'video', start: 0, in: 0, duration: 2, keyframes }] });
    expect(out.clips[0].keyframes.x).toEqual([{ t: 0, v: 0, ease: 'out' }, { t: 1, v: 1 }]);
    expect(out.clips[0].keyframes.volume).toEqual([{ t: 0, v: 1 }]);
  });
});

let dir;
const at = (name) => path.join(dir, name);
const probe = (file) => JSON.parse(execFileSync(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]).toString());

// Seconds until the sound first rises above a tenth of its peak.
function onset(file) {
  const raw = ffmpeg('-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 's16le', '-');
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  return samples.findIndex((x) => Math.abs(x) > peak * 0.1) / 48000;
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupkata-ideas-'));
  ffmpeg('-f', 'lavfi', '-i', "aevalsrc='if(between(t,1,1.2),0.5*sin(2*PI*400*t),0)':s=48000:d=3", '-c:a', 'pcm_s16le', at('click.wav'));
  ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', at('v.mp4'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('voice effects', () => {
  for (const { id } of VOICE_EFFECTS) {
    it(`${id} keeps the length and the sync`, async () => {
      const out = at(`${id}.m4a`);
      await voiceEffectFile(at('click.wav'), out, false, id, 3);
      expect(Number(probe(out).format.duration)).toBeCloseTo(3, 1);
      expect(Math.abs(onset(out) - onset(at('click.wav')))).toBeLessThan(0.03);
    }, 60000);
  }
  it('leaves the picture untouched on a video', async () => {
    ffmpeg('-i', at('v.mp4'), '-f', 'lavfi', '-i', 'sine=f=300:r=48000:d=1', '-c:v', 'copy', '-c:a', 'aac', '-shortest', at('av.mp4'));
    await voiceEffectFile(at('av.mp4'), at('av robot.mp4'), true, 'robot', 1);
    const video = (f) => probe(f).streams.find((s) => s.codec_type === 'video');
    expect(video(at('av robot.mp4')).codec_name).toBe('h264');
    expect(video(at('av robot.mp4')).nb_frames).toBe(video(at('av.mp4')).nb_frames);
  }, 60000);
});

describe('export formats', () => {
  const project = (encode) => ({
    width: 640, height: 360, fps: 30, encode,
    media: [{ id: 'm', path: at('v.mp4'), name: 'v', type: 'video', duration: 1, width: 640, height: 360, hasAudio: false }],
    clips: [{ id: 'c', mediaId: 'm', track: 'video', lane: 0, start: 0, in: 0, duration: 1 }],
  });
  const exportWith = (out, finalEncoder, encode) => {
    ffmpeg(...buildExportArgs(project(encode), at(out), () => true, new Map(), { encoder: 'libx264', finalEncoder }).args.slice(1));
    return probe(at(out)).streams.find((s) => s.codec_type === 'video');
  };

  it('writes H.265 tagged for every player', async () => {
    const v = exportWith('hevc.mp4', await detectEncoder(ffmpegPath, 'hevc'), { codec: 'hevc' });
    expect(v.codec_name).toBe('hevc');
    expect(v.codec_tag_string).toBe('hvc1');
  }, 120000);
  it('writes AV1', async () => {
    expect(exportWith('av1.mp4', await detectEncoder(ffmpegPath, 'av1'), { codec: 'av1' }).codec_name).toBe('av1');
  }, 120000);
  it('writes H.265 with the processor at a target bitrate', () => {
    expect(exportWith('x265.mp4', 'libx265', { codec: 'hevc', video: 2000, audio: 128 }).codec_name).toBe('hevc');
  }, 120000);
  it('keeps H.264 by default', () => {
    expect(buildExportArgs(project(null), at('x.mp4'), () => true, new Map(), { encoder: 'libx264' }).args).toContain('libx264');
    expect(finalArgs('libx264')).not.toContain('-tag:v');
  });
  it('falls back to the same format on the processor', async () => {
    const seen = [];
    const result = await withFallback('h264_nvenc', async (e, f) => {
      seen.push([e, f]);
      if (e !== 'libx264') throw new Error('refused');
      return 'done';
    }, 'hevc_nvenc');
    expect(result).toBe('done');
    expect(seen).toEqual([['h264_nvenc', 'hevc_nvenc'], ['libx264', 'libx265']]);
  });
  it('expects a smaller file in constant quality only', () => {
    const size = (p, codec) => estimateBytes(p, 1920, 1080, 30, 60, codec);
    expect(size({}, 'hevc')).toBeLessThan(size({}, 'h264'));
    expect(size({ video: 8000, audio: 192 }, 'hevc')).toBe(size({ video: 8000, audio: 192 }, 'h264'));
  });
});
