const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const { effectFilter, mixer, saturate } = require('./effects.cjs');
const DUCK = require('../shared/effects.json').duck;
const GPU_IDS = require('../shared/effects.json').gpu;
const BACKGROUND = require('../shared/effects.json').background;

// Same envelope as src/ducking.js duckGain(), as an FFmpeg volume expression of timeline time t.
function duckExpression(intervals, level) {
  const f = (v) => Number(v).toFixed(3);
  const terms = intervals.map(
    ([a, b]) => `clip(min((t-${f(a - DUCK.attack)})/${DUCK.attack},(${f(b + DUCK.release)}-t)/${DUCK.release}),0,1)`,
  );
  const tree = (list) => (list.length === 1 ? list[0] : `max(${tree(list.slice(0, list.length >> 1))},${tree(list.slice(list.length >> 1))})`);
  return `1-${f(1 - level)}*${tree(terms)}`;
}

function cleanIntervals(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > p[0] && p[0] >= 0)
    .slice(0, 5000)
    .sort((x, y) => x[0] - y[0]);
}
// In the installed app these programs are unpacked next to the app.asar archive (they can't run from inside it).
const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const ffprobePath = unpacked(require('ffprobe-static').path);

const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'mpg', 'mpeg', '3gp'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];
const AUDIO_EXT = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'opus', 'wma'];
const ALL_EXT = [...VIDEO_EXT, ...IMAGE_EXT, ...AUDIO_EXT];

const MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', mpg: 'video/mpeg', mpeg: 'video/mpeg', '3gp': 'video/3gpp',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp',
  mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg',
  flac: 'audio/flac', opus: 'audio/ogg', wma: 'audio/x-ms-wma',
};

const ext = (p) => path.extname(p).slice(1).toLowerCase();

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim().split('\n').slice(-3).join('\n')));
      else resolve(stdout);
    });
  });
}

async function probe(filePath, thumbDir) {
  const e = ext(filePath);
  if (!ALL_EXT.includes(e)) throw new Error('Format non pris en charge');
  const out = await run(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath]);
  const info = JSON.parse(out);
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  const type = IMAGE_EXT.includes(e) ? 'image' : AUDIO_EXT.includes(e) || !v ? 'audio' : 'video';
  const duration = type === 'image' ? 0 : parseFloat(info.format?.duration) || 0;
  if (type !== 'image' && !(duration > 0)) throw new Error('Durée illisible');

  let thumb = null;
  if (type === 'image') thumb = filePath;
  if (type === 'video') {
    const hash = crypto.createHash('sha1').update(filePath).digest('hex');
    thumb = path.join(thumbDir, `${hash}.jpg`);
    const at = Math.min(1, duration / 2).toFixed(3);
    await run(ffmpegPath, ['-y', '-v', 'error', '-ss', at, '-i', filePath, '-frames:v', '1', '-vf', 'scale=320:-2', thumb]);
  }

  return {
    path: filePath,
    name: path.basename(filePath),
    type,
    duration,
    width: v?.width || 0,
    height: v?.height || 0,
    colorSpace: v?.color_space && v.color_space !== 'unknown' ? v.color_space : null,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    // A WebM with an alpha channel (e.g. a clip whose background was removed).
    alpha:
      type === 'video'
        ? String(v?.tags?.alpha_mode ?? v?.tags?.ALPHA_MODE ?? '') === '1'
        : type === 'image' && /rgba|bgra|argb|abgr|ya8|ya16/.test(v?.pix_fmt || ''),
    thumb,
  };
}

// The project's files whose sound is mono (they're checked at export, so older projects are covered too).
const channelsOf = new Map();
async function monoFiles(project, isAllowed) {
  const mono = new Set();
  for (const m of project.media || []) {
    if (!m.hasAudio || !isAllowed(m.path)) continue;
    try {
      const { mtimeMs } = await fs.promises.stat(m.path);
      const key = `${m.path}|${mtimeMs}`;
      if (!channelsOf.has(key)) {
        const out = await run(ffprobePath, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', m.path]);
        channelsOf.set(key, parseInt(out, 10));
      }
      if (channelsOf.get(key) === 1) mono.add(m.path);
    } catch {
      // Unreadable here: the export itself reports it.
    }
  }
  return mono;
}

// Waveform peaks: one value (0–255) per 1/100 s, cached on disk next to the thumbnails.
const PEAKS_PER_SECOND = 100;
const PEAK_RATE = 8000;

function runBuffer(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { encoding: 'buffer', maxBuffer: 1 << 30, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.toString().trim().split('\n').pop() || err.message));
      else resolve(stdout);
    });
  });
}

async function computePeaks(filePath, cacheDir) {
  const st = await fs.promises.stat(filePath);
  const key = crypto.createHash('sha1').update(`${filePath}|${st.size}|${st.mtimeMs}`).digest('hex');
  const cacheFile = path.join(cacheDir, `${key}.peaks`);
  try {
    return new Uint8Array(await fs.promises.readFile(cacheFile));
  } catch {}
  const pcm = await runBuffer(ffmpegPath, ['-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', String(PEAK_RATE), '-f', 's16le', '-']);
  const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength - (pcm.byteLength % 2)));
  const step = PEAK_RATE / PEAKS_PER_SECOND;
  const peaks = new Uint8Array(Math.ceil(samples.length / step));
  for (let i = 0; i < peaks.length; i++) {
    let max = 0;
    const endIdx = Math.min(samples.length, (i + 1) * step);
    for (let j = i * step; j < endIdx; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks[i] = Math.min(255, Math.round((max / 32768) * 255));
  }
  await fs.promises.writeFile(cacheFile, peaks).catch(() => {});
  return peaks;
}

