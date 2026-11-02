// Open-source AI tools that run on this computer (models downloaded once into the models folder):
// background removal (MODNet, Apache-2.0), silence detection (Silero VAD, MIT), subtitle translation
// (OPUS-MT by Helsinki-NLP, Apache-2.0) and text-to-speech (MMS-TTS by Meta, CC BY-NC 4.0).
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { ffmpegPath } = require('./media.cjs');

let transformers = null;
const loaded = new Map();

async function lib(cacheDir) {
  transformers ??= await import('@huggingface/transformers');
  transformers.env.cacheDir = cacheDir;
  transformers.env.allowLocalModels = false;
  return transformers;
}

// Download progress of all the files of a model, as one 0..1 value.
function progressOf(onProgress) {
  const files = new Map();
  return (p) => {
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
  };
}

// Loads a model once per session (a failed load is retried next time).
function once(key, load) {
  if (!loaded.has(key)) {
    const p = load();
    loaded.set(key, p);
    p.catch(() => loaded.delete(key));
  }
  return loaded.get(key);
}

const cancelledError = () => new Error('Opération annulée');

function wav16(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-y', '-v', 'error', ...args], { windowsHide: true, maxBuffer: 1 << 26 }, (err, _out, stderr) =>
      err ? reject(new Error(String(stderr).trim().split('\n').pop() || err.message)) : resolve(),
    );
  });
}

// ── Background removal ─────────────────────────────────────────────────────────────────────────
// Every frame goes through MODNet (people and portraits), which gives a mask; FFmpeg puts that mask
// in the alpha channel of the original picture and writes a transparent WebM (VP9), or a PNG for a photo.
const MODNET = 'Xenova/modnet';
const MASK_SHORT = 384;

async function loadModnet(cacheDir, onProgress) {
  return once('modnet', async () => {
    const t = await lib(cacheDir);
    const progress_callback = progressOf(onProgress);
    const model = await t.AutoModel.from_pretrained(MODNET, { dtype: 'fp32', progress_callback });
    const processor = await t.AutoProcessor.from_pretrained(MODNET, { progress_callback });
    return { t, model, processor };
  });
}

async function maskOf(m, rgb, w, h) {
  const image = new m.t.RawImage(rgb, w, h, 3);
  const { pixel_values } = await m.processor(image);
  const { output } = await m.model({ input: pixel_values });
  const mask = await m.t.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(w, h);
  return Buffer.from(mask.data.buffer, mask.data.byteOffset, mask.data.byteLength);
}

