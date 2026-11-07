import { drawShape, shapeSize } from './stickers.js';
import { T } from './i18n.js';

export const FONTS = [
  'Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Georgia', 'Verdana', 'Trebuchet MS', 'Comic Sans MS', 'Consolas',
  'Times New Roman', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Lucida Console', 'Bahnschrift', 'Franklin Gothic Medium',
];

// Sizes are expressed for the short side of a 1080p picture and scaled to the target canvas.
// x, y: centre of the text block (fractions of the frame); rotation in degrees.
export const DEFAULT_TEXT_STYLE = {
  font: 'Segoe UI',
  size: 72,
  color: '#ffffff',
  bold: true,
  italic: false,
  upper: false,
  align: 'center',
  spacing: 0,
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 0.12,
  box: false,
  boxColor: '#000000',
  boxOpacity: 0.6,
  shadow: false,
  shadowColor: '#000000',
  glow: false,
  glowColor: '#ff4fa3',
  gradient: null,
  bubble: 'none',
  bubbleColor: '#ffffff',
  bubbleBorder: '#111111',
  tail: 'left',
  effect: 'none',
  opacity: 1,
  rotation: 0,
  x: 0.5,
  y: 0.85,
};

export const textStyle = (c) => ({ ...DEFAULT_TEXT_STYLE, ...(c.style || {}) });

// Ready-made looks: they change the appearance, never the position, size or rotation.
export const TEXT_PRESETS = [
  { id: 'classique', name: T('Classique'), style: { font: 'Segoe UI', bold: true, color: '#ffffff', outline: true, outlineColor: '#000000' } },
  { id: 'soustitre', name: T('Sous-titre'), style: { font: 'Segoe UI', bold: true, color: '#ffffff', outline: false, box: true, boxColor: '#000000', boxOpacity: 0.6 } },
  { id: 'jaune', name: T('Jaune vidéo'), style: { font: 'Arial Black', bold: true, color: '#ffe000', outline: true, outlineColor: '#000000', outlineWidth: 0.16, upper: true } },
  { id: 'impact', name: T('Gros titre'), style: { font: 'Impact', bold: false, color: '#ffffff', outline: true, outlineColor: '#000000', outlineWidth: 0.1, upper: true, shadow: true } },
  { id: 'neonrose', name: T('Néon rose'), style: { font: 'Segoe UI', bold: true, color: '#ffe6f3', outline: false, glow: true, glowColor: '#ff2d95' } },
  { id: 'neonbleu', name: T('Néon bleu'), style: { font: 'Bahnschrift', bold: true, color: '#e6fbff', outline: false, glow: true, glowColor: '#22c8ff' } },
  { id: 'bulle', name: T('Bulle'), style: { font: 'Segoe UI', bold: true, color: '#111111', outline: false, box: true, boxColor: '#ffffff', boxOpacity: 1 } },
  { id: 'etiquette', name: T('Étiquette'), style: { font: 'Arial Black', bold: true, color: '#ffffff', outline: false, box: true, boxColor: '#ff3b6b', boxOpacity: 1, upper: true } },
  { id: 'alerte', name: T('Alerte'), style: { font: 'Arial Black', bold: true, color: '#ffffff', outline: false, box: true, boxColor: '#d40000', boxOpacity: 0.95, upper: true, spacing: 0.04 } },
  { id: 'elegant', name: T('Élégant'), style: { font: 'Georgia', bold: false, italic: true, color: '#fff4e0', outline: false, shadow: true, spacing: 0.02 } },
  { id: 'manuscrit', name: T('Manuscrit'), style: { font: 'Segoe Script', bold: false, color: '#ffffff', outline: false, shadow: true } },
  { id: 'coucher', name: T('Coucher de soleil'), style: { font: 'Arial Black', bold: true, color: '#ffd166', gradient: '#ff3d77', outline: false, shadow: true } },
  { id: 'ocean', name: T('Océan'), style: { font: 'Arial Black', bold: true, color: '#a0f0ff', gradient: '#2b6cff', outline: true, outlineColor: '#06213f', outlineWidth: 0.08 } },
  { id: 'or', name: T('Or'), style: { font: 'Georgia', bold: true, color: '#fff2b0', gradient: '#c08a1e', outline: true, outlineColor: '#3a2500', outlineWidth: 0.06, shadow: true } },
  { id: 'retro', name: T('Rétro'), style: { font: 'Impact', bold: false, color: '#ffef5a', outline: true, outlineColor: '#ff3b8d', outlineWidth: 0.14, shadow: true, shadowColor: '#3b0b6b' } },
  { id: 'machine', name: T('Machine à écrire'), style: { font: 'Consolas', bold: false, color: '#f2f2f2', outline: false, box: true, boxColor: '#111111', boxOpacity: 0.75 } },
  { id: 'minimal', name: 'Minimal', style: { font: 'Segoe UI', bold: false, color: '#ffffff', outline: false, shadow: true, spacing: 0.08, upper: true } },
  { id: 'gaming', name: 'Gaming', style: { font: 'Bahnschrift', bold: true, color: '#b6ff3b', outline: true, outlineColor: '#0a2a00', outlineWidth: 0.1, glow: true, glowColor: '#5cff2e', upper: true } },
  { id: 'citation', name: T('Citation'), style: { font: 'Palatino Linotype', bold: false, italic: true, color: '#ffffff', outline: false, box: true, boxColor: '#1d1d2b', boxOpacity: 0.7 } },
  { id: 'bd', name: T('Bande dessinée'), style: { font: 'Comic Sans MS', bold: true, color: '#ffffff', outline: true, outlineColor: '#000000', outlineWidth: 0.18, shadow: true, shadowColor: '#ff3b3b' } },
];