const n = (x) => Math.max(0, x).toFixed(3);
const end = (c) => c.start + c.duration;
const clampNum = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const TRANSITION_IDS = [
  'fade', 'fadeblack', 'fadewhite', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown', 'circleopen', 'zoomin', 'hblur',
];

// Colour filter: the same 3D table as the preview, written to a .cube file, blended by its amount.
// lut3d needs forward slashes and an escaped drive colon inside the quoted path.
function lutFilter(c, k, lutFiles) {
  const id = c.filter?.id;
  const file = id && lutFiles?.[id];
  if (!file) return '';
  const amount = clampNum(c.filter.amount, 0, 1, 0.8);
  if (amount <= 0) return '';
  const lut = `lut3d=file='${file.replace(/\\/g, '/').replace(/:/g, '\\:')}':interp=trilinear`;
  if (amount >= 0.999) return `,format=rgb24,${lut}`;
  return (
    `,format=gbrp,split[la${k}][lb${k}];[lb${k}]${lut}[lc${k}];` +
    `[lc${k}][la${k}]blend=all_mode=normal:all_opacity=${amount.toFixed(4)}`
  );
}

// Mirrors the preview's CSS filter `brightness(b) contrast(k) saturate(s)` so the export matches what you see.
function colorFilter(c) {
  const b = clampNum(c.color?.brightness, 0.5, 1.5, 1);
  const k = clampNum(c.color?.contrast, 0.5, 1.5, 1);
  const s = clampNum(c.color?.saturation, 0, 2, 1);
  let f = '';
  if (b !== 1 || k !== 1) {
    const e = `clip((val*${b.toFixed(3)}-127.5)*${k.toFixed(3)}+127.5,0,255)`;
    f += `,lutrgb=r='${e}':g='${e}':b='${e}'`;
  }
  if (s !== 1) f += mixer(saturate(s));
  return f;
}

// Clip speed (0.25× to 4×; photos have none).
const speedOf = (c, m) => (m?.type === 'image' ? 1 : clampNum(c.speed, 0.25, 4, 1));

// Changes the sound's speed but keeps its pitch: atempo only goes from 0.5 to 2, so it is chained.
function atempo(speed) {
  if (Math.abs(speed - 1) < 1e-6) return '';
  const parts = [];
  let s = speed;
  while (s > 2 + 1e-9) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5 - 1e-9) {
    parts.push(0.5);
    s /= 0.5;
  }
  parts.push(s);
  return parts.map((p) => `,atempo=${p.toFixed(6)}`).join('');
}

// Same straight lines as src/keyframes.js valueAt(), as an FFmpeg expression of the stream's time t.
function volumeExpression(c, tau0) {
  const speed = c.speed ?? 1;
  const keys = (c.keyframes?.volume || [])
    .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.v))
    .map((k) => ({ tau: (k.t - c.in) / speed, v: Math.min(2, Math.max(0, k.v)) }));
  if (!keys.length) return null;
  let expr = keys[0].v.toFixed(4);
  for (let i = 1; i < keys.length; i++) {
    const [a, b] = [keys[i - 1], keys[i]];
    if (b.tau > a.tau) expr += `+(${(b.v - a.v).toFixed(4)})*clip((t+${n(tau0)}-(${n(a.tau)}))/${n(b.tau - a.tau)},0,1)`;
  }
  return expr;
}

// Volume and fades for a clip segment of length d, as extra audio filters ('' when unchanged).
// tau0: where the segment begins in the clip (seconds), for the volume keyframes.
function audioEffects(c, d, tau0 = 0) {
  const parts = [];
  const volume = Number.isFinite(c.volume) ? Math.min(2, Math.max(0, c.volume)) : 1;
  const animated = volumeExpression(c, tau0);
  if (animated) parts.push(`volume=eval=frame:volume='${animated}'`);
  else if (volume !== 1) parts.push(`volume=${volume.toFixed(3)}`);
  const fi = Math.min(Math.max(0, c.fadeIn || 0), d);
  const fo = Math.min(Math.max(0, c.fadeOut || 0), d - fi);
  if (fi > 1e-3) parts.push(`afade=t=in:st=0:d=${n(fi)}`);
  if (fo > 1e-3) parts.push(`afade=t=out:st=${n(d - fo)}:d=${n(fo)}`);
  return parts.map((p) => ',' + p).join('');
}

