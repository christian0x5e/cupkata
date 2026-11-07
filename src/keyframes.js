// Keyframes: values that change along a clip, along a chosen curve between them. Their times are in
// seconds of the clip's source, so they stay on the same picture when the clip is split, trimmed or
// sped up. The export draws animated clips with drawMoved too, so it matches the preview exactly.
import { T } from './i18n.js';
export const TRANSFORM_PROPS = ['scale', 'x', 'y', 'rotation', 'opacity'];
export const KEYFRAME_RANGES = { scale: [0.02, 4], x: [-1, 2], y: [-1, 2], rotation: [-360, 360], opacity: [0, 1], volume: [0, 2] };
export const MAX_KEYFRAMES = 100;

// How a value leaves a keyframe towards the next one. The volume stays on straight lines: the export
// computes it with an FFmpeg expression (electron/media.cjs).
export const KEYFRAME_EASES = [
  { id: 'linear', name: T('Constante') },
  { id: 'in', name: T('Accélère') },
  { id: 'out', name: T('Ralentit') },
  { id: 'inOut', name: T('Douce') },
  { id: 'hold', name: T('Palier') },
];
const CURVES = {
  in: (p) => p * p,
  out: (p) => 1 - (1 - p) * (1 - p),
  inOut: (p) => p * p * (3 - 2 * p),
  hold: (p) => (p < 1 ? 0 : 1),
};

const sourceAt = (c, tau) => (c.in ?? 0) + tau * (c.speed ?? 1);
const clamp = (prop, v) => Math.min(KEYFRAME_RANGES[prop][1], Math.max(KEYFRAME_RANGES[prop][0], v));

export const keyframesOf = (c, prop) => c.keyframes?.[prop] ?? [];
export const isAnimated = (c, prop) => keyframesOf(c, prop).length > 0;
export const hasMotion = (c) => TRANSFORM_PROPS.some((p) => isAnimated(c, p));

// The value at tau seconds from the clip's start (the fallback when the property isn't animated).
export function valueAt(c, prop, tau, fallback) {
  const list = keyframesOf(c, prop);
  if (!list.length) return fallback;
  const t = sourceAt(c, tau);
  if (t <= list[0].t) return list[0].v;
  for (let i = 1; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]];
    if (t <= b.t) {
      const p = (t - a.t) / (b.t - a.t);
      const curve = prop === 'volume' ? null : CURVES[a.ease];
      return a.v + (b.v - a.v) * (curve ? curve(p) : p);
    }
  }
  return list[list.length - 1].v;
}

// Half a frame of the timeline: a click and the value it finds at the playhead count as the same moment.
const closeTo = (c) => (1 / 60) * (c.speed ?? 1);
export const keyframeAt = (c, prop, tau) => keyframesOf(c, prop).find((k) => Math.abs(k.t - sourceAt(c, tau)) < closeTo(c)) ?? null;

// What UPDATE_CLIP needs to set or replace the keyframe of a property at tau.
export function setKeyframe(c, prop, tau, value) {
  const t = sourceAt(c, tau);
  const kept = keyframesOf(c, prop).filter((k) => Math.abs(k.t - t) >= closeTo(c));
  const ease = keyframeAt(c, prop, tau)?.ease;
  const list = [...kept, { t, v: clamp(prop, value), ...(ease ? { ease } : {}) }].sort((a, b) => a.t - b.t);
  return { keyframes: { ...c.keyframes, [prop]: list } };
}

// The curve from the keyframe at tau to the next one.
export function setKeyframeEase(c, prop, tau, ease) {
  const at = keyframeAt(c, prop, tau);
  const list = keyframesOf(c, prop).map((k) => {
    if (k !== at) return k;
    const { ease: _old, ...rest } = k;
    return ease === 'linear' ? rest : { ...rest, ease };
  });
  return { keyframes: { ...c.keyframes, [prop]: list } };
}

export function removeKeyframe(c, prop, tau) {
  const t = sourceAt(c, tau);
  return withList(c, prop, keyframesOf(c, prop).filter((k) => Math.abs(k.t - t) >= closeTo(c)));
}

export const clearKeyframes = (c, prop) => withList(c, prop, []);

function withList(c, prop, list) {
  const keyframes = { ...c.keyframes };
  if (list.length) keyframes[prop] = list;
  else delete keyframes[prop];
  return { keyframes: Object.keys(keyframes).length ? keyframes : null };
}

// The clip now shows another file, where the same moment is `by` seconds further.
export function shiftKeyframes(keyframes, by) {
  if (!keyframes || !by) return keyframes;
  return Object.fromEntries(Object.entries(keyframes).map(([prop, list]) => [prop, list.map((k) => ({ ...k, t: k.t + by }))]));
}

// A freeze frame keeps the values the clip had at that moment.
export function stillKeyframes(c, tau) {
  if (!c.keyframes) return null;
  return Object.fromEntries(Object.keys(c.keyframes).map((prop) => [prop, [{ t: 0, v: valueAt(c, prop, tau, 0) }]]));
}

// Applies new values at tau: animated properties get a keyframe. Overlays keep the others in their
// transform; the main track has no fixed transform, so a value set there is always a keyframe.
export function transformPatch(c, tau, values) {
  const isMain = (c.lane ?? 0) === 0;
  let next = c;
  let transform = c.transform;
  for (const [prop, value] of Object.entries(values)) {
    if (isMain || isAnimated(next, prop)) next = { ...next, ...setKeyframe(next, prop, tau, value) };
    else transform = { ...transform, [prop]: value };
  }
  return { keyframes: next.keyframes ?? null, ...(isMain ? {} : { transform }) };
}

// Draws a main-track picture moved inside the W×H frame, on black. Same formula as an overlay's box.
export function drawMoved(ctx, source, W, H, tf) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawBox(ctx, source, { cx: tf.x * W, cy: tf.y * H, w: W * tf.scale, h: H * tf.scale, rotation: tf.rotation, opacity: tf.opacity });
}

export function drawBox(ctx, source, box) {
  ctx.save();
  ctx.globalAlpha = box.opacity;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(box.cx, box.cy);
  ctx.rotate((box.rotation * Math.PI) / 180);
  ctx.drawImage(source, -box.w / 2, -box.h / 2, box.w, box.h);
  ctx.restore();
}