export const TEXT_ANIMS_IN = [
  ['none', T('Aucune')], ['fade', T('Fondu')], ['up', T('Monte')], ['down', T('Descend')], ['left', T('Glisse depuis la gauche')],
  ['right', T('Glisse depuis la droite')], ['pop', T('Pop')], ['zoom', T('Zoom')], ['type', T('Machine à écrire')], ['spin', T('Tourbillon')],
];
export const TEXT_ANIMS_OUT = [
  ['none', T('Aucune')], ['fade', T('Fondu')], ['up', T('Part vers le haut')], ['down', T('Part vers le bas')], ['zoom', T('Zoom')], ['shrink', T('Rétrécit')],
];
export const TEXT_ANIMS_LOOP = [
  ['none', T('Aucune')], ['pulse', T('Pulsation')], ['float', T('Flottement')], ['shake', T('Tremblement')], ['swing', T('Balancement')], ['blink', T('Clignotement')],
];

export const DEFAULT_TEXT_ANIM = { in: 'none', out: 'none', loop: 'none', duration: 0.5 };
export const textAnim = (c) => ({ ...DEFAULT_TEXT_ANIM, ...(c.anim || {}) });
// The spoken word stands out in a subtitle whose words have their times.
export const KARAOKE_MODES = [
  ['color', T('Le mot change de couleur')],
  ['box', T('Le mot sur un fond coloré')],
  ['pop', T('Le mot grossit et change de couleur')],
];
const POP_TIME = 0.12;
export const hasKaraoke = (c) => !!c.karaoke && (c.words?.length ?? 0) > 0;
export function spokenWord(c, tau) {
  if (!hasKaraoke(c) || tau == null) return -1;
  let index = -1;
  for (let i = 0; i < c.words.length && c.words[i].a <= tau; i++) index = i;
  return index;
}
// What changes the picture of a subtitle between two moments: lets the export reuse identical frames.
export function karaokeKey(c, tau) {
  const i = spokenWord(c, tau);
  const growing = c.karaoke?.mode === 'pop' && i >= 0 && tau - c.words[i].a < POP_TIME;
  return `${c.id}:${i}${growing ? `:${Math.round(tau * 1000)}` : ''}`;
}

