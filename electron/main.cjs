const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { ffmpegPath, probe, computePeaks, monoFiles, buildExportArgs, planChunks, gpuJobs, ALL_EXT, VIDEO_EXT, IMAGE_EXT, AUDIO_EXT, MIME, ext } = require('./media.cjs');
const { once } = require('events');
const { sanitize, resolveMediaPath, toFileContent, writeAtomic } = require('./project.cjs');
const { transcribe, MODELS, LANGUAGES } = require('./transcribe.cjs');
const { cubeToLut } = require('./cube.cjs');
const { searchMusic, downloadMusic, generateMusic, musicPage, downloadTo } = require('./music.cjs');
const ai = require('./ai.cjs');
const { scanLibrary, isListed } = require('./library.cjs');
const { createControl } = require('./control.cjs');

// Lets a test instance run with its own data folder, so it never touches the user's autosave.
if (process.env.CUPKATA_USER_DATA) app.setPath('userData', process.env.CUPKATA_USER_DATA);

// An unexpected error in a background task (network, files…) is written to crash.log instead of
// stopping everything behind an error box; the feature that failed reports its own message.
process.on('uncaughtException', (err) => {
  const line = `${new Date().toISOString()} main: ${err?.stack || err}\n`;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch {
    console.error(line);
  }
});

const SCHEME = 'cupkata-media';
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

const thumbDir = path.join(os.tmpdir(), 'cupkata-thumbs');
fs.mkdirSync(thumbDir, { recursive: true });

// Only files the user picked (and their thumbnails) can be served or exported.
const allowed = new Set();
const isAllowed = (p) => allowed.has(p);

async function serveFile(request) {
  const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1));
  if (!isAllowed(filePath)) return new Response('Forbidden', { status: 403 });
  let size;
  try {
    size = (await fs.promises.stat(filePath)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  // CORS lets the preview route media through Web Audio (needed for volume above 100 %).
  const headers = {
    'Content-Type': MIME[ext(filePath)] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  };
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!range) {
    return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
      status: 200,
      headers: { ...headers, 'Content-Length': String(size) },
    });
  }
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let last = range[1] && range[2] ? Number(range[2]) : size - 1;
  start = Math.max(0, start);
  last = Math.min(last, size - 1);
  if (start > last) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end: last })), {
    status: 206,
    headers: { ...headers, 'Content-Length': String(last - start + 1), 'Content-Range': `bytes ${start}-${last}/${size}` },
  });
}

async function probeAll(paths) {
  const results = [];
  for (const p of paths) {
    try {
      results.push(await probeOne(p));
    } catch (err) {
      results.push({ path: p, name: path.basename(p), error: err.message });
    }
  }
  return results;
}

async function probeOne(p) {
  const item = await probe(p, thumbDir);
  allowed.add(item.path);
  if (item.thumb) allowed.add(item.thumb);
  return item;
}

async function loadProject(raw, baseDir) {
  const project = sanitize(raw);
  const media = [];
  for (const m of project.media) {
    const found = resolveMediaPath(m, baseDir);
    let item = null;
    if (found) {
      try {
        item = { ...(await probeOne(found)), id: m.id };
      } catch {
        item = null;
      }
    }
    media.push(item || { ...m, thumb: null, missing: true });
  }
  return { ...project, media };
}

const stripBom = (text) => text.replace(/^﻿/, '');
const PROJECT_FILTER =[{ name: 'Projet Cupkata', extensions: ['cupkata'] }];
const autosavePath = () => path.join(app.getPath('userData'), 'autosave.json');
const dirtyWindows = new Set();

let exportProc = null;

ipcMain.handle('project:save', async (event, data, filePath) => {
  let target = filePath;
  if (!target) {
    const res = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Enregistrer le projet',
      defaultPath: path.join(app.getPath('documents'), 'Mon projet.cupkata'),
      filters: PROJECT_FILTER,
    });
    if (res.canceled) return null;
    target = res.filePath;
  }
  await writeAtomic(target, toFileContent(data, target));
  return target;
});

ipcMain.handle('project:open', async (event) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Ouvrir un projet',
    properties: ['openFile'],
    filters: PROJECT_FILTER,
  });
  if (res.canceled) return null;
  return readProjectFile(res.filePaths[0]);
});

async function readProjectFile(filePath) {
  let raw;
  try {
    raw = JSON.parse(stripBom(await fs.promises.readFile(filePath, 'utf8')));
  } catch {
    throw new Error("Ce fichier n'est pas un projet Cupkata valide");
  }
  return { ...(await loadProject(raw, path.dirname(filePath))), filePath };
}