async function removeBackground({ file, isImage, start = 0, span = 0, width, height }, { cacheDir, out, fps = 30, onProgress, isCancelled }) {
  onProgress({ phase: 'model', progress: 0 });
  const m = await loadModnet(cacheDir, onProgress);
  const k = MASK_SHORT / Math.min(width, height);
  const mw = 2 * Math.round((width * Math.min(1, k)) / 2);
  const mh = 2 * Math.round((height * Math.min(1, k)) / 2);
  const frameBytes = mw * mh * 3;

  if (isImage) {
    const rgb = await new Promise((resolve, reject) =>
      execFile(ffmpegPath, ['-v', 'error', '-i', file, '-vf', `scale=${mw}:${mh},format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 1 << 28, windowsHide: true }, (err, stdout, stderr) =>
        err ? reject(new Error(String(stderr).trim())) : resolve(stdout),
      ),
    );
    const mask = await maskOf(m, new Uint8ClampedArray(rgb.buffer, rgb.byteOffset, frameBytes), mw, mh);
    const maskFile = `${out}.mask.raw`;
    await fs.promises.writeFile(maskFile, mask);
    try {
      await ffmpeg([
        '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${mw}x${mh}`, '-i', maskFile,
        '-filter_complex', '[1:v][0:v]scale2ref[mk][im];[im][mk]alphamerge,format=rgba[o]', '-map', '[o]', '-frames:v', '1', out,
      ]);
    } finally {
      fs.promises.unlink(maskFile).catch(() => {});
    }
    return out;
  }

  const total = Math.max(1, Math.round(span * fps));
  // Reader: small RGB frames for the model.
  const reader = spawn(ffmpegPath, ['-v', 'error', '-ss', start.toFixed(3), '-t', span.toFixed(3), '-i', file,
    '-vf', `fps=${fps},scale=${mw}:${mh},format=rgb24`, '-f', 'rawvideo', '-'], { windowsHide: true });
  // Writer: the original picture with the masks as its alpha channel, plus the original sound.
  const writer = spawn(ffmpegPath, ['-y', '-v', 'error',
    '-ss', start.toFixed(3), '-t', span.toFixed(3), '-i', file,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${mw}x${mh}`, '-r', String(fps), '-i', '-',
    '-filter_complex', `[0:v]fps=${fps},format=yuva420p[v];[1:v][v]scale2ref[mk][v2];[v2][mk]alphamerge,format=yuva420p[o]`,
    '-map', '[o]', '-map', '0:a?', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '30', '-b:v', '0',
    '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-auto-alt-ref', '0', '-c:a', 'libopus', '-b:a', '160k', out], { windowsHide: true });
  let writerErr = '';
  writer.stderr.on('data', (d) => (writerErr += d));
  const writerDone = new Promise((resolve, reject) => writer.on('close', (code) => (code === 0 ? resolve() : reject(new Error(writerErr.trim().split('\n').pop() || `ffmpeg ${code}`)))));
  writerDone.catch(() => {});

  let pending = Buffer.alloc(0);
  let done = 0;
  try {
    for await (const chunk of reader.stdout) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameBytes) {
        if (isCancelled()) throw cancelledError();
        const frame = pending.subarray(0, frameBytes);
        pending = pending.subarray(frameBytes);
        const mask = await maskOf(m, new Uint8ClampedArray(frame.buffer, frame.byteOffset, frameBytes), mw, mh);
        if (!writer.stdin.write(mask)) await new Promise((r) => writer.stdin.once('drain', r));
        done += 1;
        if (done % 3 === 0) onProgress({ phase: 'work', progress: Math.min(1, done / total) });
      }
    }
    writer.stdin.end();
    await writerDone;
  } catch (err) {
    reader.kill();
    writer.kill();
    throw err;
  }
  return out;
}

// ── Silences ──────────────────────────────────────────────────────────────────────────────────
// Silero VAD gives, every 32 ms, the probability that someone is speaking. The parts kept are the
// speech, slightly widened; silences shorter than `minSilence` stay (natural pauses).
const VAD_URL = 'https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx';
const VAD_RATE = 16000;
const VAD_WINDOW = 512;

async function loadVad(cacheDir, onProgress, download) {
  return once('vad', async () => {
    const file = path.join(cacheDir, 'silero-vad', 'model.onnx');
    if (!fs.existsSync(file)) {
      onProgress({ phase: 'model', progress: 0 });
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await download(VAD_URL, file);
    }
    const ort = require('onnxruntime-node');
    return { ort, session: await ort.InferenceSession.create(file) };
  });
}

function extractAudio(file, start, span) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-v', 'error', '-ss', start.toFixed(3), '-t', span.toFixed(3), '-i', file, '-vn', '-ac', '1', '-ar', String(VAD_RATE), '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 1 << 30, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(String(stderr).trim().split('\n').pop() || err.message));
        resolve(new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength)));
      });
  });
}

async function findSpeech({ file, start, span, minSilence = 0.5, pad = 0.12, threshold = 0.5 }, { cacheDir, onProgress, isCancelled, download }) {
  const { ort, session } = await loadVad(cacheDir, onProgress, download);
  onProgress({ phase: 'work', progress: 0 });
  const audio = await extractAudio(file, start, span);
  let state = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128]);
  const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(VAD_RATE)]), []);
  const probs = [];
  const steps = Math.floor(audio.length / VAD_WINDOW);
  for (let i = 0; i < steps; i++) {
    if (i % 200 === 0) {
      if (isCancelled()) throw cancelledError();
      onProgress({ phase: 'work', progress: i / Math.max(1, steps) });
    }
    const input = new ort.Tensor('float32', audio.subarray(i * VAD_WINDOW, (i + 1) * VAD_WINDOW), [1, VAD_WINDOW]);
    const r = await session.run({ input, state, sr });
    probs.push(r.output.data[0]);
    state = r.stateN;
  }
  const step = VAD_WINDOW / VAD_RATE;
  // Speech runs, then widened and merged across short pauses.
  const runs = [];
  probs.forEach((p, i) => {
    if (p < threshold) return;
    const t = i * step;
    const last = runs[runs.length - 1];
    if (last && t - last[1] < minSilence) last[1] = t + step;
    else runs.push([t, t + step]);
  });
  const keep = [];
  for (const [a, b] of runs) {
    const x = Math.max(0, a - pad);
    const y = Math.min(span, b + pad);
    const last = keep[keep.length - 1];
    if (last && x <= last[1]) last[1] = Math.max(last[1], y);
    else keep.push([x, y]);
  }
  return keep.filter(([a, b]) => b - a > 0.15);
}

// ── Translation ───────────────────────────────────────────────────────────────────────────────
// Language pairs with a direct model; the others go through English (e.g. arabe → anglais → français).
const DIRECT = new Set(['fr-en', 'en-fr', 'fr-es', 'es-fr', 'fr-de', 'de-fr', 'en-es', 'es-en', 'en-de', 'de-en', 'it-fr', 'en-it', 'it-en', 'en-ar', 'ar-en']);
const TRANSLATE_LANGS = ['fr', 'en', 'es', 'de', 'it', 'ar'];

function translationPlan(from, to) {
  if (from === to) return [];
  if (DIRECT.has(`${from}-${to}`)) return [`${from}-${to}`];
  if (DIRECT.has(`${from}-en`) && DIRECT.has(`en-${to}`)) return [`${from}-en`, `en-${to}`];
  return null;
}

async function translateTexts({ texts, from, to }, { cacheDir, onProgress, isCancelled }) {
  const plan = translationPlan(from, to);
  if (!plan) throw new Error('Cette paire de langues n’est pas disponible.');
  let current = texts.map((s) => String(s || '').slice(0, 500));
  for (const [n, pair] of plan.entries()) {
    const t = await lib(cacheDir);
    onProgress({ phase: 'model', progress: 0 });
    const translate = await once(`mt-${pair}`, () => t.pipeline('translation', `Xenova/opus-mt-${pair}`, { dtype: 'q8', progress_callback: progressOf(onProgress) }));
    const outText = [];
    for (const [i, s] of current.entries()) {
      if (isCancelled()) throw cancelledError();
      onProgress({ phase: 'work', progress: (n + i / current.length) / plan.length });
      outText.push(s.trim() ? (await translate(s))[0]?.translation_text || s : s);
    }
    current = outText;
  }
  return current;
}

// ── Text to speech ────────────────────────────────────────────────────────────────────────────
const TTS_LANGS = { fr: 'fra', en: 'eng', es: 'spa', de: 'deu', pt: 'por' };

async function speak({ text, lang = 'fr', rate = 1 }, { cacheDir, out, onProgress }) {
  const code = TTS_LANGS[lang];
  if (!code) throw new Error('Langue non disponible pour la voix.');
  const words = String(text || '').trim().slice(0, 1000);
  if (!words) throw new Error('Le texte est vide.');
  const t = await lib(cacheDir);
  onProgress({ phase: 'model', progress: 0 });
  const tts = await once(`tts-${code}`, () => t.pipeline('text-to-speech', `Xenova/mms-tts-${code}`, { dtype: 'q8', progress_callback: progressOf(onProgress) }));
  onProgress({ phase: 'work', progress: 0.5 });
  const { audio, sampling_rate } = await tts(words);
  const wav = `${out}.wav`;
  await fs.promises.writeFile(wav, wav16(audio, sampling_rate));
  try {
    const speed = Math.min(2, Math.max(0.5, Number(rate) || 1));
    await ffmpeg(['-i', wav, ...(Math.abs(speed - 1) > 0.01 ? ['-af', `atempo=${speed.toFixed(3)}`] : []), '-c:a', 'aac', '-b:a', '160k', out]);
  } finally {
    fs.promises.unlink(wav).catch(() => {});
  }
  return out;
}

module.exports = { removeBackground, findSpeech, translateTexts, speak, TRANSLATE_LANGS, TTS_LANGS, translationPlan };