export const isAnimated = (c) => {
  if (c.sticker === 'progress' || hasKaraoke(c)) return true;
  const a = textAnim(c);
  return a.in !== 'none' || a.out !== 'none' || a.loop !== 'none';
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// The animation state at tau seconds into the clip: offsets in frame fractions, scale, angle,
// opacity, and how much of the text is typed (0..1).
function animState(clip, tau) {
  const a = textAnim(clip);
  const d = Math.max(0.1, Math.min(a.duration, clip.duration / 2));
  const st = { dx: 0, dy: 0, scale: 1, angle: 0, alpha: 1, typed: 1 };
  if (a.in !== 'none' && tau < d) {
    const t = clamp01(tau / d);
    const e = easeOut(t);
    if (a.in === 'fade') st.alpha = e;
    if (a.in === 'up') [st.dy, st.alpha] = [(1 - e) * 0.12, e];
    if (a.in === 'down') [st.dy, st.alpha] = [-(1 - e) * 0.12, e];
    if (a.in === 'left') [st.dx, st.alpha] = [-(1 - e) * 0.3, e];
    if (a.in === 'right') [st.dx, st.alpha] = [(1 - e) * 0.3, e];
    if (a.in === 'pop') [st.scale, st.alpha] = [Math.max(0, easeBack(t)), clamp01(t * 3)];
    if (a.in === 'zoom') [st.scale, st.alpha] = [2.2 - 1.2 * e, e];
    if (a.in === 'type') st.typed = t;
    if (a.in === 'spin') [st.angle, st.scale, st.alpha] = [-(1 - e) * 180, 0.3 + 0.7 * e, e];
  }
  const left = clip.duration - tau;
  if (a.out !== 'none' && left < d) {
    const t = clamp01(1 - left / d);
    const e = t * t;
    if (a.out === 'fade') st.alpha *= 1 - e;
    if (a.out === 'up') [st.dy, st.alpha] = [st.dy - e * 0.12, st.alpha * (1 - e)];
    if (a.out === 'down') [st.dy, st.alpha] = [st.dy + e * 0.12, st.alpha * (1 - e)];
    if (a.out === 'zoom') [st.scale, st.alpha] = [st.scale * (1 + e), st.alpha * (1 - e)];
    if (a.out === 'shrink') st.scale *= 1 - e;
  }
  const w = 2 * Math.PI * tau;
  if (a.loop === 'pulse') st.scale *= 1 + 0.06 * Math.sin(w * 1.5);
  if (a.loop === 'float') st.dy += 0.012 * Math.sin(w * 0.8);
  if (a.loop === 'shake') [st.dx, st.dy] = [st.dx + 0.004 * Math.sin(w * 13), st.dy + 0.004 * Math.cos(w * 17)];
  if (a.loop === 'swing') st.angle += 5 * Math.sin(w * 0.9);
  if (a.loop === 'blink') st.alpha *= 0.55 + 0.45 * Math.cos(w * 1.2);
  return st;
}

function wrap(ctx, paragraph, maxWidth) {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = words[0];
  for (const w of words.slice(1)) {
    if (ctx.measureText(`${line} ${w}`).width <= maxWidth) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  lines.push(line);
  return lines;
}

// Lines and size of a text block (without animation). Used to draw it and to frame it in the preview.
export function layoutText(ctx, clip, W, H) {
  const s = textStyle(clip);
  let text = (clip.text || '').trim();
  if (s.upper) text = text.toLocaleUpperCase('fr-FR');
  // Sizes are for the short side of a 1080p picture, so a text keeps its proportions in any format.
  const px = s.size * (Math.min(W, H) / 1080);
  ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 700 : 400} ${px}px "${s.font}", sans-serif`;
  ctx.letterSpacing = `${s.spacing * px}px`;
  const lines = text ? text.split('\n').flatMap((p) => wrap(ctx, p, W * 0.9)) : [];
  const widths = lines.map((l) => ctx.measureText(l).width);
  const lineH = px * 1.25;
  const pad = s.box ? px * 0.3 : 0;
  return { s, px, lines, widths, lineH, w: Math.max(0, ...widths) + 2 * pad, h: lines.length * lineH, pad };
}

// Speech bubbles drawn behind the whole text block.
export const BUBBLES = [
  ['none', T('Aucune')], ['round', T('Arrondie')], ['speech', 'Dialogue'], ['thought', T('Pensée')], ['shout', T('Cri')],
  ['ellipse', T('Ovale')], ['banner', T('Bannière')], ['tag', T('Étiquette')], ['note', T('Note')],
];

// One-click looks for the letters themselves.
export const TEXT_EFFECTS = [
  ['none', T('Aucun')], ['neon', T('Néon')], ['glitch', 'Glitch'], ['3d', '3D'], ['long', T('Ombre longue')], ['hollow', T('Creux')],
  ['double', T('Double contour')], ['sticker', T('Autocollant')], ['retro', T('Rétro décalé')], ['echo', T('Écho')],
  ['chrome', 'Chrome'], ['fire', T('Feu')], ['ice', T('Glace')], ['rainbow', T('Arc-en-ciel')],
];

// Bubble half-size around a laid-out block (the tail of "speech" and "thought" goes below).
function bubbleSize(L) {
  const s = L.s;
  const hw = L.w / 2 + L.px * (s.bubble === 'ellipse' || s.bubble === 'thought' || s.bubble === 'shout' ? 0.9 : 0.55);
  const hh = L.h / 2 + L.px * (s.bubble === 'ellipse' || s.bubble === 'thought' || s.bubble === 'shout' ? 0.6 : 0.35);
  const scale = s.bubble === 'shout' ? 1.25 : 1;
  const tail = s.bubble === 'speech' || s.bubble === 'thought' ? L.px * 1.1 : 0;
  return { hw, hh, outW: hw * scale + L.px * 0.1, outUp: hh * scale + L.px * 0.1, outDown: hh * scale + tail + L.px * 0.1 };
}

function bubblePaths(ctx, L, hw, hh) {
  const { s, px } = L;
  const side = s.tail === 'right' ? 1 : -1;
  const paths = [];
  const path = (draw) => paths.push(draw);
  if (s.bubble === 'round') path(() => ctx.roundRect(-hw, -hh, 2 * hw, 2 * hh, Math.min(hh, px * 0.5)));
  if (s.bubble === 'speech') {
    path(() => ctx.roundRect(-hw, -hh, 2 * hw, 2 * hh, Math.min(hh, px * 0.6)));
    const tx = side * hw * 0.45;
    path(() => {
      ctx.moveTo(tx - px * 0.35, hh - px * 0.2);
      ctx.lineTo(tx + px * 0.35, hh - px * 0.2);
      ctx.lineTo(tx + side * px * 0.6, hh + px * 1);
      ctx.closePath();
    });
  }
  if (s.bubble === 'ellipse') path(() => ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2));
  if (s.bubble === 'thought') {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = Math.min(hw, hh) * 0.42;
      path(() => ctx.arc(Math.cos(a) * hw * 0.82, Math.sin(a) * hh * 0.78, r, 0, Math.PI * 2));
    }
    path(() => ctx.ellipse(0, 0, hw * 0.85, hh * 0.8, 0, 0, Math.PI * 2));
    path(() => ctx.arc(side * hw * 0.45, hh + px * 0.35, px * 0.28, 0, Math.PI * 2));
    path(() => ctx.arc(side * hw * 0.6, hh + px * 0.85, px * 0.16, 0, Math.PI * 2));
  }
  if (s.bubble === 'shout') {
    path(() => {
      const n = 22;
      for (let i = 0; i <= 2 * n; i++) {
        const a = (i / (2 * n)) * Math.PI * 2;
        const k = i % 2 ? 1.25 : 0.98;
        const x = Math.cos(a) * hw * k;
        const y = Math.sin(a) * hh * k;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
    });
  }
  if (s.bubble === 'banner') {
    const n = px * 0.7;
    path(() => {
      ctx.moveTo(-hw - n, -hh);
      ctx.lineTo(hw + n, -hh);
      ctx.lineTo(hw + n * 0.35, 0);
      ctx.lineTo(hw + n, hh);
      ctx.lineTo(-hw - n, hh);
      ctx.lineTo(-hw - n * 0.35, 0);
      ctx.closePath();
    });
  }
  if (s.bubble === 'tag') {
    path(() => {
      ctx.moveTo(-hw - px * 0.6, 0);
      ctx.lineTo(-hw, -hh);
      ctx.lineTo(hw, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
    });
  }
  if (s.bubble === 'note') path(() => ctx.rect(-hw, -hh, 2 * hw, 2 * hh));
  return paths;
}

// Outline everything first, then fill everything: overlapping parts (tail, cloud puffs) merge cleanly.
function drawBubble(ctx, L) {
  const { s, px } = L;
  if (!s.bubble || s.bubble === 'none') return;
  const { hw, hh } = bubbleSize(L);
  const paths = bubblePaths(ctx, L, hw, hh);
  ctx.save();
  if (s.bubble === 'note') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = px * 0.3;
    ctx.shadowOffsetY = px * 0.12;
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.16);
  ctx.strokeStyle = s.bubbleBorder;
  for (const p of paths) {
    ctx.beginPath();
    p();
    ctx.stroke();
  }
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = s.bubbleColor;
  for (const p of paths) {
    ctx.beginPath();
    p();
    ctx.fill();
  }
  if (s.bubble === 'note') {
    // Folded corner.
    const f = Math.min(hw, hh) * 0.45;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.moveTo(hw - f, hh);
    ctx.lineTo(hw, hh - f);
    ctx.lineTo(hw - f, hh - f);
    ctx.closePath();
    ctx.fill();
  }
  if (s.bubble === 'tag') {
    ctx.fillStyle = s.bubbleBorder;
    ctx.beginPath();
    ctx.arc(-hw - px * 0.05, 0, px * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};

function gradient(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

// tau: seconds since the clip started (animations); without it the text is drawn at rest.
export function drawText(ctx, clip, W, H, tau = null) {
  if (!(clip.text || '').trim()) return;
  ctx.save();
  const L = layoutText(ctx, clip, W, H);
  const { s, px, lines, widths, lineH } = L;
  const st = tau == null ? { dx: 0, dy: 0, scale: 1, angle: 0, alpha: 1, typed: 1 } : animState(clip, tau);
  if (st.alpha <= 0.002 || st.scale <= 0.002) {
    ctx.restore();
    return;
  }
  ctx.globalAlpha = clamp01(s.opacity * st.alpha);
  ctx.translate((s.x + st.dx) * W, (s.y + st.dy) * H);
  ctx.rotate(((s.rotation + st.angle) * Math.PI) / 180);
  ctx.scale(st.scale, st.scale);
  if (clip.sticker) {
    drawShape(ctx, clip.sticker, s.color, px, W, tau == null || !clip.duration ? 0.5 : tau / clip.duration);
    ctx.restore();
    return;
  }
  drawBubble(ctx, L);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.textAlign = s.align;
  const ax = s.align === 'left' ? -L.w / 2 + L.pad : s.align === 'right' ? L.w / 2 - L.pad : 0;
  const fx = s.effect;

  // Typewriter: characters appear one by one across all lines.
  const total = lines.reduce((n, l) => n + l.length, 0);
  let budget = Math.round(total * st.typed);

  // Where the spoken word is: its line, its left edge and its width.
  let spoken = null;
  const spokenIndex = spokenWord(clip, tau);
  if (spokenIndex >= 0) {
    let seen = 0;
    lines.some((full, i) => {
      for (const m of full.matchAll(/\S+/g)) {
        if (seen++ !== spokenIndex) continue;
        const lx = s.align === 'left' ? ax : s.align === 'right' ? ax - widths[i] : -widths[i] / 2;
        spoken = { word: m[0], x: lx + ctx.measureText(full.slice(0, m.index)).width, w: ctx.measureText(m[0]).width, y: -L.h / 2 + lineH * (i + 0.5) };
        return true;
      }
      return false;
    });
  }
  const accent = clip.karaoke?.color || '#ffe000';
  if (spoken && clip.karaoke.mode === 'box') {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(spoken.x - px * 0.14, spoken.y - lineH * 0.46, spoken.w + px * 0.28, lineH * 0.92, px * 0.14);
    ctx.fill();
    ctx.restore();
  }

  lines.forEach((full, i) => {
    const line = full.slice(0, Math.max(0, budget));
    budget -= full.length;
    const y = -L.h / 2 + lineH * (i + 0.5);
    const lw = widths[i];
    const lx = s.align === 'left' ? ax : s.align === 'right' ? ax - lw : -lw / 2;
    const copy = (color, dx, dy, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.fillStyle = color;
      ctx.fillText(line, ax + dx, y + dy);
      ctx.restore();
    };
    if (s.box) {
      const w = widths[i];
      const left = s.align === 'left' ? ax : s.align === 'right' ? ax - w : -w / 2;
      ctx.save();
      ctx.globalAlpha *= s.boxOpacity;
      ctx.fillStyle = s.boxColor;
      const r = px * 0.18;
      ctx.beginPath();
      ctx.roundRect(left - px * 0.3, y - lineH / 2, w + px * 0.6, lineH, r);
      ctx.fill();
      ctx.restore();
    }
    if (!line) return;

    // Layers behind the letters: shadow and the effect's copies.
    if (s.shadow) copy(s.shadowColor, px * 0.06, px * 0.07, 0.75);
    if (fx === 'glitch') {
      copy('#00e5ff', -px * 0.06, 0, 0.9);
      copy('#ff2d6f', px * 0.06, px * 0.02, 0.9);
    }
    if (fx === '3d') {
      const dark = shade(s.color, 0.45);
      for (let k = 10; k >= 1; k--) copy(dark, px * 0.012 * k, px * 0.012 * k);
    }
    if (fx === 'long') for (let k = 24; k >= 1; k--) copy('#000000', px * 0.025 * k, px * 0.025 * k, 0.07);
    if (fx === 'retro') {
      copy('#22c8ff', px * 0.16, px * 0.16);
      copy('#ff3b8d', px * 0.08, px * 0.08);
    }
    if (fx === 'echo') for (const [k, a] of [[3, 0.12], [2, 0.22], [1, 0.38]]) copy(s.color, 0, -px * 0.32 * k, a);
    if (fx === 'sticker') {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = px * 0.18;
      ctx.shadowOffsetY = px * 0.06;
      ctx.lineWidth = px * 0.4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(line, ax, y);
      ctx.restore();
    }
    if (fx === 'double') {
      ctx.lineWidth = px * 0.36;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(line, ax, y);
    }

    // Outline.
    if ((s.outline && s.outlineWidth > 0) || fx === 'double' || fx === 'chrome' || fx === 'ice') {
      ctx.lineWidth = fx === 'double' ? px * 0.18 : fx === 'chrome' || fx === 'ice' ? px * 0.07 : Math.max(1.5, px * s.outlineWidth);
      ctx.strokeStyle = fx === 'chrome' ? '#1d2127' : fx === 'ice' ? '#0b3a6b' : s.outlineColor;
      ctx.strokeText(line, ax, y);
    }

    // Fill colour: plain, gradient, or the effect's own.
    let fill = s.color;
    if (s.gradient) fill = gradient(ctx, 0, y - px / 2, 0, y + px / 2, [s.color, s.gradient]);
    if (fx === 'neon') fill = '#ffffff';
    if (fx === 'chrome') fill = gradient(ctx, 0, y - px / 2, 0, y + px / 2, ['#ffffff', '#9aa3ad', '#f4f6f8', '#4a525c', '#d6dbe0']);
    if (fx === 'fire') fill = gradient(ctx, 0, y - px / 2, 0, y + px / 2, ['#fff6a0', '#ffb21f', '#ff6a12', '#d81b0f']);
    if (fx === 'ice') fill = gradient(ctx, 0, y - px / 2, 0, y + px / 2, ['#ffffff', '#bdf1ff', '#5cc8ff', '#2b6cff']);
    if (fx === 'rainbow') fill = gradient(ctx, lx, 0, lx + lw, 0, ['#ff3b3b', '#ff9f1c', '#ffe600', '#3ddc5a', '#2b9bff', '#9b4dff']);

    // Glow: the style's own, or the effect's colour.
    const glow = fx === 'neon' ? s.color : fx === 'fire' ? '#ff6a12' : fx === 'ice' ? '#5cd6ff' : s.glow ? s.glowColor : null;
    if (glow) {
      ctx.save();
      ctx.shadowColor = glow;
      for (const blur of [px * 0.6, px * 0.3, px * 0.12]) {
        ctx.shadowBlur = blur;
        ctx.fillStyle = fill;
        ctx.fillText(line, ax, y);
      }
      ctx.restore();
    }
    if (fx === 'hollow') {
      ctx.lineWidth = Math.max(1.5, px * 0.06);
      ctx.strokeStyle = fill;
      ctx.strokeText(line, ax, y);
      return;
    }
    ctx.fillStyle = fill;
    ctx.fillText(line, ax, y);
  });
  if (spoken && clip.karaoke.mode !== 'box') {
    const age = tau - clip.words[spokenIndex].a;
    const grow = clip.karaoke.mode === 'pop' ? 1 + 0.08 * Math.min(1, age / POP_TIME) : 1;
    ctx.save();
    ctx.translate(spoken.x + spoken.w / 2, spoken.y);
    ctx.scale(grow, grow);
    ctx.textAlign = 'center';
    if (s.outline && s.outlineWidth > 0) {
      ctx.lineWidth = Math.max(1.5, px * s.outlineWidth);
      ctx.strokeStyle = s.outlineColor;
      ctx.strokeText(spoken.word, 0, 0);
    }
    ctx.fillStyle = accent;
    ctx.fillText(spoken.word, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// Where a text sits in a W×H frame (for the selection box in the preview).
export function textBox(clip, W, H) {
  const ctx = document.createElement('canvas').getContext('2d');
  const L = layoutText(ctx, clip, W, H);
  if (clip.sticker) {
    const { w, h } = shapeSize(clip.sticker, L.px, W);
    return { cx: L.s.x * W, cy: L.s.y * H, w, h: Math.max(h, L.px * 0.3), rotation: L.s.rotation };
  }
  if (L.s.bubble && L.s.bubble !== 'none') {
    // Around the bubble; the box stays centred on the text, so it covers the bubble's lower tail too.
    const b = bubbleSize(L);
    return { cx: L.s.x * W, cy: L.s.y * H, w: 2 * b.outW, h: 2 * Math.max(b.outUp, b.outDown), rotation: L.s.rotation };
  }
  return { cx: L.s.x * W, cy: L.s.y * H, w: L.w + L.px * 0.3, h: L.h, rotation: L.s.rotation };
}

export function renderTextPng(clip, W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  drawText(canvas.getContext('2d'), clip, W, H);
  return canvas.toDataURL('image/png');
}