ipcMain.handle('project:autosave', async (_e, payload) => {
  const content = JSON.stringify({
    filePath: typeof payload?.filePath === 'string' ? payload.filePath : null,
    savedAt: Date.now(),
    project: JSON.parse(toFileContent(payload?.project || {}, payload?.filePath || null)),
  });
  await writeAtomic(autosavePath(), content);
});

ipcMain.handle('project:recover', async () => {
  let saved;
  try {
    saved = JSON.parse(stripBom(await fs.promises.readFile(autosavePath(), 'utf8')));
  } catch {
    return null;
  }
  try {
    const baseDir = saved.filePath ? path.dirname(saved.filePath) : null;
    return { ...(await loadProject(saved.project, baseDir)), filePath: saved.filePath || null, savedAt: saved.savedAt };
  } catch {
    return null;
  }
});

ipcMain.handle('project:dirty', (event, dirty) => {
  const id = event.sender.id;
  if (dirty) dirtyWindows.add(id);
  else dirtyWindows.delete(id);
});

ipcMain.handle('dialog:confirm', async (event, message) => {
  const res = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
    type: 'warning',
    buttons: ['Continuer', 'Annuler'],
    defaultId: 1,
    cancelId: 1,
    message: String(message),
  });
  return res.response === 0;
});

ipcMain.handle('filters:import', async (event) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Importer un filtre de couleur',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Filtre LUT 3D', extensions: ['cube'] }],
  });
  if (res.canceled) return [];
  const out = [];
  for (const file of res.filePaths.slice(0, 20)) {
    try {
      const lut = cubeToLut(await fs.promises.readFile(file, 'utf8'));
      out.push({ id: `custom:${crypto.randomUUID()}`, name: path.basename(file, path.extname(file)).slice(0, 60), ...lut });
    } catch (err) {
      out.push({ name: path.basename(file), error: err.message });
    }
  }
  return out;
});

ipcMain.handle('media:relink', async (event) => {
  const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Retrouver le fichier',
    properties: ['openFile'],
    filters: [{ name: 'Médias', extensions: ALL_EXT }],
  });
  return res.canceled ? null : probeOne(res.filePaths[0]);
});

ipcMain.handle('media:import', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title: 'Importer des médias',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Médias', extensions: ALL_EXT },
      { name: 'Vidéos', extensions: VIDEO_EXT },
      { name: 'Photos', extensions: IMAGE_EXT },
      { name: 'Audio', extensions: AUDIO_EXT },
    ],
  });
  return res.canceled ? [] : probeAll(res.filePaths);
});

const peaksCache = new Map();
ipcMain.handle('media:peaks', (_e, filePath) => {
  if (!isAllowed(filePath)) throw new Error('Média introuvable');
  if (!peaksCache.has(filePath)) {
    const job = computePeaks(filePath, thumbDir);
    peaksCache.set(filePath, job);
    job.catch(() => peaksCache.delete(filePath));
  }
  return peaksCache.get(filePath);
});

ipcMain.handle('media:probe',(_e, paths) => probeAll((paths || []).filter((p) => typeof p === 'string' && p)));

// Files Cupkata makes itself (voice-overs, frozen frames, reversed clips) go in Documents\Cupkata\<folder>,
// or in the test data folder for test instances.
const madeDir = async (folder) => {
  const dir = process.env.CUPKATA_USER_DATA
    ? path.join(app.getPath('userData'), folder)
    : path.join(app.getPath('documents'), 'Cupkata', folder);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
};
const stampName = (prefix, ext) => `${prefix} ${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')}.${ext}`;

function ffmpegTool(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-y', '-v', 'error', ...args], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').slice(-3).join('\n') || `ffmpeg a échoué (${code})`))));
  });
}

// Snapshot of the preview: the picture shown, saved as a PNG and imported like a photo.
ipcMain.handle('snapshot:save', async (_e, bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || bytes.length > 50 * 1024 * 1024) throw new Error('Capture invalide');
  if (Buffer.from(bytes.subarray(0, 8)).toString('hex') !== '89504e470d0a1a0a') throw new Error('Capture invalide');
  const out = path.join(await madeDir('Captures'), stampName('Capture', 'png'));
  await fs.promises.writeFile(out, bytes);
  return probeOne(out);
});

