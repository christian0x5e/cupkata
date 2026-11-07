// Stickers and shapes live on the text track: they move, resize, animate and export like a text.
// Sizes follow the style's size (px), so they keep their proportions in any format.
import { T } from './i18n.js';
export const SHAPES = [
  { id: 'arrow', name: T('Flèche') },
  { id: 'ring', name: T('Cercle') },
  { id: 'frame', name: T('Cadre') },
  { id: 'band', name: T('Bandeau') },
  { id: 'line', name: T('Trait') },
  { id: 'star', name: T('Étoile') },
  { id: 'heart', name: T('Cœur') },
  { id: 'progress', name: T('Barre de progression') },
];
export const STICKER_IDS = SHAPES.map((s) => s.id);
export const EMOJIS = ['🔥', '😂', '😍', '😱', '👍', '👉', '❤️', '⭐', '✅', '❌', '💯', '🎉', '💡', '⚠️', '🎵', '🚀'];

// Width and height of a shape; the progress bar spans the frame.
export function shapeSize(kind, px, W) {
  if (kind === 'arrow') return { w: px * 2.4, h: px * 1.2 };
  if (kind === 'frame') return { w: px * 3.2, h: px * 2 };
  if (kind === 'band') return { w: px * 5, h: px };
  if (kind === 'line') return { w: px * 4, h: px * 0.12 };
  if (kind === 'progress') return { w: W * 0.9, h: px * 0.22 };
  return { w: px * 2, h: px * 2 };
}

function star(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  ctx.closePath();
}

function heart(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.85, -r * 0.95, 0, -r * 0.35);
  ctx.bezierCurveTo(r * 0.85, -r * 0.95, r * 1.25, r * 0.05, 0, r * 0.85);
  ctx.closePath();
}

// Drawn around (0, 0). progress: how far the clip has played (0..1), for the progress bar.
export function drawShape(ctx, kind, color, px, W, progress) {
  const { w, h } = shapeSize(kind, px, W);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (kind === 'arrow') {
    const body = h * 0.32;
    const head = w * 0.42;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -body / 2);
    ctx.lineTo(w / 2 - head, -body / 2);
    ctx.lineTo(w / 2 - head, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(w / 2 - head, h / 2);
    ctx.lineTo(w / 2 - head, body / 2);
    ctx.lineTo(-w / 2, body / 2);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'ring') {
    ctx.lineWidth = px * 0.14;
    ctx.beginPath();
    ctx.arc(0, 0, w / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'frame') {
    ctx.lineWidth = px * 0.12;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + ctx.lineWidth / 2, -h / 2 + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, px * 0.12);
    ctx.stroke();
  } else if (kind === 'band') {
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, px * 0.14);
    ctx.fill();
  } else if (kind === 'line') {
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
  } else if (kind === 'star') {
    star(ctx, w / 2);
    ctx.fill();
  } else if (kind === 'heart') {
    heart(ctx, w / 2);
    ctx.fill();
  } else if (kind === 'progress') {
    ctx.save();
    ctx.globalAlpha *= 0.3;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.restore();
    const done = w * Math.min(1, Math.max(0, progress));
    if (done > 0) {
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, done, h, Math.min(h, done) / 2);
      ctx.fill();
    }
  }
}
