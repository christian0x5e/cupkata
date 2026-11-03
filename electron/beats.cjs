const { execFile } = require('child_process');
const { ffmpegPath } = require('./media.cjs');

// Finds the beats of a piece of music: an onset curve (how fast the sound level rises), its tempo by
// autocorrelation, then the beat sequence that best follows the curve at that tempo (dynamic
// programming, after D. Ellis, "Beat Tracking by Dynamic Programming", 2007).
const RATE = 11025;
const HOP = 128;
const STEP = HOP / RATE;
const MAX_SPAN = 3600;

function readSamples(file, start, span) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-v', 'error', '-ss', start.toFixed(3), '-t', span.toFixed(3), '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 1 << 30, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr.toString().trim().split('\n').pop() || err.message));
        resolve(new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength)));
      },
    );
  });
}

// Positive changes of the log level, frame by frame, with the slow trend removed.
function onsetCurve(samples) {
  const count = Math.floor(samples.length / HOP);
  const curve = new Float32Array(count);
  let previous = 0;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = i * HOP; k < (i + 1) * HOP; k++) sum += samples[k] * samples[k];
    const level = Math.log1p(1000 * Math.sqrt(sum / HOP));
    curve[i] = Math.max(0, level - previous);
    previous = level;
  }
  const reach = Math.round(1 / STEP);
  let running = 0;
  const trend = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    running += curve[i];
    if (i >= 2 * reach) running -= curve[i - 2 * reach];
    trend[i] = running / Math.min(i + 1, 2 * reach);
  }
  return curve.map((v, i) => Math.max(0, v - trend[i]));
}

// Beat period in curve frames: the strongest repetition, gently preferring tempos near 120 BPM.
function beatPeriod(curve) {
  const lo = Math.round(60 / 200 / STEP);
  const hi = Math.round(60 / 50 / STEP);
  let best = Math.round(0.5 / STEP);
  let bestScore = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    let sum = 0;
    for (let i = lag; i < curve.length; i++) sum += curve[i] * curve[i - lag];
    const octaves = Math.log2((lag * STEP) / 0.5);
    const score = (sum / Math.max(1, curve.length - lag)) * Math.exp(-0.5 * (octaves / 0.9) ** 2);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

function trackBeats(curve, period) {
  const score = new Float32Array(curve.length);
  const from = new Int32Array(curve.length).fill(-1);
  const lo = Math.round(period * 0.5);
  const hi = Math.round(period * 2);
  const tightness = 100;
  for (let i = 0; i < curve.length; i++) {
    let best = 0;
    for (let back = lo; back <= hi && back <= i; back++) {
      const penalty = -tightness * Math.log(back / period) ** 2;
      const value = score[i - back] + penalty;
      if (from[i] < 0 || value > best) {
        best = value;
        from[i] = i - back;
      }
    }
    score[i] = curve[i] + best;
  }
  // The last beat: the best score among the final period.
  let last = Math.max(0, curve.length - 1);
  for (let i = Math.max(0, curve.length - period); i < curve.length; i++) if (score[i] > score[last]) last = i;
  const beats = [];
  for (let i = last; i >= 0; i = from[i]) beats.unshift(i);
  return beats;
}

// Returns { bpm, beats } with the beats in seconds of the source file.
async function findBeats({ file, start = 0, span }) {
  const samples = await readSamples(file, start, Math.min(MAX_SPAN, span));
  const curve = onsetCurve(samples);
  if (curve.length < 16 || !curve.some((v) => v > 0)) return { bpm: 0, beats: [] };
  const period = beatPeriod(curve);
  const frames = trackBeats(curve, period);
  const gaps = frames.slice(1).map((f, i) => f - frames[i]).sort((a, b) => a - b);
  const typical = gaps.length ? gaps.slice(gaps.length >> 2, Math.max((gaps.length >> 2) + 1, gaps.length - (gaps.length >> 2))) : [period];
  return {
    bpm: Math.round(60 / ((typical.reduce((a, b) => a + b, 0) / typical.length) * STEP)),
    beats: frames.map((i) => Math.round((start + i * STEP) * 1000) / 1000),
  };
}

module.exports = { findBeats };
