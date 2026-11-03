const { execFile } = require('child_process');
const { ffmpegPath } = require('./media.cjs');

// Local speech-to-text with Whisper through Transformers.js (Apache-2.0).
// Approach adapted from OpenCut's transcription worker (MIT) — see THIRD_PARTY_NOTICES.md.

const MODELS = ['onnx-community/whisper-base', 'onnx-community/whisper-small'];
const LANGUAGES = ['auto', 'french', 'english', 'spanish', 'german', 'italian', 'portuguese', 'arabic'];
const SAMPLE_RATE = 16000;
// The _timestamped exports of these models also give the time of every word.
const withWordTimes = (model) => `${model}_timestamped`;
// A new segment after a long pause or the end of a sentence.
const SEGMENT_PAUSE = 0.8;

// Phrases Whisper tends to invent on silence or music.
const HALLUCINATIONS = [/amara\.org/i, /sous-titr\w* (réalisés|par|fait)/i, /merci d'avoir regardé/i, /thanks? for watching/i];

let transformers = null;
const pipelines = new Map();

async function getPipeline(model, cacheDir, onProgress) {
  transformers ??= await import('@huggingface/transformers');
  transformers.env.cacheDir = cacheDir;
  transformers.env.allowLocalModels = false;
  if (!pipelines.has(model)) {
    const files = new Map();
    const promise = transformers.pipeline('automatic-speech-recognition', withWordTimes(model), {
      dtype: 'q8',
      progress_callback: (p) => {
        if (!p.file || !(p.total > 0)) return;
        if (p.status === 'progress') files.set(p.file, { loaded: p.loaded, total: p.total });
        if (p.status === 'done') files.set(p.file, { loaded: p.total, total: p.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        onProgress({ phase: 'model', progress: total ? loaded / total : 0 });
      },
    });
    pipelines.set(model, promise);
    promise.catch(() => pipelines.delete(model));
  }
  return pipelines.get(model);
}

function extractAudio(file, start, duration) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-v', 'error', '-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', file, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 1 << 30, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr.toString().trim().split('\n').pop() || err.message));
        const copy = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength);
        resolve(new Float32Array(copy));
      },
    );
  });
}

function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

// items: [{ path, in, duration, start }] — returns segments in timeline seconds.
async function transcribe({ items, model, language }, { cacheDir, onProgress, isCancelled }) {
  const cancelled = () => {
    if (isCancelled()) throw new Error('Transcription annulée');
  };
  onProgress({ phase: 'model', progress: 0 });
  const asr = await getPipeline(model, cacheDir, onProgress);
  const segments = [];
  for (const [index, item] of items.entries()) {
    cancelled();
    onProgress({ phase: 'transcribe', index, count: items.length });
    // A sped-up / slowed-down clip: transcribe its source span, then map times back to the timeline.
    const speed = Number.isFinite(item.speed) && item.speed > 0 ? item.speed : 1;
    const audio = await extractAudio(item.path, item.in, item.duration * speed);
    if (audio.length < SAMPLE_RATE * 0.3 || rms(audio) < 1e-3) continue;
    const out = await asr(audio, {
      language: language === 'auto' ? undefined : language,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
    });
    cancelled();
    const result = Array.isArray(out) ? out[0] : out;
    const clipEnd = item.start + item.duration;
    let current = null;
    const close = () => {
      if (current && !HALLUCINATIONS.some((re) => re.test(current.text))) segments.push(current);
      current = null;
    };
    for (const chunk of result.chunks || []) {
      const w = (chunk.text || '').trim();
      const [a, b] = chunk.timestamp || [];
      if (!w || !Number.isFinite(a)) continue;
      const start = item.start + a / speed;
      const end = Math.min(clipEnd, item.start + (Number.isFinite(b) ? b : a + 0.3) / speed);
      if (end <= start) continue;
      if (current && start - current.end > SEGMENT_PAUSE) close();
      current ??= { text: '', start, end, item: index, words: [] };
      current.text = `${current.text} ${w}`.trim();
      current.end = end;
      current.words.push({ w, start, end, sourceStart: item.in + a, sourceEnd: item.in + (end - item.start) * speed });
      if (/[.?!…]$/.test(w)) close();
    }
    close();
  }
  onProgress({ phase: 'transcribe', index: items.length, count: items.length });
  return segments;
}

module.exports = { transcribe, MODELS, LANGUAGES };
