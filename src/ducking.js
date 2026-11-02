import P from '../shared/effects.json';
import { clipAudio, clipSpeed } from './project.js';

const D = P.duck;
const PEAKS_PER_SECOND = 100;

// Timeline intervals where the video track's own sound is loud enough to be speech.
export function voiceIntervals(clips, media, peaks) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const raw = [];
  for (const c of clips) {
    if (c.track !== 'video') continue;
    const m = byId.get(c.mediaId);
    const a = clipAudio(c);
    const p = m && peaks.get(m.path);
    if (!p || !m.hasAudio || m.missing || a.muted || a.volume <= 0) continue;
    for (let t = 0; t < c.duration; t += D.window) {
      const i0 = Math.floor((c.in + t * clipSpeed(c)) * PEAKS_PER_SECOND);
      const i1 = Math.min(p.length, Math.ceil((c.in + Math.min(c.duration, t + D.window) * clipSpeed(c)) * PEAKS_PER_SECOND));
      let max = 0;
      for (let i = i0; i < i1; i++) if (p[i] > max) max = p[i];
      if (max >= D.threshold) raw.push([c.start + t, c.start + Math.min(c.duration, t + D.window)]);
    }
  }
  raw.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of raw) {
    const last = merged[merged.length - 1];
    if (last && a - last[1] <= D.mergeGap) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged.filter(([a, b]) => b - a >= D.minLength).map(([a, b]) => [Number(a.toFixed(3)), Number(b.toFixed(3))]);
}

export const clipDuck = (c) => (c.track === 'audio' && c.duck ? { level: c.duck.level ?? D.level } : null);

// 1 outside speech, `level` during speech, with linear ramps (attack before, release after).
export function duckGain(t, intervals, level) {
  let d = 0;
  for (const [a, b] of intervals) {
    if (t < a - D.attack) break;
    const rise = (t - (a - D.attack)) / D.attack;
    const fall = (b + D.release - t) / D.release;
    d = Math.max(d, Math.min(1, Math.max(0, Math.min(rise, fall))));
    if (d >= 1) break;
  }
  return 1 - (1 - level) * d;
}
