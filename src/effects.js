import P from '../shared/effects.json';
import { gpuEngine, GPU_EFFECTS } from './gpu/engine.js';
import { T } from './i18n.js';

// Every formula here has an FFmpeg twin in electron/effects.cjs so the export matches the preview.
export const CATEGORIES = [T('Basique'), T('Cinéma'), T('Lumière'), T('Mouvement'), 'Style', T('Particules'), 'GPU'];
export { GPU_EFFECTS };
export const EFFECTS = [
  { id: 'blur', label: T('Flou'), cat: T('Basique') },
  { id: 'bw', label: T('Noir et blanc'), cat: T('Basique') },
  { id: 'sepia', label: T('Rétro'), cat: T('Basique') },
  { id: 'invert', label: T('Inversion'), cat: T('Basique') },
  { id: 'pop', label: T('Pop'), cat: T('Basique') },
  { id: 'vignette', label: 'Vignette', cat: T('Basique') },
  { id: 'theend', label: T('Fin de film'), cat: T('Cinéma') },
  { id: 'opening', label: T('Début de film'), cat: T('Cinéma') },
  { id: 'irisout', label: T('Fermeture à l’iris'), cat: T('Cinéma') },
  { id: 'irisin', label: T('Ouverture à l’iris'), cat: T('Cinéma') },
  { id: 'countdown', label: T('Compte à rebours'), cat: T('Cinéma') },
  { id: 'filmburn', label: T('Pellicule brûlée'), cat: T('Cinéma') },
  { id: 'filmstrip', label: T('Bande de film'), cat: T('Cinéma') },
  { id: 'rec', label: T('Caméscope REC'), cat: T('Cinéma') },
  { id: 'spotlight', label: T('Projecteur'), cat: T('Lumière') },
  { id: 'glow', label: T('Lueur douce'), cat: T('Lumière') },
  { id: 'dream', label: T('Rêve scintillant'), cat: T('Lumière') },
  { id: 'lightleak', label: T('Lumière chaude'), cat: T('Lumière') },
  { id: 'sparkblur', label: T('Flou étincelant'), cat: T('Lumière') },
  { id: 'flash', label: 'Flash', cat: T('Lumière') },
  { id: 'shake', label: T('Tremblement'), cat: T('Mouvement') },
  { id: 'pulse', label: T('Pulsation'), cat: T('Mouvement') },
  { id: 'wave', label: T('Ondulation'), cat: T('Mouvement') },
  { id: 'zoomslow', label: T('Zoom lent'), cat: T('Mouvement') },
  { id: 'sway', label: T('Balancement'), cat: T('Mouvement') },
  { id: 'rgb', label: T('Décalage RGB'), cat: 'Style' },
  { id: 'rainbow', label: T('Arc-en-ciel'), cat: 'Style' },
  { id: 'mirror', label: T('Miroir'), cat: 'Style' },
  { id: 'pixel', label: 'Pixels', cat: 'Style' },
  { id: 'cinema', label: T('Cinéma'), cat: 'Style' },
  { id: 'vhs', label: 'VHS', cat: 'Style' },
  { id: 'oldfilm', label: T('Film ancien'), cat: 'Style' },
  { id: 'sparkle', label: T('Paillettes'), cat: T('Particules') },
  { id: 'snow', label: T('Neige'), cat: T('Particules') },
  { id: 'confetti', label: T('Confettis'), cat: T('Particules') },
  { id: 'hearts', label: T('Cœurs'), cat: T('Particules') },
  { id: 'rain', label: T('Pluie'), cat: T('Particules') },
  { id: 'bokeh', label: 'Bokeh', cat: T('Particules') },
  { id: 'fireflies', label: T('Lucioles'), cat: T('Particules') },
  { id: 'swirl', label: T('Tourbillon'), cat: 'GPU' },
  { id: 'bulge', label: T('Loupe'), cat: 'GPU' },
  { id: 'zoomblur', label: T('Flou de zoom'), cat: 'GPU' },
  { id: 'crt', label: T('Vieille télé'), cat: 'GPU' },
  { id: 'glitch', label: 'Glitch', cat: 'GPU' },
  { id: 'shockwave', label: T('Onde de choc'), cat: 'GPU' },
  { id: 'emboss', label: T('Relief'), cat: 'GPU' },
  { id: 'halftone', label: T('Trame BD'), cat: 'GPU' },
  { id: 'tiltshift', label: T('Miniature'), cat: 'GPU' },
  { id: 'bloom', label: T('Éclat'), cat: 'GPU' },
  { id: 'kaleido', label: T('Kaléidoscope'), cat: 'GPU' },
  { id: 'heat', label: T('Chaleur'), cat: 'GPU' },
];
export const DEFAULT_INTENSITY = 0.7;
export const STILL_EFFECTS = new Set(['vignette', 'cinema']);
export const SEQUENCE_EFFECTS = new Set([
  'sparkle', 'dream', 'vhs', 'oldfilm', 'snow', 'confetti', 'hearts', 'lightleak',
  'theend', 'opening', 'irisout', 'irisin', 'countdown', 'filmburn', 'filmstrip', 'rec', 'spotlight', 'rain', 'bokeh', 'fireflies',
]);