// Freeze frame: the source frame at `time`, saved as a PNG and imported like a photo.
ipcMain.handle('media:freeze', async (_e, filePath, time) => {
  if (!isAllowed(filePath) || !Number.isFinite(time) || time < 0) throw new Error('Média introuvable');
  const out = path.join(await madeDir('Images figées'), stampName('Image figée', 'png'));
  await ffmpegTool(['-ss', String(time), '-i', filePath, '-frames:v', '1', '-update', '1', out]);
  return probeOne(out);
});

// Reverse: the part [start, start + span] of a video, played backwards (sound too). FFmpeg's reverse
// keeps every frame in memory, so the part is reversed in short pieces that are then joined last-first.
const REVERSE_PIECE = 4;
ipcMain.handle('media:reverse', async (_e, filePath, start, span) => {
  if (!isAllowed(filePath) || ![start, span].every(Number.isFinite) || start < 0 || span <= 0) throw new Error('Média introuvable');
  const info = await probe(filePath, thumbDir);
  const work = path.join(os.tmpdir(), `cupkata-reverse-${crypto.randomUUID()}`);
  await fs.promises.mkdir(work, { recursive: true });
  try {
    const pieces = [];
    for (let i = 0; i * REVERSE_PIECE < span - 1e-3; i++) {
      const from = start + i * REVERSE_PIECE;
      const len = Math.min(REVERSE_PIECE, start + span - from);
      const piece = path.join(work, `p${String(i).padStart(4, '0')}.mp4`);
      await ffmpegTool([
        '-ss', from.toFixed(3), '-t', len.toFixed(3), '-i', filePath,
        '-vf', 'reverse', ...(info.hasAudio ? ['-af', 'areverse', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : ['-an']),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', piece,
      ]);
      pieces.push(piece);
    }
    const list = path.join(work, 'list.txt');
    await fs.promises.writeFile(list, pieces.reverse().map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
    const out = path.join(await madeDir('Clips inversés'), stampName(`${path.parse(filePath).name} inversé`, 'mp4'));
    await ffmpegTool(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
    return probeOne(out);
  } finally {
    fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  }
});

// iTunes / Apple Music purchases downloaded on this PC (and any other folder the user picks).
ipcMain.handle('library:scan', async (event, pick) => {
  let extra = null;
  if (pick) {
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choisir un dossier de musique',
      properties: ['openDirectory'],
    });
    if (res.canceled) return null;
    extra = res.filePaths[0];
  }
  return scanLibrary(extra);
});
// Imports (probes) tracks found by the last scan; protected .m4p files are refused.
ipcMain.handle('library:import', (_e, paths) => probeAll((Array.isArray(paths) ? paths : []).filter(isListed).slice(0, 200)));

// Open-source AI tools (electron/ai.cjs): one task at a time, with progress and a stop button.
let aiJob = null;
async function runAi(event, work) {
  if (aiJob) throw new Error('Une tâche IA est déjà en cours');
  const job = { cancelled: false };
  aiJob = job;
  try {
    return await work({
      cacheDir: path.join(app.getPath('userData'), 'models'),
      onProgress: (p) => !event.sender.isDestroyed() && event.sender.send('ai:progress', p),
      isCancelled: () => job.cancelled,
      download: downloadTo,
    });
  } finally {
    aiJob = null;
  }
}
ipcMain.handle('ai:cancel', () => {
  if (aiJob) aiJob.cancelled = true;
});
const span = (v, max = 3600) => Math.min(max, Math.max(0, Number(v) || 0));

ipcMain.handle('ai:cutout', (event, r) =>
  runAi(event, async (ctx) => {
    if (!isAllowed(r?.path)) throw new Error('Média introuvable');
    const isImage = !!r.isImage;
    const out = path.join(await madeDir('Détourages'), stampName(`${path.parse(r.path).name} détouré`, isImage ? 'png' : 'webm'));
    await ai.removeBackground(
      { file: r.path, isImage, start: span(r.start), span: Math.max(0.1, span(r.span, 600)), width: Number(r.width) || 1280, height: Number(r.height) || 720 },
      { ...ctx, out },
    );
    return probeOne(out);
  }),
);

ipcMain.handle('ai:silences', (event, r) =>
  runAi(event, (ctx) => {
    if (!isAllowed(r?.path)) throw new Error('Média introuvable');
    return ai.findSpeech({ file: r.path, start: span(r.start), span: Math.max(0.1, span(r.span)), minSilence: Math.min(3, Math.max(0.2, Number(r.minSilence) || 0.5)) }, ctx);
  }),
);

ipcMain.handle('ai:translate', (event, r) =>
  runAi(event, (ctx) => {
    if (!ai.TRANSLATE_LANGS.includes(r?.from) || !ai.TRANSLATE_LANGS.includes(r?.to)) throw new Error('Langue non disponible');
    const texts = Array.isArray(r.texts) ? r.texts.slice(0, 2000).map((t) => String(t ?? '')) : [];
    return ai.translateTexts({ texts, from: r.from, to: r.to }, ctx);
  }),
);

ipcMain.handle('ai:speak', (event, r) =>
  runAi(event, async (ctx) => {
    const name = String(r?.text || 'voix').replace(/[^\p{L}\p{N} ,.!?'-]/gu, ' ').trim().slice(0, 30) || 'voix';
    const out = path.join(await madeDir('Voix IA'), stampName(`Voix - ${name}`, 'm4a'));
    await ai.speak({ text: r?.text, lang: r?.lang, rate: r?.rate }, { ...ctx, out });
    return probeOne(out);
  }),
);

// Free music search / download, and AI music made on this computer.
ipcMain.handle('music:search', (_e, request) => searchMusic(request || {}));

ipcMain.handle('music:download', async (_e, id) => {
  const { file, credit, needsCredit } = await downloadMusic(String(id), await madeDir('Musiques'), fs, path);
  return { item: await probeOne(file), credit, needsCredit };
});

// Opens in the browser the page of a track found by a search (never any other address).
ipcMain.handle('music:page', (_e, id) => {
  const page = musicPage(String(id));
  if (page && /^https?:\/\//.test(page)) shell.openExternal(page);
});

let musicJob = null;
ipcMain.handle('music:generate', async (event, request) => {
  if (musicJob) throw new Error('Une musique est déjà en cours de création');
  const job = { cancelled: false };
  musicJob = job;
  try {
    const wav = await generateMusic(request || {}, {
      cacheDir: path.join(app.getPath('userData'), 'models'),
      onProgress: (p) => !event.sender.isDestroyed() && event.sender.send('music:progress', p),
      isCancelled: () => job.cancelled,
    });
    const name = String(request?.prompt || 'musique').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 40) || 'musique';
    const out = path.join(await madeDir('Musiques IA'), stampName(`IA - ${name}`, 'wav'));
    await fs.promises.writeFile(out, wav);
    return probeOne(out);
  } finally {
    musicJob = null;
  }
});
ipcMain.handle('music:cancel', () => {
  if (musicJob) musicJob.cancelled = true;
});

// Voice-over: the microphone recording (WebM/Opus from the page) is kept as an M4A file in
// Documents\Cupkata\Voix off (the test data folder for test instances), then imported like any media.
const voiceDir = () =>
  process.env.CUPKATA_USER_DATA
    ? path.join(app.getPath('userData'), 'Voix off')
    : path.join(app.getPath('documents'), 'Cupkata', 'Voix off');

ipcMain.handle('voice:save', async (_e, bytes) => {
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("L'enregistrement est vide.");
  const dir = voiceDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
  const raw = path.join(os.tmpdir(), `cupkata-voice-${crypto.randomUUID()}.webm`);
  const out = path.join(dir, `Voix off ${stamp}.m4a`);
  await fs.promises.writeFile(raw, bytes);
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, ['-y', '-v', 'error', '-i', raw, '-vn', '-c:a', 'aac', '-b:a', '192k', out], { windowsHide: true });
      let err = '';
      p.stderr.on('data', (d) => (err += d));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg a échoué (${code})`))));
    });
  } finally {
    fs.promises.unlink(raw).catch(() => {});
  }
  return probeOne(out);
});

ipcMain.handle('export:choose', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showSaveDialog(win, {
    title: 'Exporter la vidéo',
    defaultPath: path.join(app.getPath('videos'), 'cupkata-export.mp4'),
    filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }],
  });
  return res.canceled ? null : res.filePath;
});

const PNG_PREFIX = 'data:image/png;base64,';
const MAX_OVERLAY_BYTES = 30 * 1024 * 1024;

// Text overlays arrive as PNG data URLs drawn by the renderer; validate them before they touch disk.
// Returns the written stills keyed by their position in the list, so draw order is preserved.
async function writeOverlays(overlays) {
  const byIndex = new Map();
  const list = Array.isArray(overlays) ? overlays : [];
  if (!list.some(Boolean)) return { dir: null, byIndex };
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cupkata-text-'));
  for (const [i, o] of list.entries()) {
    if (typeof o?.png !== 'string' || !o.png.startsWith(PNG_PREFIX) || o.png.length > MAX_OVERLAY_BYTES) continue;
    if (!Number.isFinite(o.start) || !(o.duration > 0)) continue;
    const file = path.join(dir, `still-${i}.png`);
    await fs.promises.writeFile(file, Buffer.from(o.png.slice(PNG_PREFIX.length), 'base64'));
    byIndex.set(i, { path: file, start: Math.max(0, o.start), duration: o.duration });
  }
  return { dir, byIndex };
}

// Animated effect overlays are rendered by the renderer frame by frame into a per-export folder.
const frameJobs = new Map();
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_FRAME_BYTES = 20 * 1024 * 1024;

ipcMain.handle('export:prepare', async () => {
  const token = crypto.randomBytes(12).toString('hex');
  frameJobs.set(token, await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cupkata-fx-')));
  return token;
});

ipcMain.handle('export:frame', async (_e, token, seq, frame, data) => {
  const dir = frameJobs.get(token);
  if (!dir) throw new Error('Export inconnu');
  if (!Number.isInteger(seq) || seq < 0 || seq > 999 || !Number.isInteger(frame) || frame < 0 || frame > 200000) {
    throw new Error('Image d\'effet invalide');
  }
  const bytes = Buffer.from(data instanceof Uint8Array ? data : []);
  if (bytes.length > MAX_FRAME_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Image d\'effet invalide');
  await fs.promises.writeFile(path.join(dir, `fx${seq}-${String(frame).padStart(5, '0')}.png`), bytes);
});

// GPU pre-render: per segment, FFmpeg decodes exact RGBA frames, the renderer runs the shader,
// and a second FFmpeg re-encodes them into a high-quality intermediate file in the export folder.
const gpuState = new Map();
const prerenderedByToken = new Map();

function serveFrames(job) {
  while (job.waiters.length && (job.buffered >= job.frameSize || job.ended)) {
    const resolve = job.waiters.shift();
    if (job.buffered < job.frameSize) {
      resolve(null);
      continue;
    }
    const all = job.chunks.length === 1 ? job.chunks[0] : Buffer.concat(job.chunks);
    const frame = Buffer.from(all.subarray(0, job.frameSize));
    const rest = all.subarray(job.frameSize);
    job.chunks = rest.length ? [rest] : [];
    job.buffered -= job.frameSize;
    resolve(frame);
  }
  if (job.buffered < 2 * job.frameSize && job.decoder?.stdout.isPaused()) job.decoder.stdout.resume();
}

function stopGpuJob(job) {
  job.decoder?.kill();
  if (job.encoder && job.encoder.exitCode === null) job.encoder.kill();
}

ipcMain.handle('gpu:plan', (_e, project, token) => {
  const dir = frameJobs.get(token);
  if (!dir) throw new Error('Export inconnu');
  if (!prerenderedByToken.has(token)) prerenderedByToken.set(token, new Map());
  return gpuJobs(withLuts(project, token), isAllowed).map((j) => {
    const jobId = crypto.randomBytes(8).toString('hex');
    gpuState.set(jobId, { ...j, token, out: path.join(dir, `gpu-${j.k}.mkv`), frameSize: j.width * j.height * 4 });
    return { jobId, frames: j.frames, width: j.width, height: j.height, fps: j.fps, tau0: j.tau0, effect: j.effect };
  });
});

ipcMain.handle('gpu:start', (_e, jobId) => {
  const job = gpuState.get(jobId);
  if (!job || job.decoder) throw new Error('Traitement GPU inconnu');
  Object.assign(job, { chunks: [], buffered: 0, waiters: [], ended: false, errors: '' });
  job.decoder = spawn(
    ffmpegPath,
    ['-v', 'error', ...job.inputArgs, '-filter_complex', `[0:v]${job.chain}[o]`, '-map', '[o]', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { windowsHide: true },
  );
  job.encoder = spawn(
    ffmpegPath,
    ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${job.width}x${job.height}`, '-r', String(job.fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p', job.out],
    { windowsHide: true },
  );
  job.decoder.stdout.on('data', (chunk) => {
    job.chunks.push(chunk);
    job.buffered += chunk.length;
    if (job.buffered > 3 * job.frameSize) job.decoder.stdout.pause();
    serveFrames(job);
  });
  job.decoder.stdout.on('end', () => {
    job.ended = true;
    serveFrames(job);
  });
  for (const p of [job.decoder, job.encoder]) p.stderr.on('data', (d) => (job.errors = (job.errors + d).slice(-3000)));
  job.encoder.stdin.on('error', () => {});
});

ipcMain.handle('gpu:read', (_e, jobId) => {
  const job = gpuState.get(jobId);
  if (!job?.decoder) throw new Error('Traitement GPU inconnu');
  return new Promise((resolve) => {
    job.waiters.push(resolve);
    serveFrames(job);
  });
});

ipcMain.handle('gpu:write', async (_e, jobId, data) => {
  const job = gpuState.get(jobId);
  if (!job?.encoder) throw new Error('Traitement GPU inconnu');
  if (!(data instanceof Uint8Array) || data.byteLength !== job.frameSize) throw new Error('Image GPU invalide');
  if (!job.encoder.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) await once(job.encoder.stdin, 'drain');
});

ipcMain.handle('gpu:finish', async (_e, jobId) => {
  const job = gpuState.get(jobId);
  if (!job?.encoder) throw new Error('Traitement GPU inconnu');
  gpuState.delete(jobId);
  job.decoder.kill();
  job.encoder.stdin.end();
  const [code] = job.encoder.exitCode === null ? await once(job.encoder, 'close') : [job.encoder.exitCode];
  if (code !== 0) throw new Error('Le rendu GPU a échoué :\n' + job.errors.trim().split('\n').slice(-4).join('\n'));
  if (job.kind === 'fx') fxRangesByToken.get(job.token)?.push({ path: job.out, start: job.start, duration: job.frames / job.fps });
  else prerenderedByToken.get(job.token)?.set(job.k, job.out);
});

// Colour filters used by the project arrive as 3D tables and are written as .cube files for lut3d.
const lutFilesByToken = new Map();
const LUT_ID = /^(custom:)?[\w-]{1,80}$/;

ipcMain.handle('export:luts', async (_e, token, luts) => {
  const dir = frameJobs.get(token);
  if (!dir) throw new Error('Export inconnu');
  const files = {};
  const entries = Object.entries(luts && typeof luts === 'object' ? luts : {}).slice(0, 200);
  for (const [i, [id, lut]] of entries.entries()) {
    const size = lut?.size;
    const data = lut?.data;
    if (!LUT_ID.test(id) || !Number.isInteger(size) || size < 2 || size > 65) continue;
    if (!(data instanceof Float32Array || Array.isArray(data)) || data.length !== size ** 3 * 3) continue;
    const lines = [`LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
    for (let j = 0; j < data.length; j += 3) {
      const rgb = [data[j], data[j + 1], data[j + 2]].map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0));
      lines.push(rgb.map((v) => v.toFixed(6)).join(' '));
    }
    const file = path.join(dir, `lut-${i}.cube`);
    await fs.promises.writeFile(file, lines.join('\n') + '\n');
    files[id] = file;
  }
  lutFilesByToken.set(token, files);
  return Object.keys(files).length;
});

const withLuts = (project, token) => ({ ...project, lutFiles: lutFilesByToken.get(token) || {} });

// Effect-track pipeline: a picture-only "base" render, then each effect-track range is decoded from it,
// processed in the renderer (same code as the preview) and laid back on top in the final pass.
const baseByToken = new Map();
const fxRangesByToken = new Map();

ipcMain.handle('export:base', async (event, project, token) => {
  const dir = frameJobs.get(token);
  if (!dir) throw new Error('Export inconnu');
  if (exportProc) throw new Error('Un export est déjà en cours');
  const base = path.join(dir, 'base.mkv');
  const { overlays, cleanup } = await resolveOverlays(project?.overlays, token);
  try {
    const full = { ...withLuts(project, token), overlays };
    const chunks = await renderChunks(event, full, token);
    await runFfmpeg(event, full, base, prerenderedByToken.get(token), { videoOnly: true, chunks, progress: chunks ? [CHUNKS_SHARE, 1] : [0, 1] });
  } finally {
    cleanup();
  }
  baseByToken.set(token, base);
  fxRangesByToken.set(token, []);
});

ipcMain.handle('fx:plan', (_e, token, items, format) => {
  const dir = frameJobs.get(token);
  const base = baseByToken.get(token);
  if (!dir || !base) throw new Error('Export inconnu');
  const { width, height, fps } = format || {};
  if (![width, height, fps].every((v) => Number.isInteger(v) && v > 0 && v <= 8192)) throw new Error('Format invalide');
  return (Array.isArray(items) ? items.slice(0, 500) : []).flatMap((it, i) => {
    if (!Number.isFinite(it?.start) || !(it.duration > 0)) return [];
    const first = Math.max(0, Math.round(it.start * fps));
    const frames = Math.round((it.start + it.duration) * fps) - first;
    if (frames < 1) return [];
    const jobId = crypto.randomBytes(8).toString('hex');
    gpuState.set(jobId, {
      kind: 'fx', token, width, height, fps, frames, start: first / fps,
      frameSize: width * height * 4,
      inputArgs: ['-ss', (first / fps).toFixed(3), '-i', base],
      chain: `trim=end_frame=${frames},format=rgba`,
      out: path.join(dir, `fxitem-${i}.mkv`),
    });
    return [{ jobId, index: i, frames, start: first / fps, width, height, fps }];
  });
});

function discardJob(token) {
  const dir = frameJobs.get(token);
  frameJobs.delete(token);
  prerenderedByToken.delete(token);
  baseByToken.delete(token);
  fxRangesByToken.delete(token);
  lutFilesByToken.delete(token);
  for (const [id, job] of gpuState) {
    if (job.token !== token) continue;
    stopGpuJob(job);
    gpuState.delete(id);
  }
  if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
}

ipcMain.handle('export:discard', (_e, token) => discardJob(token));

function resolveSequences(overlays, token) {
  const dir = frameJobs.get(token);
  return (Array.isArray(overlays) ? overlays : []).map((o) => {
    if (o?.sequence === undefined) return o;
    const seq = o.sequence;
    if (!dir || !Number.isInteger(seq) || !Number.isFinite(o.start) || !(o.duration > 0)) return null;
    if (!fs.existsSync(path.join(dir, `fx${seq}-00000.png`))) return null;
    return { pattern: path.join(dir, `fx${seq}-%05d.png`), start: Math.max(0, o.start), duration: o.duration };
  });
}

async function resolveOverlays(list, token) {
  const ordered = resolveSequences(list, token);
  const stills = await writeOverlays(ordered.map((o) => (o && !o.pattern ? o : null)));
  const overlays = ordered.map((o, i) => (o?.pattern ? o : stills.byIndex.get(i))).filter(Boolean);
  return { overlays, cleanup: () => stills.dir && fs.rm(stills.dir, { recursive: true, force: true }, () => {}) };
}

ipcMain.handle('export:run', async (event, project, outPath, token) => {
  if (exportProc) throw new Error('Un export est déjà en cours');
  const { overlays, cleanup } = await resolveOverlays(project?.overlays, token);
  const base = baseByToken.get(token);
  const opts = base ? { baseVideo: base, fxRanges: fxRangesByToken.get(token) || [] } : {};
  try {
    const full = { ...withLuts(project, token), overlays };
    const chunks = await renderChunks(event, full, token);
    return await runFfmpeg(event, full, outPath, prerenderedByToken.get(token), { ...opts, chunks, progress: chunks && !base ? [CHUNKS_SHARE, 1] : [0, 1] });
  } finally {
    cleanup();
    chunksByToken.delete(token);
    discardJob(token);
  }
});

// Long main tracks: their blocks are rendered first, once per export (see planChunks).
const CHUNKS_SHARE = 0.7;
const chunksByToken = new Map();
async function renderChunks(event, project, token) {
  if (chunksByToken.has(token)) return chunksByToken.get(token);
  const dir = frameJobs.get(token);
  const plan = dir ? planChunks(project, isAllowed) : null;
  const done = [];
  for (const [i, ch] of (plan || []).entries()) {
    const file = path.join(dir, `block${i}.mkv`);
    const share = CHUNKS_SHARE / plan.length;
    await runFfmpeg(event, project, file, prerenderedByToken.get(token), { range: ch, progress: [i * share, (i + 1) * share] });
    done.push({ ...ch, path: file });
  }
  const chunks = plan ? done : null;
  chunksByToken.set(token, chunks);
  return chunks;
}

const runFfmpeg = async (event, project, outPath, prerendered, opts = {}) =>
  encodeProject(event, project, outPath, prerendered, { ...opts, mono: await monoFiles(project, isAllowed) });

const encodeProject = (event, project, outPath, prerendered, opts) => new Promise((resolve, reject) => {
  let built;
  try {
    built = buildExportArgs(project, outPath, isAllowed, prerendered || new Map(), opts);
  } catch (err) {
    return reject(err);
  }
  // The filter graph goes through a file: long projects would exceed Windows' command-line length limit.
  const args = [...built.args];
  const at = args.indexOf('-filter_complex');
  const graphFile = path.join(os.tmpdir(), `cupkata-graph-${crypto.randomBytes(6).toString('hex')}.txt`);
  fs.writeFileSync(graphFile, args[at + 1], 'utf8');
  args.splice(at, 2, '-filter_complex_script', graphFile);
  if (args.join(' ').length > 32000) {
    fs.rm(graphFile, { force: true }, () => {});
    return reject(new Error('Ce montage a trop d’incrustations pour être exporté en une fois (limite de Windows). Réduis leur nombre.'));
  }
  const proc = spawn(ffmpegPath, args, { windowsHide: true });
  proc.on('close', () => fs.rm(graphFile, { force: true }, () => {}));
  exportProc = proc;
  let tail = '';
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    tail = (tail + text).slice(-6000);
    let last;
    for (const m of text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)) last = m;
    if (last) {
      const sec = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
      const [from, to] = opts.progress || [0, 1];
      if (!event.sender.isDestroyed()) event.sender.send('export:progress', from + (to - from) * Math.min(1, sec / built.total));
    }
  });
  proc.on('error', (err) => {
    exportProc = null;
    reject(err);
  });
  proc.on('close', (code) => {
    exportProc = null;
    if (code === 0) return resolve(outPath);
    if (proc.cancelled) {
      fs.rm(outPath, { force: true }, () => {});
      return reject(new Error('Export annulé'));
    }
    reject(new Error('FFmpeg a échoué :\n' + tail.trim().split('\n').slice(-6).join('\n')));
  });
});

ipcMain.handle('export:cancel', () => {
  if (exportProc) {
    exportProc.cancelled = true;
    exportProc.kill();
  }
});

let subtitlesJob = null;

ipcMain.handle('subtitles:run', async (event, request) => {
  if (subtitlesJob) throw new Error('Une transcription est déjà en cours');
  const { model, language } = request || {};
  const items = Array.isArray(request?.items) ? request.items.slice(0, 500) : [];
  if (!MODELS.includes(model) || !LANGUAGES.includes(language)) throw new Error('Réglages de transcription invalides');
  const valid = items.filter(
    (it) => isAllowed(it?.path) && [it.in, it.duration, it.start].every(Number.isFinite) && it.in >= 0 && it.duration > 0 && it.start >= 0,
  );
  if (!valid.length) throw new Error('Aucun clip avec du son à transcrire');
  const job = { cancelled: false };
  subtitlesJob = job;
  try {
    return await transcribe(
      { items: valid, model, language },
      {
        cacheDir: path.join(app.getPath('userData'), 'models'),
        isCancelled: () => job.cancelled,
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) event.sender.send('subtitles:progress', p);
        },
      },
    );
  } finally {
    subtitlesJob = null;
  }
});

ipcMain.handle('subtitles:cancel', () => {
  if (subtitlesJob) subtitlesJob.cancelled = true;
});

ipcMain.handle('shell:show', (_e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
});

let mainWindow = null;
const control = createControl({ app, ipcMain, getWindow: () => mainWindow, handlers: { openProject: readProjectFile } });

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'Cupkata',
    backgroundColor: '#111317',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;
  win.webContents.on('did-start-loading', () => control.interfaceRestarted());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // If the interface process dies, log why and bring it back instead of leaving a frozen window.
  win.webContents.on('render-process-gone', (_e, details) => {
    const line = `${new Date().toISOString()} interface arrêtée : ${details.reason} (code ${details.exitCode})\n`;
    fs.appendFile(path.join(app.getPath('userData'), 'crash.log'), line, () => {});
    console.error(line.trim());
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) setTimeout(() => !win.isDestroyed() && win.webContents.reload(), 500);
  });
  const contentsId = win.webContents.id;
  win.on('close', (e) => {
    if (!dirtyWindows.has(contentsId)) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Quitter', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      message: 'Ton montage a des modifications non enregistrées.',
      detail: 'Une sauvegarde automatique est gardée : tu pourras la reprendre au prochain lancement.',
    });
    if (choice === 1) e.preventDefault();
    else dirtyWindows.delete(contentsId);
  });
  if (process.env.CUPKATA_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, serveFile);
  control.cleanup();
  createWindow();
  // For scripts that start Cupkata themselves; otherwise the user turns it on in the interface.
  if (process.argv.includes('--ai-control')) control.start();
});

app.on('window-all-closed', () => {
  if (exportProc) exportProc.kill();
  app.quit();
});

app.on('will-quit', () => control.cleanup());
