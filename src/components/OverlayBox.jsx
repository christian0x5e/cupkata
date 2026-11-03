import { clipTransform, overlayBox } from '../project.js';
import { textBox, textStyle } from '../text.js';
import { transformPatch } from '../keyframes.js';

const SNAP = 0.015;

// What can be moved on the preview: overlays (video lanes above the main track) and texts.
// Each gives its box in canvas pixels, its current values and how to write new ones.
function target(clip, media, W, H, tau) {
  if (clip.track === 'text') {
    const s = textStyle(clip);
    return {
      box: textBox(clip, W, H),
      start: { x: s.x, y: s.y, scale: s.size, rotation: s.rotation },
      limits: [20, 400],
      write: (v) => ({ style: { ...clip.style, x: v.x, y: v.y, size: Math.round(v.scale), rotation: v.rotation } }),
    };
  }
  const tf = clipTransform(clip, tau);
  return {
    box: overlayBox(clip, media.width, media.height, W, H, tau),
    start: { x: tf.x, y: tf.y, scale: tf.scale, rotation: tf.rotation },
    limits: [0.05, 4],
    write: (v) => transformPatch(clip, tau, v),
  };
}

// Drags from a pointer event on the preview: 'move' (centre snaps to the middle lines, Alt: free),
// 'scale' (from a corner), 'rotate' (Shift: 15° steps). `frame` is the canvas's screen rectangle.
export function startTransformDrag(e, clip, mode, frame, W, H, media, dispatch, tau) {
  e.preventDefault();
  e.stopPropagation();
  const k = frame.width / W;
  const { box, start, limits, write } = target(clip, media, W, H, tau);
  const centre = { x: frame.left + box.cx * k, y: frame.top + box.cy * k };
  const p0 = { x: e.clientX, y: e.clientY };
  const dist0 = Math.max(4, Math.hypot(p0.x - centre.x, p0.y - centre.y));
  let started = false;

  const move = (ev) => {
    if (!started) {
      if (Math.hypot(ev.clientX - p0.x, ev.clientY - p0.y) < 2) return;
      started = true;
      dispatch({ type: 'CHECKPOINT' });
    }
    const v = { ...start };
    if (mode === 'move') {
      v.x = start.x + (ev.clientX - p0.x) / frame.width;
      v.y = start.y + (ev.clientY - p0.y) / frame.height;
      if (!ev.altKey && Math.abs(v.x - 0.5) < SNAP) v.x = 0.5;
      if (!ev.altKey && Math.abs(v.y - 0.5) < SNAP) v.y = 0.5;
    } else if (mode === 'scale') {
      const d = Math.hypot(ev.clientX - centre.x, ev.clientY - centre.y);
      v.scale = Math.min(limits[1], Math.max(limits[0], (start.scale * d) / dist0));
    } else {
      let deg = (Math.atan2(ev.clientY - centre.y, ev.clientX - centre.x) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(deg) < 3) deg = 0;
      v.rotation = Math.round(deg * 10) / 10;
    }
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: write(v) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Is the point (canvas pixels) inside this item's (rotated) box?
export function hitTest(clip, media, W, H, px, py, tau) {
  const b = target(clip, media, W, H, tau).box;
  const a = (-b.rotation * Math.PI) / 180;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

// Frame drawn around the selected overlay or text on the preview, with its handles.
// `canvas` is the preview canvas element, `width` its displayed width (kept current by the preview).
export default function OverlayBox({ clip, media, canvas, width, W, H, dispatch, tau }) {
  if (!canvas || !width || (clip.track !== 'text' && !media?.width)) return null;
  const k = width / W;
  const b = target(clip, media, W, H, tau).box;
  const style = {
    left: (b.cx - b.w / 2) * k,
    top: (b.cy - b.h / 2) * k,
    width: b.w * k,
    height: b.h * k,
    transform: `rotate(${b.rotation}deg)`,
  };
  const drag = (mode) => (e) => {
    if (e.button !== 0) return;
    startTransformDrag(e, clip, mode, canvas.getBoundingClientRect(), W, H, media, dispatch, tau);
  };
  return (
    <div
      className={`ov-box ${clip.track === 'text' ? 'text' : ''}`}
      style={style}
      onPointerDown={drag('move')}
      title="Glisse pour déplacer · coins pour la taille · point du haut pour tourner (Maj : par 15°)"
    >
      {['tl', 'tr', 'bl', 'br'].map((h) => (
        <div key={h} className={`ov-handle ${h}`} onPointerDown={drag('scale')} />
      ))}
      <div className="ov-rotate" onPointerDown={drag('rotate')} />
    </div>
  );
}