export const clipEffect = (c) =>
  c?.effect?.type && P.ids.includes(c.effect.type)
    ? { type: c.effect.type, intensity: c.effect.intensity ?? DEFAULT_INTENSITY, duration: c.duration }
    : null;

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);

export function shakeParams(tau, A, W, H) {
  const s = P.shake;
  const dx = s.amp * A * W * (s.w[0] * Math.sin(TAU * s.fx[0] * tau + s.px[0]) + s.w[1] * Math.sin(TAU * s.fx[1] * tau + s.px[1]));
  const dy = s.amp * A * H * (s.w[0] * Math.sin(TAU * s.fy[0] * tau + s.py[0]) + s.w[1] * Math.sin(TAU * s.fy[1] * tau + s.py[1]));
  return { dx, dy, z: 1 + 2 * s.amp * A };
}

export const pulseZoom = (tau, A) => 1 + P.pulse.amp * A * (0.5 - 0.5 * Math.cos(TAU * P.pulse.freq * tau));
export const zoomSlow = (tau, A, duration) => 1 + P.zoomslow.amount * A * Math.min(1, Math.max(0, tau / Math.max(0.01, duration)));
export const swayAngle = (tau, A) => P.sway.angle * A * Math.sin(TAU * P.sway.freq * tau);
export const flashAlpha = (tau, A) => A * Math.max(0, 1 - frac(P.flash.freq * tau) / P.flash.width) ** 2;
export const rainbowDegrees = (tau, A) => 360 * (P.rainbow.minSpeed + (P.rainbow.maxSpeed - P.rainbow.minSpeed) * A) * tau;
export const pixelBlock = (A, H) => Math.max(1, Math.round((P.pixel.min + (P.pixel.max - P.pixel.min) * A) * (H / 720)));

const pool = new Map();
// Scratch canvases are kept per size so the preview and the effect thumbnails never fight over one.
function scratch(key, W, H) {
  const id = `${key}:${W}x${H}`;
  let c = pool.get(id);
  if (!c) {
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    pool.set(id, c);
  }
  return c.getContext('2d');
}

function black(c, W, H) {
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
}

function frameOnScratch(key, W, H, drawFrame) {
  const src = scratch(key, W, H);
  src.setTransform(1, 0, 0, 1, 0, 0);
  src.globalCompositeOperation = 'source-over';
  black(src, W, H);
  drawFrame(src);
  return src.canvas;
}

function rgbSplit(c, W, H, d, drawFrame) {
  const src = frameOnScratch('rgb-src', W, H, drawFrame);
  c.globalCompositeOperation = 'lighter';
  for (const [color, offset] of [['#f00', -d], ['#0f0', 0], ['#00f', d]]) {
    const ch = scratch('rgb-' + color, W, H);
    ch.globalCompositeOperation = 'source-over';
    ch.drawImage(src, 0, 0);
    ch.globalCompositeOperation = 'multiply';
    ch.fillStyle = color;
    ch.fillRect(0, 0, W, H);
    c.drawImage(ch.canvas, offset, 0);
  }
}