// A main-track clip's picture in the W×H frame, with its background — the same steps as the preview
// (src/components/Preview.jsx paintFrame): blur = the picture zoomed past the frame, blurred and
// dimmed, under the fitted picture; fill = zoomed to cover; color = a colour under the fitted picture.
// A crop that follows a path through the source (src/reframe.js draws the same one in the preview).
// The path's times are source seconds; the filter's t starts at src, where the input was cut.
function pathExpr(points, key, T) {
  const num = (v) => Number(v).toFixed(4);
  let e = num(points[points.length - 1][key]);
  for (let i = points.length - 2; i >= 0; i--) {
    const [a, b] = [points[i], points[i + 1]];
    e = `if(lt(${T},${num(b.t)}),${num(a[key])}+(${num(b[key] - a[key])})*(${T}-${num(a.t)})/${num(b.t - a.t)},${e})`;
  }
  return `if(lt(${T},${num(points[0].t)}),${num(points[0][key])},${e})`;
}

function reframeCrop(points, W, H, src) {
  const T = `(t+${Number(src).toFixed(4)})`;
  const x = `clip(${pathExpr(points, 'x', T)}*iw-${W}/2,0,iw-${W})`;
  const y = `clip(${pathExpr(points, 'y', T)}*ih-${H}/2,0,ih-${H})`;
  return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='${x}':y='${y}'`;
}

// Inside the export every picture uses BT.601 numbers: that is what FFmpeg applies by itself when
// images, overlays and GPU frames go from RGB to YUV. Only video sources in another space need
// converting on the way in, and the finished picture is converted once, on the way out.
function toWorkingColor(m) {
  if (m.type !== 'video') return '';
  if (m.colorSpace === 'smpte170m' || m.colorSpace === 'bt470bg') return '';
  // An untagged file is read as players read it: BT.709 in HD, BT.601 in standard definition.
  if (!m.colorSpace && m.height <= 576) return '';
  return `scale=in_color_matrix=${m.colorSpace ? 'auto' : 'bt709'}:out_color_matrix=bt601:out_range=tv:flags=accurate_rnd+full_chroma_int,setparams=colorspace=smpte170m,`;
}
const TO_DELIVERY_COLOR = 'scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p';
const COLOR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

function backgroundChain(c, k, W, H, fps, alpha = false, src = null) {
  const B = BACKGROUND;
  const bg = c.background || {};
  const tail = `,setsar=1,fps=${fps}`;
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease`;
  const even = (v) => 2 * Math.round(v / 2);
  // A transparent picture (background removed) is laid over its background like in the preview:
  // a colour (black by default), the cover-zoomed picture, or that picture blurred.
  if (alpha) {
    const under = (src) => `;${src}[ab${k}];[ab${k}][af${k}]overlay=(W-w)/2:(H-h)/2:shortest=1${tail}`;
    const plain = (hex) => under(`color=c=0x${hex}:s=${W}x${H}:r=${fps}`);
    if (bg.mode === 'color' && /^#[0-9a-f]{6}$/i.test(bg.color || '')) return `format=yuva420p,${fit}[af${k}]${plain(bg.color.slice(1))}`;
    if (bg.mode === 'fill') return `format=yuva420p,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[af${k}]${plain('000000')}`;
    if (bg.mode === 'blur') {
      const sigma = (B.sigmaMin + B.sigmaRange * clampNum(bg.blur, 0, 1, 0.5)) * Math.min(W, H);
      return (
        `format=yuva420p,split[bgs${k}][fgs${k}];` +
        `[bgs${k}]premultiply=inplace=1,format=yuv420p,scale=${even(W * B.margin)}:${even(H * B.margin)}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `gblur=sigma=${sigma.toFixed(2)},colorchannelmixer=rr=${B.dim}:gg=${B.dim}:bb=${B.dim}[bgb${k}];` +
        `[fgs${k}]${fit}[fgf${k}];[bgb${k}][fgf${k}]overlay=(W-w)/2:(H-h)/2${tail}`
      );
    }
    return `format=yuva420p,${fit}[af${k}]${plain('000000')}`;
  }
  if (c.reframe?.length && src != null) return `${reframeCrop(c.reframe, W, H, src)}${tail}`;
  if (bg.mode === 'fill') return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${tail}`;
  if (bg.mode === 'color' && /^#[0-9a-f]{6}$/i.test(bg.color || '')) {
    return `${fit},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x${bg.color.slice(1)}${tail}`;
  }
  if (bg.mode === 'blur') {
    const sigma = (B.sigmaMin + B.sigmaRange * clampNum(bg.blur, 0, 1, 0.5)) * Math.min(W, H);
    return (
      `split[bgs${k}][fgs${k}];` +
      `[bgs${k}]scale=${even(W * B.margin)}:${even(H * B.margin)}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `gblur=sigma=${sigma.toFixed(2)},colorchannelmixer=rr=${B.dim}:gg=${B.dim}:bb=${B.dim}[bgb${k}];` +
      `[fgs${k}]${fit}[fgf${k}];[bgb${k}][fgf${k}]overlay=(W-w)/2:(H-h)/2${tail}`
    );
  }
  return `${fit},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black${tail}`;
}

// FFmpeg's built-in VP9 decoder drops transparency: libvpx keeps it.
const alphaDecoder = (m) => (m.alpha === true && m.type === 'video' ? ['-c:v', 'libvpx-vp9'] : []);

// Plans the video track as a list of segments (clips and black gaps), each with the exact picture
// source it needs. Shared by the normal export and by the GPU pre-render, so both see the same frames.
function planExport(project, isAllowed = () => true) {
  const { width: W, height: H, fps } = project;
  const mediaById = new Map(project.media.map((m) => [m.id, m]));
  const getMedia = (c) => {
    const m = mediaById.get(c.mediaId);
    if (!m || !isAllowed(m.path)) throw new Error('Média introuvable : ' + (m?.name || c.mediaId));
    return m;
  };

  const lane = (c) => c.lane ?? 0;
  const videoClips = project.clips.filter((c) => c.track === 'video' && lane(c) === 0).sort((a, b) => a.start - b.start);
  // Overlays: video lanes above the main track, composited from the lowest lane up.
  const overlayClips = project.clips
    .filter((c) => c.track === 'video' && lane(c) > 0)
    .sort((a, b) => lane(a) - lane(b) || a.start - b.start);
  // An overlay's sound is mixed like an audio-track clip.
  const audioClips = project.clips
    .filter((c) => c.track === 'audio' || (c.track === 'video' && lane(c) > 0 && getMedia(c).type === 'video'))
    .sort((a, b) => a.start - b.start);
  const total = project.clips.reduce((t, c) => Math.max(t, end(c)), 0);
  if (!(total > 0)) throw new Error('La timeline est vide');

  // 1. Cut the video track into segments (clips and black gaps).
  const segs = [];
  let t = 0;
  for (const c of videoClips) {
    if (c.start > t + 1e-3) segs.push({ gap: true, d: c.start - t });
    const skip = Math.max(0, t - c.start);
    const d = c.duration - skip;
    if (d <= 1e-3) continue;
    segs.push({ c, m: getMedia(c), d, skip });
    t = end(c);
  }
  if (t < total - 1e-3) segs.push({ gap: true, d: total - t });

  // Snap segment boundaries to the frame grid so video and audio lengths add up exactly.
  let at = 0;
  for (const s of segs) {
    const from = Math.round(at * fps);
    at += s.d;
    s.d = (Math.round(at * fps) - from) / fps;
  }
  const kept = segs.filter((s) => s.d > 0);
  segs.length = 0;
  segs.push(...kept);

  // 2. A transition borrows d/2 of extra picture on each side of the cut, so the timeline length is unchanged.
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1];
    const b = segs[i];
    const tr = b.c?.transition;
    if (a.gap || b.gap || b.skip > 0 || !tr || !TRANSITION_IDS.includes(tr.type)) continue;
    if (Math.abs(end(a.c) - b.c.start) > 1e-3) continue;
    const half = Math.floor((Math.min(clampNum(tr.duration, 0.1, 3, 1), a.d, b.d) / 2) * fps);
    if (half < 1) continue;
    const td = (2 * half) / fps;
    b.trans = { type: tr.type, d: td };
    b.padIn = td / 2;
    a.padOut = td / 2;
  }

  // Renumber every segment frame by frame: exact frame count, clean timestamps for effects and xfade.
  const regrid = (L) => `fps=${fps},trim=end_frame=${Math.round(L * fps)},setpts=N/(${fps}*TB)`;

  segs.forEach((s, k) => {
    s.padIn ??= 0;
    s.padOut ??= 0;
    s.L = s.d + s.padIn + s.padOut;
    s.frames = Math.round(s.L * fps);
    if (s.gap) return;
    const { c, m } = s;
    // Timeline seconds × speed = source seconds.
    s.speed = speedOf(c, m);
    const wanted = c.in + (s.skip - s.padIn) * s.speed;
    s.startPad = Math.max(0, -wanted) / s.speed;
    s.src = Math.max(0, wanted);
    s.tau0 = s.skip - s.padIn;
    s.inputArgs =
      m.type === 'image'
        ? ['-loop', '1', '-framerate', String(fps), '-t', n(s.L), '-i', m.path]
        : ['-ss', n(s.src), '-t', n((s.L - s.startPad) * s.speed), ...alphaDecoder(m), '-i', m.path];
    // Clone-padding keeps the segment exactly L long even when the source has no picture left to borrow.
    const pre = s.startPad > 1e-3 ? `,tpad=start_mode=clone:start_duration=${n(s.startPad)}` : '';
    s.pictureChain =
      `${toWorkingColor(m)}${backgroundChain(c, k, W, H, fps, m.alpha === true, m.type === 'video' ? s.src : null)}${colorFilter(c)}${lutFilter(c, k, project.lutFiles)},format=yuv420p,setpts=(PTS-STARTPTS)/${s.speed}${pre},` +
      `tpad=stop_mode=clone:stop_duration=${n(s.L)},${regrid(s.L)}`;
    s.gpu = GPU_IDS.includes(c.effect?.type);
    s.motion = hasMotion(c);
  });

  return { W, H, fps, total, segs, audioClips, overlayClips, getMedia, regrid };
}

// Same box as the preview (src/project.js overlayBox): the source fitted into the frame, times its
// scale, centred on (x, y) — sizes rounded to even pixels for the encoder.
function overlayGeometry(c, m, W, H) {
  const tf = c.transform || {};
  const scale = clampNum(tf.scale, 0.02, 4, 1);
  const fit = Math.min(W / m.width, H / m.height);
  const even = (v) => Math.max(2, 2 * Math.round(v / 2));
  return {
    w: even(m.width * fit * scale),
    h: even(m.height * fit * scale),
    cx: clampNum(tf.x, -1, 2, 0.5) * W,
    cy: clampNum(tf.y, -1, 2, 0.5) * H,
    rotation: clampNum(tf.rotation, -360, 360, 0),
    opacity: clampNum(tf.opacity, 0, 1, 1),
  };
}

const MOTION_PROPS = ['scale', 'x', 'y', 'rotation', 'opacity'];
const hasMotion = (c) => MOTION_PROPS.some((p) => c.keyframes?.[p]?.length);

// An overlay's input and the filters that bring it to the wanted size, ready to be placed.
function overlayInput(c, m, fps) {
  return m.type === 'image'
    ? ['-loop', '1', '-framerate', String(fps), '-t', n(c.duration), '-i', m.path]
    : ['-ss', n(c.in), '-t', n(c.duration * speedOf(c, m)), ...alphaDecoder(m), '-i', m.path];
}
const overlayPicture = (c, m, fps, w, h, i, lutFiles) =>
  `${toWorkingColor(m)}setpts=(PTS-STARTPTS)/${speedOf(c, m)},fps=${fps},scale=${w}:${h},setsar=1${colorFilter(c)}${lutFilter(c, `o${i}`, lutFiles)},format=rgba`;

// Animated overlays are drawn in the renderer at their largest size, onto a transparent frame.
function overlayMotionJobs(project, overlayClips, getMedia, W, H, fps) {
  const jobs = [];
  overlayClips.forEach((c, i) => {
    const m = getMedia(c);
    if (!hasMotion(c) || !(m.width > 0 && m.height > 0)) return;
    const largest = Math.max(clampNum(c.transform?.scale, 0.02, 4, 1), ...(c.keyframes.scale || []).map((k) => k.v));
    const fit = Math.min(W / m.width, H / m.height) * Math.min(4, Math.max(0.02, largest));
    const even = (v) => Math.max(2, 2 * Math.round(v / 2));
    const [inWidth, inHeight] = [even(m.width * fit), even(m.height * fit)];
    jobs.push({
      k: `o${i}`,
      width: W,
      height: H,
      inWidth,
      inHeight,
      alpha: true,
      fps,
      frames: Math.ceil(c.duration * fps),
      tau0: 0,
      effect: null,
      motion: { clip: c, overlay: true, mediaWidth: m.width, mediaHeight: m.height, inWidth, inHeight },
      inputArgs: overlayInput(c, m, fps),
      chain: overlayPicture(c, m, fps, inWidth, inHeight, i, project.lutFiles),
    });
  });
  return jobs;
}

// Frames that need the renderer (GPU effects, animated clips) are decoded, processed there, re-encoded.
function gpuJobs(project, isAllowed) {
  const { W, H, fps, segs, overlayClips, getMedia } = planExport(project, isAllowed);
  const main = segs
    .map((s, k) => ({ s, k }))
    .filter(({ s }) => s.gpu || s.motion)
    .map(({ s, k }) => ({
      k,
      width: W,
      height: H,
      inWidth: W,
      inHeight: H,
      fps,
      frames: s.frames,
      tau0: s.tau0,
      effect: s.gpu ? { type: s.c.effect.type, intensity: clampNum(s.c.effect.intensity, 0, 1, 0.7) } : null,
      motion: s.motion ? { clip: s.c, overlay: false, inWidth: W, inHeight: H } : null,
      inputArgs: s.inputArgs,
      chain: `${s.pictureChain}${s.gpu ? '' : effectFilter(s.c, k, W, H, fps, s.tau0)},format=rgba`,
    }));
  return [...main, ...overlayMotionJobs(project, overlayClips, getMedia, W, H, fps)];
}

// opts.videoOnly: picture only, high quality (first pass when the effect track is used).
// opts.baseVideo + opts.fxRanges: reuse that picture, lay the processed effect-track ranges on it,
// then add the overlays and all the sound (final pass).
// Long main tracks are rendered in blocks: too many source files at once would exceed Windows'
// command-line limit and keep hundreds of decoders open. Returns null when one pass is enough.
const CHUNK_FILES = 30;
const CHUNK_SEGMENTS = 120;
function planChunks(project, isAllowed = () => true) {
  const { segs } = planExport(project, isAllowed);
  const usesFile = (s) => !s.gap && s.m.type !== 'image';
  if (segs.filter(usesFile).length <= CHUNK_FILES && segs.length <= CHUNK_SEGMENTS) return null;
  const chunks = [];
  let first = 0;
  let files = 0;
  segs.forEach((s, k) => {
    if (usesFile(s)) files += 1;
    if (files >= CHUNK_FILES || k - first + 1 >= CHUNK_SEGMENTS || k === segs.length - 1) {
      const part = segs.slice(first, k + 1);
      chunks.push({
        first,
        last: k,
        // A block's picture keeps the handles of the transitions at its two ends.
        L: part.reduce((n, p, i) => n + p.L - (i && p.trans ? p.trans.d : 0), 0),
        trans: segs[first].trans || null,
      });
      first = k + 1;
      files = 0;
    }
  });
  return chunks;
}

// In the filter graph, not on the command line; null when the path can't be written there.
const graphPath = (p) => (p.includes("'") ? null : p.replace(/\\/g, '/').replace(/:/g, '\\:'));

function buildExportArgs(project, outPath, isAllowed = () => true, prerendered = new Map(), opts = {}) {
  const { W, H, fps, total, segs, audioClips, overlayClips, getMedia, regrid } = planExport(project, isAllowed);
  // range: render just these segments (one block). chunks: use the rendered blocks instead of the segments.
  const { videoOnly = false, baseVideo = null, fxRanges = [], range = null, chunks = null, mono = new Set() } = opts;
  const inputs = [];
  const filters = [];
  let idx = 0;
  const AFMT = 'aformat=sample_rates=48000:channel_layouts=stereo';
  // Mono goes to both sides at full level, as in the preview (FFmpeg's own conversion is 3 dB lower).
  const soundFormat = (m) => (mono.has(m.path) ? `pan=stereo|c0=c0|c1=c0,${AFMT}` : AFMT);

  const silence = (d, label) => {
    if (videoOnly) return;
    // In the filter graph, not on the command line (which Windows limits to 32,767 characters).
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${n(d)},asetpts=PTS-STARTPTS,${AFMT}[${label}]`);
  };

  if (chunks) {
    chunks.forEach((ch, i) => {
      inputs.push('-i', ch.path);
      const vi = idx++;
      if (!baseVideo) filters.push(`[${vi}:v]setpts=PTS-STARTPTS,format=yuv420p,${regrid(ch.L)},settb=AVTB[v${i}]`);
      if (!videoOnly) filters.push(`[${vi}:a]asetpts=PTS-STARTPTS,${AFMT}[a${i}]`);
    });
  }
  segs.forEach((s, k) => {
    if (chunks || (range && (k < range.first || k > range.last))) return;
    if (s.gap) {
      if (!baseVideo) {
        inputs.push('-f', 'lavfi', '-t', n(s.L + 1 / fps), '-i', `color=c=black:s=${W}x${H}:r=${fps}`);
        filters.push(`[${idx++}:v]setsar=1,format=yuv420p,${regrid(s.L)},settb=AVTB[v${k}]`);
      }
      silence(s.d, `a${k}`);
      return;
    }
    const { c, m } = s;
    const wantsAudio = !videoOnly && m.type === 'video' && m.hasAudio && !c.muted;
    let audioInput;
    const done = prerendered.get(k);
    if (baseVideo) {
      if (wantsAudio) {
        inputs.push(...s.inputArgs);
        audioInput = idx++;
      }
    } else if (done) {
      inputs.push('-i', done);
      filters.push(`[${idx++}:v]setpts=PTS-STARTPTS,format=yuv420p,${regrid(s.L)},settb=AVTB[v${k}]`);
      if (wantsAudio) {
        inputs.push(...s.inputArgs);
        audioInput = idx++;
      }
    } else if (m.type === 'image' && !m.path.includes("'")) {
      // A photo is read once, inside the graph: long slideshows stay under the command-line limit
      // and the picture chain's clone padding holds it for the segment's whole length.
      const file = m.path.replace(/\\/g, '/').replace(/:/g, '\\:');
      // (the fps filter passes nothing from a single frame, so the photo is first held a few frames).
      filters.push(`movie=filename='${file}',tpad=stop_mode=clone:stop_duration=0.2,${s.pictureChain}${effectFilter(c, k, W, H, fps, s.tau0)},settb=AVTB[v${k}]`);
    } else {
      inputs.push(...s.inputArgs);
      const vi = idx++;
      filters.push(`[${vi}:v]${s.pictureChain}${effectFilter(c, k, W, H, fps, s.tau0)},settb=AVTB[v${k}]`);
      audioInput = vi;
    }
    if (videoOnly) return;
    if (wantsAudio) {
      filters.push(
        `[${audioInput}:a]atrim=start=${n(c.in + s.skip * s.speed - s.src)}:duration=${n(s.d * s.speed)},asetpts=PTS-STARTPTS,${soundFormat(m)}${atempo(s.speed)}${audioEffects(c, s.d, s.skip)}[a${k}]`,
      );
    } else {
      silence(s.d, `a${k}`);
    }
  });

  // 3. Join video segments one by one (xfade at transitions), and audio with a plain concat.
  // What gets joined: the blocks, one block's segments, or every segment; labels follow their index.
  const firstLabel = range ? range.first : 0;
  const parts = chunks || (range ? segs.slice(range.first, range.last + 1) : segs);
  let videoOut = `[v${firstLabel}]`;
  if (baseVideo) {
    inputs.push('-i', baseVideo);
    filters.push(`[${idx++}:v]setpts=PTS-STARTPTS,format=yuv420p[vbase]`);
    videoOut = '[vbase]';
  } else {
    let length = parts[0].L;
    for (let i = 1; i < parts.length; i++) {
      const s = parts[i];
      const k = firstLabel + i;
      if (s.trans) {
        filters.push(`${videoOut}[v${k}]xfade=transition=${s.trans.type}:duration=${n(s.trans.d)}:offset=${n(length - s.trans.d)}[j${k}]`);
        length += s.L - s.trans.d;
      } else {
        filters.push(`${videoOut}[v${k}]concat=n=2:v=1:a=0[j${k}]`);
        length += s.L;
      }
      videoOut = `[j${k}]`;
    }
  }
  if (!videoOnly) filters.push(`${parts.map((_, i) => `[a${firstLabel + i}]`).join('')}concat=n=${parts.length}:v=0:a=1[acat]`);

  if (range) {
    const args = [
      '-y', '-hide_banner', ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', videoOut, '-map', '[acat]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le',
      outPath,
    ];
    return { args, total: range.L };
  }

  // Overlays sit right on the main track (a base video from the first pass already has them).
  if (!baseVideo) {
    overlayClips.forEach((c, i) => {
      const m = getMedia(c);
      if (!(m.width > 0 && m.height > 0)) return;
      const g = overlayGeometry(c, m, W, H);
      const from = n(c.start);
      const moved = prerendered.get(`o${i}`);
      if (moved) {
        // Already drawn at its place on a full transparent frame, like the preview.
        inputs.push('-i', moved);
        filters.push(`[${idx++}:v]format=rgba,setpts=PTS-STARTPTS+${from}/TB[ov${i}]`);
        filters.push(`${videoOut}[ov${i}]overlay=0:0:eof_action=pass:enable='between(t,${from},${n(c.start + c.duration)})'[vo${i}]`);
        videoOut = `[vo${i}]`;
        return;
      }
      inputs.push(...overlayInput(c, m, fps));
      const rad = ((g.rotation * Math.PI) / 180).toFixed(6);
      const rotate = Math.abs(g.rotation) > 0.01 ? `,rotate=${rad}:c=none:ow=rotw(${rad}):oh=roth(${rad})` : '';
      const fade = g.opacity < 0.999 ? `,colorchannelmixer=aa=${g.opacity.toFixed(4)}` : '';
      filters.push(
        `[${idx++}:v]${overlayPicture(c, m, fps, g.w, g.h, i, project.lutFiles)}${fade}${rotate},setpts=PTS-STARTPTS+${from}/TB[ov${i}]`,
      );
      filters.push(
        `${videoOut}[ov${i}]overlay=x=${n(g.cx)}-overlay_w/2:y=${n(g.cy)}-overlay_h/2:eof_action=pass:` +
          `enable='between(t,${from},${n(c.start + c.duration)})'[vo${i}]`,
      );
      videoOut = `[vo${i}]`;
    });
  }

  // Effect-track ranges processed by the renderer go under the texts.
  fxRanges.forEach((r, i) => {
    const from = n(r.start);
    inputs.push('-i', r.path);
    filters.push(`[${idx++}:v]setpts=PTS-STARTPTS+${from}/TB,format=yuv420p[fr${i}]`);
    filters.push(`${videoOut}[fr${i}]overlay=0:0:eof_action=pass:enable='between(t,${from},${n(r.start + r.duration)})'[vf${i}]`);
    videoOut = `[vf${i}]`;
  });
  (project.overlays || []).forEach((o, i) => {
    const from = n(o.start);
    const to = n(o.start + o.duration);
    const enable = `enable='between(t,${from},${to})'`;
    if (o.pattern) {
      // Animated overlay: a numbered PNG sequence shifted to start at the clip's position.
      inputs.push('-framerate', String(fps), '-start_number', '0', '-i', o.pattern);
      filters.push(`[${idx++}:v]setpts=PTS-STARTPTS+${from}/TB[sq${i}]`);
      filters.push(`${videoOut}[sq${i}]overlay=0:0:eof_action=pass:${enable}[vt${i}]`);
    } else {
      // A still (a text…) is read once, inside the graph; overlay then holds it.
      const file = graphPath(o.path);
      if (file) {
        filters.push(`movie=filename='${file}'[st${i}]`);
        filters.push(`${videoOut}[st${i}]overlay=0:0:${enable}[vt${i}]`);
      } else {
        inputs.push('-loop', '1', '-framerate', String(fps), '-t', n(total), '-i', o.path);
        filters.push(`${videoOut}[${idx++}:v]overlay=0:0:${enable}[vt${i}]`);
      }
    }
    videoOut = `[vt${i}]`;
  });

  if (videoOnly) {
    const args = [
      '-y', '-hide_banner', ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', videoOut,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p',
      outPath,
    ];
    return { args, total };
  }

  filters.push(`${videoOut}${TO_DELIVERY_COLOR}[vout]`);
  videoOut = '[vout]';

  const voice = cleanIntervals(project.voice);
  const mix = ['[acat]'];
  audioClips.forEach((c, i) => {
    const m = getMedia(c);
    if (!m.hasAudio || c.muted) return;
    const span = c.duration * speedOf(c, m);
    const file = graphPath(m.path);
    let source;
    if (file) {
      source = `amovie=filename='${file}':seek_point=${n(c.in)},atrim=start=${n(c.in)}:duration=${n(span)},asetpts=PTS-STARTPTS,`;
    } else {
      inputs.push('-ss', n(c.in), '-t', n(span), '-i', m.path);
      source = `[${idx++}:a]`;
    }
    const ms = Math.round(c.start * 1000);
    // After adelay the stream's time is timeline time, which the ducking envelope is expressed in.
    const level = clampNum(c.duck?.level, 0, 1, DUCK.level);
    const duck = c.duck && voice.length ? `,volume=eval=frame:volume='${duckExpression(voice, level)}'` : '';
    filters.push(`${source}${soundFormat(m)}${atempo(speedOf(c, m))}${audioEffects(c, c.duration)},adelay=${ms}|${ms}${duck}[m${i}]`);
    mix.push(`[m${i}]`);
  });
  let audioOut = '[acat]';
  if (mix.length > 1) {
    filters.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0[aout]`);
    audioOut = '[aout]';
  }
  if (project.normalize === true) {
    filters.push(`${audioOut}loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[anorm]`);
    audioOut = '[anorm]';
  }

  // A preset targets a bitrate; a range keeps just that part of the finished picture and sound.
  const videoKbps = clampNum(project.encode?.video, 500, 100000, 0);
  const audioKbps = clampNum(project.encode?.audio, 64, 320, 192);
  const quality = videoKbps
    ? ['-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.5)}k`, '-bufsize', `${videoKbps * 2}k`]
    : ['-crf', '20'];
  const from = clampNum(project.range?.start, 0, total, 0);
  const length = clampNum(project.range?.duration, 0, total - from, 0);
  const part = length > 0 ? ['-ss', n(from), '-t', n(length)] : [];
  const args = [
    '-y', '-hide_banner', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', videoOut, '-map', audioOut,
    ...part,
    '-c:v', 'libx264', '-preset', 'veryfast', ...quality, '-pix_fmt', 'yuv420p', ...COLOR_TAGS,
    '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-movflags', '+faststart',
    outPath,
  ];
  return { args, total: length > 0 ? length : total };
}

// Voice cleaning: rumble, background noise, muddiness and harshness, then a steady level. The noise
// settings come from the file's own quietest moments, so a clean recording is left nearly untouched.
// The final gain is one value for the whole file, measured first: an automatic gain would raise the
// noise again wherever nobody speaks. The picture is copied as it is.
const VOICE_LOUDNESS = -16;
// afftdn delays the sound by this much (its analysis window): taken back so it stays in sync.
const DENOISE_DELAY = 0.024;

function cleanChain(floorDb) {
  const noise = Math.min(-28, Math.max(-60, floorDb + 8));
  const gate = (10 ** ((floorDb + 5) / 20)).toFixed(5);
  return [
    'highpass=f=80',
    `afftdn=nr=30:nf=${noise.toFixed(1)}`,
    `atrim=start=${DENOISE_DELAY},asetpts=PTS-STARTPTS`,
    `agate=threshold=${gate}:ratio=3:attack=8:release=250`,
    'equalizer=f=250:t=q:w=1:g=-1.5',
    'equalizer=f=3500:t=q:w=1.2:g=2.5',
    'deesser=i=0.3',
    'acompressor=threshold=-20dB:ratio=3:attack=15:release=150:makeup=2',
  ].join(',');
}

// The level of the file's quiet moments: the 10th percentile of its 100 ms levels, in dB.
async function noiseFloor(file) {
  const raw = await runBuffer(ffmpegPath, ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
  const samples = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3)));
  const levels = [];
  for (let i = 0; i + 800 <= samples.length; i += 800) {
    let sum = 0;
    for (let k = i; k < i + 800; k++) sum += samples[k] * samples[k];
    if (sum > 0) levels.push(10 * Math.log10(sum / 800));
  }
  levels.sort((x, y) => x - y);
  return levels.length ? levels[levels.length >> 3] : -60;
}

function measureLoudness(file, chain) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', file, '-map', '0:a:0', '-af', `${chain},loudnorm=print_format=json`, '-f', 'null', '-'], { windowsHide: true });
    let text = '';
    proc.stderr.on('data', (d) => {
      text = (text + d).slice(-4000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      const measured = Number(text.match(/"input_i"\s*:\s*"(-?[\d.]+)"/)?.[1]);
      if (code !== 0) return reject(new Error(text.trim().split('\n').pop()));
      resolve(Number.isFinite(measured) ? measured : null);
    });
  });
}

async function cleanVoiceFile(file, out, isVideo) {
  const chain = cleanChain(await noiseFloor(file));
  const measured = await measureLoudness(file, chain);
  const gain = measured == null ? 0 : Math.min(18, Math.max(-12, VOICE_LOUDNESS - measured));
  const opus = path.extname(out).toLowerCase() === '.webm';
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y', '-v', 'error', '-i', file, ...(isVideo ? ['-map', '0:v:0', '-c:v', 'copy'] : ['-vn']), '-map', '0:a:0',
      '-af', `${chain},volume=${gain.toFixed(2)}dB,alimiter=limit=0.95:level=disabled:latency=1`, '-ar', '48000',
      ...(opus ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'aac', '-b:a', '192k']), out,
    ], { windowsHide: true });
    let tail = '';
    proc.stderr.on('data', (d) => {
      tail = (tail + d).slice(-2000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(tail.trim().split('\n').pop() || 'FFmpeg a échoué'))));
  });
}

module.exports = { cleanVoiceFile, ffmpegPath, ffprobePath, probe, computePeaks, monoFiles, buildExportArgs, planChunks, gpuJobs, ALL_EXT, VIDEO_EXT, IMAGE_EXT, AUDIO_EXT, MIME, ext };