// Renders one clip's picture with its effect into an opaque canvas context.
// drawFrame(ctx, extraFilter) draws the fitted source frame (colour filter already applied).
export function renderClipEffect(c, W, H, fx, tau, drawFrame) {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  black(c, W, H);
  const A = fx?.intensity ?? 0;
  const s = H / 720;
  const zoomAround = (z, angleDeg = 0, dx = 0, dy = 0) => {
    c.translate(W / 2 - dx, H / 2 - dy);
    if (angleDeg) c.rotate((angleDeg * Math.PI) / 180);
    c.scale(z, z);
    c.translate(-W / 2, -H / 2);
  };

  switch (fx?.type) {
    case 'blur':
      drawFrame(c);
      drawFrame(c, `blur(${P.blur.radius * A * s}px)`);
      break;
    case 'bw':
      drawFrame(c, `grayscale(${A})`);
      break;
    case 'sepia':
      drawFrame(c, `sepia(${A})`);
      break;
    case 'oldfilm':
      drawFrame(c, `sepia(${P.oldfilm.sepia * A})`);
      break;
    case 'invert':
      drawFrame(c, `invert(${A})`);
      break;
    case 'pop':
      drawFrame(c, `contrast(${1 + P.pop.contrast * A}) saturate(${1 + P.pop.saturation * A})`);
      break;
    case 'rainbow':
      drawFrame(c, `hue-rotate(${rainbowDegrees(tau, A)}deg)`);
      break;
    case 'glow':
    case 'dream': {
      const g = P[fx.type];
      drawFrame(c);
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = g.opacity * A;
      drawFrame(c, `blur(${g.radius * A * s}px)`);
      break;
    }
    case 'shake': {
      const { dx, dy, z } = shakeParams(tau, A, W, H);
      zoomAround(z, 0, dx, dy);
      drawFrame(c);
      break;
    }
    case 'pulse':
      zoomAround(pulseZoom(tau, A));
      drawFrame(c);
      break;
    case 'zoomslow':
      zoomAround(zoomSlow(tau, A, fx.duration));
      drawFrame(c);
      break;
    case 'sway':
      zoomAround(1 + P.sway.zoom * A, swayAngle(tau, A));
      drawFrame(c);
      break;
    case 'flash':
      drawFrame(c);
      c.fillStyle = `rgba(255,255,255,${flashAlpha(tau, A)})`;
      c.fillRect(0, 0, W, H);
      break;
    case 'wave': {
      const src = frameOnScratch('wave', W, H, drawFrame);
      c.drawImage(src, 0, 0);
      const w = P.wave;
      for (let y = 0; y < H; y += 2) {
        const dx = w.amp * A * W * Math.sin(TAU * ((y + 1) / H * w.waves + w.freq * tau));
        c.drawImage(src, 0, y, W, 2, dx, y, W, 2);
      }
      break;
    }
    case 'rgb':
      rgbSplit(c, W, H, Math.round(P.rgb.amp * A * W), drawFrame);
      break;
    case 'vhs':
      rgbSplit(c, W, H, Math.round(P.vhs.shift * A * W), drawFrame);
      break;
    case 'mirror': {
      const src = frameOnScratch('mirror', W, H, drawFrame);
      const half = W / 2;
      c.drawImage(src, 0, 0, half, H, 0, 0, half, H);
      c.translate(W, 0);
      c.scale(-1, 1);
      c.drawImage(src, 0, 0, half, H, 0, 0, half, H);
      break;
    }
    case 'pixel': {
      const src = frameOnScratch('pixel', W, H, drawFrame);
      const b = pixelBlock(A, H);
      const sw = Math.max(1, Math.floor(W / b));
      const sh = Math.max(1, Math.floor(H / b));
      const small = scratch('pixel-small', sw, sh);
      small.imageSmoothingQuality = 'high';
      small.drawImage(src, 0, 0, sw, sh);
      c.imageSmoothingEnabled = false;
      c.drawImage(small.canvas, 0, 0, W, H);
      break;
    }
    default:
      drawFrame(c);
      if (GPU_EFFECTS.has(fx?.type)) {
        const out = gpuEngine(W, H).renderCanvas(fx.type, c.canvas, tau, A);
        c.drawImage(out, 0, 0);
      }
  }
  c.restore();
}

function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawVignette(ctx, W, H, A) {
  const R = Math.hypot(W / 2, H / 2);
  const g = ctx.createRadialGradient(W / 2, H / 2, P.vignette.inner * R, W / 2, H / 2, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${P.vignette.strength * A})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const SPARK_COLORS = ['255,255,255', '255,243,196', '255,225,240'];

// Twinkling four-point stars at fixed, clip-seeded positions.
export function drawSparkles(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(String(seed));
  const count = Math.round(12 + 48 * A);
  for (let i = 0; i < count; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const size = (0.006 + 0.012 * rand()) * H;
    const freq = 0.6 + 1.4 * rand();
    const phase = rand();
    const color = SPARK_COLORS[Math.floor(rand() * SPARK_COLORS.length)];
    const b = Math.max(0, Math.sin(TAU * (freq * tau + phase))) ** 3;
    if (b < 0.02) continue;
    const L = size * (0.6 + 1.6 * b);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, L);
    glow.addColorStop(0, `rgba(${color},${0.55 * b})`);
    glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - L, y - L, 2 * L, 2 * L);
    ctx.fillStyle = `rgba(${color},${b})`;
    const r = L * 0.14;
    ctx.beginPath();
    ctx.moveTo(x, y - L);
    ctx.lineTo(x + r, y - r);
    ctx.lineTo(x + L, y);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x, y + L);
    ctx.lineTo(x - r, y + r);
    ctx.lineTo(x - L, y);
    ctx.lineTo(x - r, y - r);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSnow(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(`${seed}:snow`);
  const s = Math.min(W, H) / 720;
  const count = Math.round(40 + 160 * A);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < count; i++) {
    const x0 = rand();
    const y0 = rand();
    const speed = 0.05 + 0.1 * rand();
    const r = (1.5 + 2.5 * rand()) * s;
    const sway = 0.01 + 0.02 * rand();
    const f = 0.2 + 0.4 * rand();
    const phase = rand();
    const alpha = 0.6 + 0.35 * rand();
    const y = frac(y0 + speed * tau) * 1.1 - 0.05;
    const x = x0 + sway * Math.sin(TAU * (f * tau + phase));
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x * W, y * H, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const CONFETTI = ['#ff6f91', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ffffff'];

function drawConfetti(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(`${seed}:confetti`);
  const s = Math.min(W, H) / 720;
  const count = Math.round(30 + 120 * A);
  for (let i = 0; i < count; i++) {
    const x0 = rand();
    const y0 = rand();
    const speed = 0.12 + 0.18 * rand();
    const w = (6 + 6 * rand()) * s;
    const spin = (rand() - 0.5) * 8;
    const flip = 2 + 4 * rand();
    const angle0 = rand() * TAU;
    const color = CONFETTI[Math.floor(rand() * CONFETTI.length)];
    const y = frac(y0 + speed * tau) * 1.1 - 0.05;
    const x = x0 + 0.015 * Math.sin(TAU * (0.5 * tau + x0));
    ctx.save();
    ctx.translate(x * W, y * H);
    ctx.rotate(angle0 + spin * tau);
    ctx.scale(1, Math.cos(flip * tau + angle0));
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -w / 4, w, w / 2);
    ctx.restore();
  }
}

function heartPath(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.bezierCurveTo(x, y, x - size * 0.5, y, x - size * 0.5, y + size * 0.3);
  ctx.bezierCurveTo(x - size * 0.5, y + size * 0.6, x, y + size * 0.75, x, y + size);
  ctx.bezierCurveTo(x, y + size * 0.75, x + size * 0.5, y + size * 0.6, x + size * 0.5, y + size * 0.3);
  ctx.bezierCurveTo(x + size * 0.5, y, x, y, x, y + size * 0.3);
  ctx.closePath();
}

function drawHearts(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(`${seed}:hearts`);
  const s = Math.min(W, H) / 720;
  const count = Math.round(8 + 30 * A);
  const colors = ['#ff4d6d', '#ff8fab', '#ffb3c6', '#ff006e'];
  for (let i = 0; i < count; i++) {
    const x0 = rand();
    const y0 = rand();
    const speed = 0.08 + 0.12 * rand();
    const size = (14 + 20 * rand()) * s;
    const color = colors[Math.floor(rand() * colors.length)];
    const phase = rand();
    const p = frac(y0 + speed * tau);
    const y = 1.1 - p * 1.2;
    const x = x0 + 0.03 * Math.sin(TAU * (0.4 * tau + phase));
    ctx.globalAlpha = Math.min(1, 4 * (1 - p)) * 0.9;
    ctx.fillStyle = color;
    heartPath(ctx, x * W, y * H, size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLightLeak(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(`${seed}:leak`);
  const colors = ['255,150,60', '255,90,120', '255,210,120'];
  for (let i = 0; i < 3; i++) {
    const side = rand() < 0.5 ? 0 : 1;
    const speed = 0.03 + 0.05 * rand();
    const phase = rand();
    const pulse = 0.6 + 0.4 * Math.sin(TAU * (0.15 * tau + phase));
    const cx = (side ? 0.9 : 0.1) * W + 0.15 * W * Math.sin(TAU * (speed * tau + phase));
    const cy = (0.2 + 0.6 * rand()) * H + 0.1 * H * Math.cos(TAU * (speed * tau + phase));
    const R = (0.35 + 0.25 * rand()) * W;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, `rgba(${colors[i]},${0.42 * A * pulse})`);
    g.addColorStop(1, `rgba(${colors[i]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawVhs(ctx, seed, tau, W, H, A) {
  const s = Math.min(W, H) / 720;
  ctx.fillStyle = `rgba(0,0,0,${0.18 * A})`;
  for (let y = 0; y < H; y += Math.max(2, Math.round(4 * s))) ctx.fillRect(0, y, W, Math.max(1, Math.round(s)));
  const bandY = (frac(tau * 0.15) * 1.2 - 0.1) * H;
  const g = ctx.createLinearGradient(0, bandY - 0.04 * H, 0, bandY + 0.04 * H);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, `rgba(255,255,255,${0.1 * A})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, bandY - 0.04 * H, W, 0.08 * H);
  const rand = seededRandom(`${seed}:vhs:${Math.floor(tau * 24)}`);
  ctx.fillStyle = `rgba(255,255,255,${0.3 * A})`;
  for (let i = 0; i < Math.round(60 * A); i++) ctx.fillRect(rand() * W, rand() * H, (2 + 10 * rand()) * s, s);
}

// ── Cinema effects: openings and endings, drawn over the picture ──
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Progress (0..1) through the last `span` seconds of a clip, or its first ones.
const endPhase = (tau, duration, span) => {
  const D = Math.min(duration, span);
  return clamp01((tau - (duration - D)) / Math.max(0.01, D));
};
const startPhase = (tau, duration, span) => clamp01(tau / Math.max(0.01, Math.min(duration, span)));

// The end of a film: the black bars close in and the picture fades to a plain black screen.
function drawTheEnd(ctx, tau, duration, W, H, A) {
  const e = endPhase(tau, duration, 6);
  const S = Math.min(W, H);
  const bar = S * (0.06 + 0.1 * A) * smooth(0, 0.35, e);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  const dark = smooth(0.35, 0.75, e);
  if (dark > 0) {
    ctx.globalAlpha = dark;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

// The start of a film: out of black, then the black bars open up.
function drawOpening(ctx, tau, duration, W, H, A) {
  const e = startPhase(tau, duration, 4);
  const dark = 1 - smooth(0, 0.45, e);
  ctx.fillStyle = '#000';
  if (dark > 0) {
    ctx.globalAlpha = dark;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  const bar = Math.min(W, H) * (0.06 + 0.1 * A) * (1 - smooth(0.5, 1, e));
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
}

// Iris: everything outside a circle is black; the circle closes (end) or opens (start).
function drawIris(ctx, open, W, H, cx = W / 2, cy = H / 2) {
  const R = Math.hypot(W, H) * 0.55 * open;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  if (R > 0.5) ctx.arc(cx, cy, R, 0, TAU, true);
  ctx.fill('evenodd');
}

// An old film leader: 3, 2, 1… with the sweeping hand (one number per second, until the clip ends).
function drawCountdown(ctx, tau, duration, W, H, A) {
  const left = Math.max(0, duration - tau);
  const n = Math.min(9, Math.max(1, Math.ceil(left)));
  const sweep = 1 - frac(left);
  ctx.globalAlpha = 0.55 + 0.45 * A;
  ctx.fillStyle = '#8a8378';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.42;
  ctx.fillStyle = 'rgba(40, 36, 30, 0.45)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R * 1.6, -Math.PI / 2, -Math.PI / 2 + TAU * sweep);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f4efe4';
  ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.006);
  for (const r of [R, R * 0.82]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(W, cy);
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, H);
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(Math.min(W, H) * 0.5)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(String(n), cx, cy + Math.min(W, H) * 0.02);
}

// Burns on the film: bright orange spots that bloom and fade, in bursts.
function drawFilmBurn(ctx, seed, tau, W, H, A) {
  const cycle = Math.floor(tau / 2.5);
  const t = frac(tau / 2.5);
  const rand = seededRandom(`${seed}:burn:${cycle}`);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const x = (rand() < 0.5 ? 0.05 + 0.25 * rand() : 0.7 + 0.25 * rand()) * W;
    const y = rand() * H;
    const grow = Math.sin(Math.PI * clamp01((t - 0.15 * i) / 0.7));
    if (grow <= 0) continue;
    const R = (0.25 + 0.35 * rand()) * W * grow;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(255, 245, 220, ${0.9 * A * grow})`);
    g.addColorStop(0.35, `rgba(255, 140, 40, ${0.6 * A * grow})`);
    g.addColorStop(1, 'rgba(160, 30, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Film strip: black bands with sprocket holes running past on both sides.
function drawFilmStrip(ctx, tau, W, H, A) {
  const band = W * (0.045 + 0.035 * A);
  const hole = band * 0.42;
  const pitch = hole * 1.9;
  const off = (tau * pitch * 4) % pitch;
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, band, H);
  ctx.fillRect(W - band, 0, band, H);
  ctx.fillStyle = '#e9e4da';
  for (let y = -pitch + off; y < H + pitch; y += pitch) {
    for (const x of [band / 2, W - band / 2]) {
      ctx.beginPath();
      ctx.roundRect(x - hole / 2, y, hole, hole * 0.75, hole * 0.15);
      ctx.fill();
    }
  }
}

// Camcorder: corner marks, blinking red « REC » and the running time.
function drawRec(ctx, tau, W, H, A) {
  const s = Math.min(W, H) / 720;
  const m = 40 * s;
  const L = 60 * s;
  ctx.strokeStyle = `rgba(255,255,255,${0.75 + 0.25 * A})`;
  ctx.lineWidth = 4 * s;
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * L);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * L, y);
    ctx.stroke();
  }
  ctx.font = `600 ${Math.round(30 * s)}px Consolas, "Courier New", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  if (frac(tau) < 0.6) {
    ctx.fillStyle = '#ff2b2b';
    ctx.beginPath();
    ctx.arc(m + 34 * s, m + 46 * s, 11 * s, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.fillText('REC', m + 56 * s, m + 47 * s);
  const t = Math.floor(tau);
  const tc = `00:${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  ctx.textAlign = 'right';
  ctx.fillText(tc, W - m - 30 * s, m + 47 * s);
  ctx.textAlign = 'left';
  ctx.fillText('▶ HD', m + 30 * s, H - m - 44 * s);
}

// Spotlight: the picture is dark except a soft circle of light that wanders slowly.
function drawSpotlight(ctx, tau, W, H, A) {
  const cx = W * (0.5 + 0.28 * Math.sin(TAU * 0.11 * tau));
  const cy = H * (0.5 + 0.22 * Math.sin(TAU * 0.17 * tau + 1));
  const R = Math.min(W, H) * 0.42;
  const g = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.25);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.55 + 0.4 * A})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawRain(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(`${seed}:rain`);
  const s = Math.min(W, H) / 720;
  const count = Math.round(60 + 240 * A);
  ctx.strokeStyle = 'rgba(200, 220, 255, 0.45)';
  ctx.lineWidth = Math.max(1, 1.4 * s);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x0 = rand() * 1.2;
    const y0 = rand();
    const speed = 1.1 + 0.9 * rand();
    const len = (18 + 22 * rand()) * s;
    const y = (frac(y0 + speed * tau) * 1.2 - 0.1) * H;
    const x = (x0 - 0.1) * W - 0.18 * y;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 0.18 * len, y + len);
  }
  ctx.stroke();
  ctx.fillStyle = `rgba(20, 30, 50, ${0.15 * A})`;
  ctx.fillRect(0, 0, W, H);
}

const BOKEH = ['255,214,140', '255,160,190', '160,210,255', '255,255,230'];
function drawBokeh(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(`${seed}:bokeh`);
  const count = Math.round(10 + 22 * A);
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < count; i++) {
    const x = (rand() + 0.03 * Math.sin(TAU * (0.07 * tau + rand()))) * W;
    const y = (frac(rand() - 0.02 * tau * (0.5 + rand())) * 1.2 - 0.1) * H;
    const R = (0.03 + 0.07 * rand()) * Math.min(W, H);
    const c = BOKEH[Math.floor(rand() * BOKEH.length)];
    const a = (0.18 + 0.25 * rand()) * (0.6 + 0.4 * Math.sin(TAU * (0.3 * tau + rand())));
    const g = ctx.createRadialGradient(x, y, R * 0.6, x, y, R);
    g.addColorStop(0, `rgba(${c},${a})`);
    g.addColorStop(0.85, `rgba(${c},${a * 0.8})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawFireflies(ctx, seed, tau, W, H, A) {
  const rand = seededRandom(`${seed}:flies`);
  const count = Math.round(10 + 40 * A);
  const s = Math.min(W, H) / 720;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const x0 = rand();
    const y0 = 0.3 + 0.7 * rand();
    const fx = 0.05 + 0.1 * rand();
    const fy = 0.04 + 0.08 * rand();
    const ph = rand() * TAU;
    const x = (x0 + 0.06 * Math.sin(TAU * fx * tau + ph)) * W;
    const y = (y0 + 0.05 * Math.sin(TAU * fy * tau + ph * 1.7)) * H;
    const b = Math.max(0, Math.sin(TAU * (0.35 + 0.4 * rand()) * tau + ph)) ** 2;
    if (b < 0.03) continue;
    const R = (10 + 10 * rand()) * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(240, 255, 170, ${0.95 * b})`);
    g.addColorStop(0.25, `rgba(200, 255, 90, ${0.45 * b})`);
    g.addColorStop(1, 'rgba(120, 200, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawOldFilm(ctx, seed, tau, W, H, A) {
  const s = Math.min(W, H) / 720;
  const frame = Math.floor(tau * 24);
  const rand = seededRandom(`${seed}:film:${frame}`);
  ctx.fillStyle = `rgba(0,0,0,${0.1 * A * rand()})`;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < Math.round(400 * A); i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)';
    const d = (1 + rand()) * s;
    ctx.fillRect(rand() * W, rand() * H, d, d);
  }
  ctx.fillStyle = `rgba(30,20,10,${0.35 * A})`;
  const scratches = Math.floor(rand() * 3);
  for (let i = 0; i < scratches; i++) ctx.fillRect(rand() * W, 0, Math.max(1, s), H);
  drawVignette(ctx, W, H, 0.6 * A);
}

// Applies an effect-track item to the whole picture already in ctx: the effect is rendered from a
// copy of the picture, then blended back with the item's fade weight. Used by both the preview and
// the export, so the two always match.
export function applyEffectItem(ctx, W, H, item, tau, weight) {
  const fx = clipEffect(item);
  if (!fx || weight <= 0) return;
  const src = scratch('fx-item-src', W, H);
  src.globalCompositeOperation = 'source-over';
  src.drawImage(ctx.canvas, 0, 0);
  const out = scratch('fx-item-out', W, H);
  renderClipEffect(out, W, H, fx, tau, (c, extra) => {
    c.filter = extra || 'none';
    c.drawImage(src.canvas, 0, 0);
    c.filter = 'none';
  });
  drawEffectOverlay(out, item, tau, W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = weight;
  ctx.drawImage(out.canvas, 0, 0);
  ctx.restore();
}

// Effects drawn on top of the whole picture (after transitions), exactly as the export overlays them.
export function drawEffectOverlay(ctx, clip, tau, W, H) {
  const fx = clipEffect(clip);
  if (!fx) return;
  const A = fx.intensity;
  ctx.save();
  switch (fx.type) {
    case 'vignette':
      drawVignette(ctx, W, H, A);
      break;
    case 'cinema': {
      const bar = Math.round(P.cinema.bar * A * H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      break;
    }
    case 'sparkle':
      drawSparkles(ctx, clip.id, tau, W, H, A);
      break;
    case 'dream':
      drawSparkles(ctx, clip.id, tau, W, H, A * P.dream.sparkle);
      break;
    case 'snow':
      drawSnow(ctx, clip.id, tau, W, H, A);
      break;
    case 'confetti':
      drawConfetti(ctx, clip.id, tau, W, H, A);
      break;
    case 'hearts':
      drawHearts(ctx, clip.id, tau, W, H, A);
      break;
    case 'lightleak':
      drawLightLeak(ctx, clip.id, tau, W, H, A);
      break;
    case 'vhs':
      drawVhs(ctx, clip.id, tau, W, H, A);
      break;
    case 'oldfilm':
      drawOldFilm(ctx, clip.id, tau, W, H, A);
      break;
    case 'theend':
      drawTheEnd(ctx, tau, fx.duration, W, H, A);
      break;
    case 'opening':
      drawOpening(ctx, tau, fx.duration, W, H, A);
      break;
    case 'irisout':
      drawIris(ctx, 1 - smooth(0, 1, endPhase(tau, fx.duration, 1.2 + 1.8 * (1 - A))), W, H);
      break;
    case 'irisin':
      drawIris(ctx, smooth(0, 1, startPhase(tau, fx.duration, 1.2 + 1.8 * (1 - A))), W, H);
      break;
    case 'countdown':
      drawCountdown(ctx, tau, fx.duration, W, H, A);
      break;
    case 'filmburn':
      drawFilmBurn(ctx, clip.id, tau, W, H, A);
      break;
    case 'filmstrip':
      drawFilmStrip(ctx, tau, W, H, A);
      break;
    case 'rec':
      drawRec(ctx, tau, W, H, A);
      break;
    case 'spotlight':
      drawSpotlight(ctx, tau, W, H, A);
      break;
    case 'rain':
      drawRain(ctx, clip.id, tau, W, H, A);
      break;
    case 'bokeh':
      drawBokeh(ctx, clip.id, tau, W, H, A);
      break;
    case 'fireflies':
      drawFireflies(ctx, clip.id, tau, W, H, A);
      break;
    default:
      break;
  }
  ctx.restore();
}
