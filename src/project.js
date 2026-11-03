import { shiftKeyframes, stillKeyframes, TRANSFORM_PROPS, valueAt } from './keyframes.js';

export const MEDIA_MIME = 'application/x-cupkata-media';
export const MEDIA_LIST_MIME = 'application/x-cupkata-media-list';
export const IMAGE_DEFAULT_DURATION = 5;
const EPS = 1e-6;
const MIN_PART = 0.05;

export const end = (c) => c.start + c.duration;
export const MAX_VOLUME = 2;

export const clipAudio = (c) => ({
  volume: c.volume ?? 1,
  fadeIn: c.fadeIn ?? 0,
  fadeOut: c.fadeOut ?? 0,
  muted: !!c.muted,
});

// Gain at timeline time t: volume shaped by linear fades, clamped so fades never exceed the clip.
export function clipGain(c, t) {
  const a = clipAudio(c);
  if (a.muted) return 0;
  const fi = Math.min(a.fadeIn, c.duration);
  const fo = Math.min(a.fadeOut, c.duration - fi);
  const x = t - c.start;
  let g = valueAt(c, 'volume', x, a.volume);
  if (fi > 0) g *= Math.min(1, Math.max(0, x / fi));
  if (fo > 0) g *= Math.min(1, Math.max(0, (c.duration - x) / fo));
  return g;
}
// Speed: a clip at speed s shows s seconds of its source per second of timeline (0.25× to 4×).
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const clipSpeed = (c) => c.speed ?? 1;
// Source time shown at timeline time t.
export const sourceTime = (c, t) => c.in + (t - c.start) * clipSpeed(c);
export const totalDuration = (clips) => clips.reduce((t, c) => Math.max(t, end(c)), 0);
export const defaultTrack = (m) => (m.type === 'audio' ? 'audio' : 'video');
export const acceptsTrack = (m, track) =>
  track === 'video' ? m.type !== 'audio' : track === 'audio' ? m.hasAudio : false;
export const TEXT_DEFAULT_DURATION = 3;
export const FX_ITEM_DURATION = 3;
export const FX_ITEM_FADE = 0.5;
// Ready-made speed changes: the clip is cut in equal parts of its source, each with its own speed.
export const SPEED_RAMPS = [
  { id: 'rise', label: 'Accélération', speeds: [0.5, 0.75, 1, 1.5, 2, 3] },
  { id: 'fall', label: 'Ralentissement', speeds: [3, 2, 1.5, 1, 0.75, 0.5] },
  { id: 'hero', label: 'Moment fort', speeds: [3, 2, 0.75, 0.4, 0.4, 0.75, 2, 3] },
  { id: 'pulse', label: 'Pulsation', speeds: [2, 0.5, 2, 0.5, 2, 0.5] },
];
const UNFADED_FX = new Set(['theend', 'opening', 'irisout', 'irisin', 'countdown']);

// Weight (0..1) of an effect-track item at time tau since its start: ramps in and out with its fades,
// so consecutive effects blend into each other instead of switching abruptly.
export function effectEnvelope(item, tau) {
  const fi = Math.min(item.fadeIn ?? FX_ITEM_FADE, item.duration / 2);
  const fo = Math.min(item.fadeOut ?? FX_ITEM_FADE, item.duration / 2);
  let w = 1;
  if (fi > 0) w = Math.min(w, tau / fi);
  if (fo > 0) w = Math.min(w, (item.duration - tau) / fo);
  return Math.max(0, Math.min(1, w));
}

export const TRANSITIONS = [
  { id: 'fade', label: 'Fondu enchaîné' },
  { id: 'fadeblack', label: 'Fondu au noir' },
  { id: 'fadewhite', label: 'Flash blanc' },
  { id: 'wipeleft', label: 'Balayage ←' },
  { id: 'wiperight', label: 'Balayage →' },
  { id: 'wipeup', label: 'Balayage ↑' },
  { id: 'wipedown', label: 'Balayage ↓' },
  { id: 'slideleft', label: 'Glissement ←' },
  { id: 'slideright', label: 'Glissement →' },
  { id: 'slideup', label: 'Glissement ↑' },
  { id: 'slidedown', label: 'Glissement ↓' },
  { id: 'circleopen', label: 'Cercle' },
  { id: 'zoomin', label: 'Zoom' },
  { id: 'hblur', label: 'Flou de mouvement' },
];

// Background of a main-track clip where its picture doesn't fill the frame (e.g. a horizontal video
// in a vertical project): black bars, the same picture blurred, the picture zoomed to fill, or a colour.
export const BACKGROUNDS = ['none', 'blur', 'fill', 'color'];
export const clipBackground = (c) => ({
  mode: BACKGROUNDS.includes(c?.background?.mode) ? c.background.mode : 'none',
  blur: c?.background?.blur ?? 0.5,
  color: c?.background?.color || '#000000',
});

export const clipColor = (c) => ({
  brightness: c.color?.brightness ?? 1,
  contrast: c.color?.contrast ?? 1,
  saturation: c.color?.saturation ?? 1,
});

// A transition lives on the incoming clip and only applies when it directly follows another video clip.
// It is centred on the cut: [cut - d/2, cut + d/2], so the timeline length never changes.
export function videoTransitions(clips) {
  const v = clips.filter((c) => c.track === 'video' && laneOf(c) === 0).sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1];
    const b = v[i];
    const tr = b.transition;
    if (!tr?.type || Math.abs(end(a) - b.start) > 1e-3) continue;
    const d = Math.min(tr.duration ?? 1, a.duration, b.duration);
    if (d < 0.05) continue;
    out.push({ a, b, type: tr.type, d, from: b.start - d / 2, to: b.start + d / 2 });
  }
  return out;
}

// Every kind of track can be stacked in as many lanes as needed: lane 0 is the original track, lanes
// 1, 2, … sit above it (below it for sound). Video lanes above the main track are overlays
// (picture-in-picture): each clip there has its own position, size, rotation and opacity.
export const STACKED = ['text', 'fx', 'filter', 'audio', 'video'];
export const laneOf = (c) => c.lane ?? 0;
const onLane = (c, track, lane) => c.track === track && laneOf(c) === (lane ?? 0);
export const isOverlay = (c) => c.track === 'video' && laneOf(c) > 0;

export const DEFAULT_TRANSFORM = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
// A clip that becomes an overlay starts at half size, so the main video stays visible around it.
export const OVERLAY_TRANSFORM = { ...DEFAULT_TRANSFORM, scale: 0.5 };
// tau: seconds from the clip's start, for the values of its keyframes.
export function clipTransform(c, tau) {
  const tf = { ...DEFAULT_TRANSFORM, ...c.transform };
  if (tau == null || !c.keyframes) return tf;
  for (const prop of TRANSFORM_PROPS) tf[prop] = valueAt(c, prop, tau, tf[prop]);
  return tf;
}

// Where an overlay sits in a W×H frame: its source fitted into the frame, times its scale, centred
// on (x, y). The export (electron/media.cjs) computes the same box.
export function overlayBox(c, mw, mh, W, H, tau) {
  const tf = clipTransform(c, tau);
  const fit = Math.min(W / mw, H / mh);
  return { cx: tf.x * W, cy: tf.y * H, w: mw * fit * tf.scale, h: mh * fit * tf.scale, rotation: tf.rotation, opacity: tf.opacity };
}

export function overlaps(clips, track, start, duration, ignoreId, lane) {
  return clips.some(
    (c) => onLane(c, track, lane) && c.id !== ignoreId && start < end(c) - EPS && start + duration > c.start + EPS,
  );
}

// Lowest lane (from `from` up) of a track where [start, start + duration] is free, a new one if all are taken.
export function freeLane(clips, track, start, duration, ignoreId, from = 0) {
  let lane = from;
  while (overlaps(clips, track, start, duration, ignoreId, lane)) lane += 1;
  return lane;
}

// Lanes of each track, renumbered without the empty ones (the main video track always stays lane 0).
export function compactLanes(clips) {
  const used = new Map([['video', new Set([0])]]);
  for (const c of clips) {
    if (!used.has(c.track)) used.set(c.track, new Set());
    used.get(c.track).add(laneOf(c));
  }
  const remap = new Map([...used].map(([t, s]) => [t, new Map([...s].sort((a, b) => a - b).map((l, i) => [l, i]))]));
  if (clips.every((c) => remap.get(c.track).get(laneOf(c)) === laneOf(c))) return clips;
  return clips.map((c) => ({ ...c, lane: remap.get(c.track).get(laneOf(c)) }));
}

export const laneCount = (clips, track) => clips.reduce((n, c) => (c.track === track ? Math.max(n, laneOf(c) + 1) : n), 1);

// Longest a clip may be from its current start: limited by its source file and by the next clip.
export function maxDuration(clip, clips, media) {
  let max = media && media.type !== 'image' && media.duration > 0 ? (media.duration - clip.in) / clipSpeed(clip) : Infinity;
  for (const c of clips) {
    if (onLane(c, clip.track, laneOf(clip)) && c.id !== clip.id && c.start >= end(clip) - EPS) max = Math.min(max, c.start - clip.start);
  }
  return max;
}

// Earliest a clip may start: the end of the previous clip on its lane, and its source's beginning.
export function minStart(clip, clips, media) {
  let min = 0;
  for (const c of clips) {
    if (onLane(c, clip.track, laneOf(clip)) && c.id !== clip.id && end(c) <= clip.start + EPS) min = Math.max(min, end(c));
  }
  if (media && media.type !== 'image') min = Math.max(min, clip.start - clip.in / clipSpeed(clip));
  return min;
}

function firstFreeStart(clips, track, start, duration) {
  let s = Math.max(0, start);
  const sorted = clips.filter((c) => onLane(c, track, 0)).sort((a, b) => a.start - b.start);
  for (const c of sorted) {
    if (s < end(c) - EPS && s + duration > c.start + EPS) s = end(c);
  }
  return s;
}

// Where a new item goes: at the requested time, on the requested lane if it is free there, otherwise on
// the lowest free lane (a new one if needed). Without a requested time it goes after the first lane.
// The main video track keeps its own rule: a new clip goes after the clips already there.
function placeItem(clips, track, action, duration) {
  const mainVideo = track === 'video' && !(action.lane >= 1);
  if (action.start == null || mainVideo) {
    const trackEnd = totalDuration(clips.filter((c) => onLane(c, track, 0)));
    return { start: firstFreeStart(clips, track, action.start ?? trackEnd, duration), lane: 0 };
  }
  const start = Math.max(0, action.start);
  const wanted = action.lane ?? 0;
  const lane = overlaps(clips, track, start, duration, null, wanted)
    ? freeLane(clips, track, start, duration, null, track === 'video' ? 1 : 0)
    : wanted;
  return { start, lane };
}

// selectedId: the clip shown in Propriétés. multi: the clips selected together (2 or more), else empty.
// clipboard: copies of the clips from the last Copy. pasted: where the last paste ended (moves the playhead).
export const initialState = { media: [], clips: [], filters: [], markers: [], selectedId: null, multi: [], clipboard: [], pasted: null, past: [], future: [] };

// "Without effects": the clip as filmed, without effect, filter, colour settings or transition.
const withoutEffects = (c) => ({ ...c, effect: null, filter: null, color: undefined, transition: null });
const isItem = (c) => c.track === 'fx' || c.track === 'filter';

// New copies of clips (at a new start) on their own lane, or another one of their track if it's taken.
function placeCopies(clips, copies) {
  const out = [...clips];
  const ids = [];
  for (const { clip, start, duration } of copies) {
    const lane = clip.track === 'video' && laneOf(clip) === 0 ? 0 : freeLane(out, clip.track, start, duration, null, laneOf(clip));
    const copy = { ...clip, id: crypto.randomUUID(), start, duration, lane };
    out.push(copy);
    ids.push(copy.id);
  }
  return { clips: out, ids };
}

const isMain = (c) => onLane(c, 'video', 0);
const byStart = (a, b) => a.start - b.start;
export const naturalOrder = (a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

// What travels with a main-track clip: the items lying entirely on it (a music or a text longer than
// the clip stays where it is).
export const sitsOn = (x, v) => !isMain(x) && x.start >= v.start - EPS && end(x) <= end(v) + 0.05;

// Gives main-track clips new starts. With link, what sits on them follows; extra (id → shift) moves
// other clips too. A clip that follows lands on a free lane of its track if its own is taken there.
function moveMain(clips, starts, link, extra = new Map()) {
  const shifts = new Map(extra);
  if (link) {
    const mains = clips.filter(isMain);
    for (const x of clips) {
      if (isMain(x) || shifts.has(x.id)) continue;
      const v = mains.find((c) => sitsOn(x, c));
      if (v && starts.has(v.id)) shifts.set(x.id, starts.get(v.id) - v.start);
    }
  }
  for (const [id, shift] of shifts) if (Math.abs(shift) < EPS) shifts.delete(id);
  const out = clips.filter((c) => !shifts.has(c.id)).map((c) => (starts.has(c.id) ? { ...c, start: starts.get(c.id) } : c));
  for (const x of clips) {
    if (!shifts.has(x.id)) continue;
    const start = Math.max(0, x.start + shifts.get(x.id));
    out.push({ ...x, start, lane: freeLane(out, x.track, start, x.duration, x.id, laneOf(x)) });
  }
  return out;
}

// Magnet on the main track: the given clips go, one after the other and in their order, to the place
// nearest to center (or to the given index among the others), and the whole track closes up without a hole.
export function insertMain(base, ids, center, link = true, index = null) {
  const set = new Set(ids);
  const mains = base.filter(isMain).sort(byStart);
  const group = mains.filter((c) => set.has(c.id));
  const rest = mains.filter((c) => !set.has(c.id));
  if (!group.length) return { clips: base, start: 0, index: 0 };
  let at = 0;
  let i = 0;
  for (; i < rest.length; i++) {
    if (index != null ? i >= index : at + rest[i].duration / 2 >= center) break;
    at += rest[i].duration;
  }
  const starts = new Map();
  let cursor = 0;
  for (const c of [...rest.slice(0, i), ...group, ...rest.slice(i)]) {
    starts.set(c.id, cursor);
    cursor += c.duration;
  }
  const shift = at - group[0].start;
  const extra = new Map(base.filter((c) => set.has(c.id) && !isMain(c)).map((c) => [c.id, shift]));
  return { clips: moveMain(base, starts, link, extra), start: at, index: i };
}

// Frees [at, at + span] on the main track: inside a clip it means after that clip, and what follows moves later.
function makeRoomOnMain(clips, time, span, link) {
  const main = clips.filter(isMain).sort(byStart);
  const inside = main.find((c) => time > c.start + EPS && time < end(c) - EPS);
  const at = inside ? end(inside) : time;
  const after = main.filter((c) => c.start >= at - EPS);
  const push = after.length ? Math.max(0, at + span - after[0].start) : 0;
  return { at, clips: push ? moveMain(clips, new Map(after.map((c) => [c.id, c.start + push])), link) : clips };
}

const shuffled = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Selected clips of the same track one right after the other, in the wanted order, from where the first
// one starts. On the main track, what they'd land on moves later (holes elsewhere stay); on other
// tracks they all go to one lane free for the whole sequence.
function alignInSequence(base, ids, sort, link) {
  const set = new Set(ids);
  const mains = base.filter(isMain).sort(byStart);
  const group = mains.filter((c) => set.has(c.id));
  let clips = base;
  if (group.length) {
    const before = mains.filter((c) => !set.has(c.id) && c.start < group[0].start - EPS);
    const first = Math.max(group[0].start, ...before.map(end));
    const starts = new Map();
    let cursor = first;
    for (const c of sort(group)) {
      starts.set(c.id, cursor);
      cursor += c.duration;
    }
    for (const c of mains) {
      if (set.has(c.id) || before.includes(c)) continue;
      const start = Math.max(c.start, cursor);
      starts.set(c.id, start);
      cursor = start + c.duration;
    }
    clips = moveMain(base, starts, link);
  }
  for (const track of STACKED) {
    const items = clips.filter((c) => set.has(c.id) && c.track === track && !isMain(c)).sort((a, b) => a.start - b.start || laneOf(a) - laneOf(b));
    if (!items.length) continue;
    const others = clips.filter((c) => !items.includes(c));
    const span = items.reduce((t, c) => t + c.duration, 0);
    const lane = freeLane(others, track, items[0].start, span, null, laneOf(items[0]));
    let cursor = items[0].start;
    const placed = sort(items).map((c) => {
      const out = { ...c, start: cursor, lane };
      cursor += c.duration;
      return out;
    });
    clips = [...others, ...placed];
  }
  return clips;
}

// New clips of several media, one after the other in the given order: photos and videos on the video
// track, sounds on the audio track. On the main track they're inserted where they're dropped.
function addClips(state, { mediaIds, track, start = null, lane = 0, magnet = true, link = true }) {
  const items = mediaIds.map((id) => state.media.find((m) => m.id === id)).filter((m) => m && !m.missing);
  if (!items.length) return state;
  let clips = state.clips;
  const added = [];
  for (const kind of ['video', 'audio']) {
    const list = items.filter((m) => (track && acceptsTrack(m, track) ? track : defaultTrack(m)) === kind);
    if (!list.length) continue;
    const made = list.map((m) => ({
      id: crypto.randomUUID(), mediaId: m.id, track: kind, lane: 0, start: 0, in: 0,
      duration: m.type === 'image' ? IMAGE_DEFAULT_DURATION : m.duration,
      volume: 1, fadeIn: 0, fadeOut: 0, muted: false,
    }));
    const span = made.reduce((t, c) => t + c.duration, 0);
    const wanted = track === kind ? lane : 0;
    let at;
    let onLaneNow = wanted;
    if (kind === 'video' && !(wanted >= 1)) {
      const trackEnd = totalDuration(clips.filter(isMain));
      if (start == null) at = trackEnd;
      else if (!magnet) ({ at, clips } = makeRoomOnMain(clips, start, span, link));
      else {
        const ids = made.map((c) => c.id);
        let cursor = 0;
        for (const c of made) {
          c.start = trackEnd + cursor;
          cursor += c.duration;
        }
        const result = insertMain([...clips, ...made], ids, start, link);
        clips = result.clips;
        added.push(...ids);
        continue;
      }
    } else {
      at = start ?? totalDuration(clips.filter((c) => onLane(c, kind, 0)));
      onLaneNow = freeLane(clips, kind, at, span, null, wanted);
    }
    let cursor = at;
    for (const c of made) {
      c.start = cursor;
      c.lane = onLaneNow;
      if (kind === 'video' && onLaneNow > 0) c.transform = { ...OVERLAY_TRANSFORM };
      cursor += c.duration;
      added.push(c.id);
    }
    clips = [...clips, ...made];
  }
  return commit(state, clips, { selectedId: added[added.length - 1], multi: added.length >= 2 ? added : [] });
}

export const selectionOf = (state) => (state.multi.length ? state.multi : state.selectedId ? [state.selectedId] : []);

// Changes the length of several clips at once. sizes: id → wanted duration; side: which edge moves.
// ripple: on each lane, what comes after moves so that clips stay one after the other (with link, the
// texts, effects and sounds sitting on a main-track clip follow it). Without ripple, a clip keeps its
// place and can't grow over its neighbour.
export function resizeClips(base, media, sizes, { side = 'end', ripple = false, link = false } = {}) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const out = new Map();
  const lanes = new Map();
  for (const c of base) {
    const key = `${c.track}:${laneOf(c)}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(c);
  }
  const followers = [];
  for (const list of lanes.values()) {
    if (!list.some((c) => sizes.has(c.id))) continue;
    list.sort((a, b) => a.start - b.start);
    let shift = 0;
    list.forEach((c, i) => {
      const shiftHere = shift;
      let next = { start: c.start + shift };
      if (sizes.has(c.id)) {
        const m = byId.get(c.mediaId);
        const timed = m && m.type !== 'image';
        const speed = clipSpeed(c);
        let max = !timed ? Infinity : side === 'end' ? (m.duration - c.in) / speed : c.duration + c.in / speed;
        if (!ripple) {
          if (side === 'end' && list[i + 1]) max = Math.min(max, list[i + 1].start - c.start);
          if (side === 'start') max = Math.min(max, end(c) - (i ? end(list[i - 1]) : 0));
        }
        const duration = Math.max(MIN_PART, Math.min(max, sizes.get(c.id)));
        const cut = c.duration - duration;
        next = { ...next, duration };
        if (side === 'start') {
          if (timed) next.in = c.in + cut * speed;
          if (!ripple) next.start = c.start + cut;
        }
        if (ripple) shift += duration - c.duration;
      }
      out.set(c.id, next);
      if (ripple && link && c.track === 'video' && laneOf(c) === 0 && shiftHere) followers.push([c, shiftHere]);
    });
  }
  if (followers.length) {
    for (const x of base) {
      if (out.has(x.id) || (x.track === 'video' && laneOf(x) === 0)) continue;
      const on = followers.find(([c]) => x.start >= c.start - EPS && x.start < end(c) - EPS);
      if (on) out.set(x.id, { start: Math.max(0, x.start + on[1]) });
    }
  }
  return base.map((c) => (out.has(c.id) ? { ...c, ...out.get(c.id) } : c));
}

// A slideshow's clips on the main video track: the photos in order (or shuffled, reshuffled for each
// round and never the same photo twice in a row), repeated until `until` or for `rounds` rounds.
export function slideshowClips({ mediaIds, photoDuration, start, until = null, rounds = 1, shuffle = false, transition = null, effect = null }, random = Math.random) {
  if (!mediaIds.length || !(photoDuration > 0)) return [];
  const round = () => {
    const list = [...mediaIds];
    if (!shuffle) return list;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const total = until != null ? until - start : photoDuration * mediaIds.length * rounds;
  if (!(total > 0)) return [];
  let count = Math.max(1, Math.ceil(total / photoDuration - 1e-6));
  // A last sliver of photo would just flash: the photo before it stays a little longer instead.
  if (count > 1 && total - (count - 1) * photoDuration < 0.25) count -= 1;
  const order = [];
  while (order.length < count) {
    const next = round();
    if (shuffle && next.length > 1 && next[0] === order[order.length - 1]) next.push(next.shift());
    order.push(...next);
  }
  return order.slice(0, count).map((mediaId, i) => ({
    id: crypto.randomUUID(), mediaId, track: 'video', lane: 0,
    start: start + i * photoDuration, in: 0,
    duration: i === count - 1 ? total - i * photoDuration : photoDuration,
    volume: 1, fadeIn: 0, fadeOut: 0, muted: false,
    ...(transition && i > 0 ? { transition: { ...transition } } : {}),
    ...(effect ? { effect: { ...effect } } : {}),
  }));
}

// ── Cuts driven by a transcript or a beat grid ──

// A subtitle loses the words of a removed part of the timeline (from, to in seconds from its start).
function withoutWords(c, from, to) {
  if (!c.words?.length) return {};
  const removed = to - Math.max(0, from);
  const words = c.words
    .filter((w) => w.b <= from + EPS || w.a >= to - EPS)
    .map((w) => (w.a >= to - EPS ? { ...w, a: w.a - removed, b: w.b - removed } : w));
  return words.length ? { words, text: words.map((w) => w.w).join(' ') } : { words: [] };
}

function cutOne(clips, a, b) {
  const removed = b - a;
  return clips.flatMap((x) => {
    if (end(x) <= a + EPS) return [x];
    if (x.start >= b - EPS) return [{ ...x, start: x.start - removed }];
    const left = a - x.start;
    const right = end(x) - b;
    if (isMain(x)) {
      const parts = [];
      if (left > MIN_PART) parts.push({ ...x, duration: left, fadeOut: 0 });
      if (right > MIN_PART) {
        parts.push({
          ...x, id: parts.length ? crypto.randomUUID() : x.id, start: a, in: x.in + (b - x.start) * clipSpeed(x), duration: right,
          fadeIn: 0, ...(parts.length ? { transition: null } : {}),
        });
      }
      return parts;
    }
    // Music that runs through the cut keeps playing; a sound that starts inside it loses its beginning.
    if (x.track === 'audio' && left > 0 && right > 0) return [x];
    if (left <= MIN_PART && right <= MIN_PART) return [];
    const kept = Math.max(0, left) + Math.max(0, right);
    if (kept <= MIN_PART) return [];
    if (x.track === 'text') {
      const words = withoutWords(x, a - x.start, b - x.start);
      if (words.words && !words.words.length) return [];
      return [{ ...x, ...words, start: Math.min(x.start, a), duration: kept }];
    }
    if (left > 0) return [{ ...x, duration: kept }];
    return [{ ...x, start: a, in: (x.in ?? 0) + (b - x.start) * clipSpeed(x), duration: kept, fadeIn: 0 }];
  });
}

// Removes these parts of the timeline ([from, to] in seconds): the main track closes up and everything
// after follows. Later parts first, so the earlier ones keep their position.
export function cutRanges(clips, ranges) {
  const sorted = [...ranges].sort((x, y) => y[0] - x[0]);
  return sorted.reduce((list, [a, b]) => cutOne(list, a, b), clips);
}

export function cutMarkers(markers, ranges) {
  return markers.flatMap((m) => {
    if (ranges.some(([a, b]) => m.time > a && m.time < b)) return [];
    const before = ranges.filter(([, b]) => b <= m.time).reduce((n, [a, b]) => n + b - a, 0);
    return [before ? { ...m, time: m.time - before } : m];
  });
}

// Cuts the main track at these times, without moving anything.
export function splitMainAt(clips, times) {
  return clips.flatMap((c) => {
    if (!isMain(c)) return [c];
    const inside = times.filter((t) => t > c.start + MIN_PART && t < end(c) - MIN_PART).sort((a, b) => a - b);
    if (!inside.length) return [c];
    const edges = [c.start, ...inside, end(c)];
    return inside.concat(end(c)).map((to, i) => ({
      ...c,
      id: i ? crypto.randomUUID() : c.id,
      start: edges[i],
      in: c.in + (edges[i] - c.start) * clipSpeed(c),
      duration: to - edges[i],
      fadeIn: i ? 0 : c.fadeIn,
      fadeOut: i === inside.length ? c.fadeOut : 0,
      transition: i ? null : c.transition,
    }));
  });
}

// Gives each clip of the main track the length that ends it on the next beat, at least half a beat
// interval away so no clip flashes by. A clip too short to reach it keeps its length. The clips stay
// in order, end to end from the first one's position.
export function fitMainToBeats(clips, media, times) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const main = clips.filter(isMain).sort(byStart);
  if (!main.length) return { clips, fitted: 0 };
  const beats = [...times].sort((a, b) => a - b);
  const gaps = beats.slice(1).map((t, i) => t - beats[i]).sort((a, b) => a - b);
  const shortest = Math.max(MIN_PART, (gaps[gaps.length >> 1] ?? 0) / 2);
  const placed = new Map();
  let cursor = main[0].start;
  let fitted = 0;
  for (const c of main) {
    const m = byId.get(c.mediaId);
    const longest = m?.type === 'image' ? Infinity : ((m?.duration ?? c.in + c.duration) - c.in) / clipSpeed(c);
    const reachable = beats.filter((t) => t >= cursor + shortest && t - cursor <= longest + EPS);
    const next = reachable[0];
    const duration = next != null ? next - cursor : Math.min(c.duration, longest);
    if (next != null) fitted += 1;
    placed.set(c.id, { ...c, start: cursor, duration });
    cursor += duration;
  }
  return { clips: clips.map((c) => placed.get(c.id) ?? c), fitted };
}

// The clips an export of [from, to] needs: the others are left out, so a short part stays quick.
// Transitions borrow picture on both sides of a cut, hence the margin.
const RANGE_MARGIN = 3;
export function clipsForRange(clips, from, to) {
  return clips.filter((c) => c.start < to + RANGE_MARGIN && end(c) > from - RANGE_MARGIN);
}

// One step of the undo history: everything Ctrl+Z brings back together.
const snapshot = ({ clips, filters, markers }) => ({ clips, filters, markers });
const remember = (state) => [...state.past.slice(-99), snapshot(state)];

// Restores a history step; the selection survives only if its clip is still there.
const restore = (state, step, history) => ({
  ...state,
  ...step,
  ...history,
  selectedId: step.clips.some((c) => c.id === state.selectedId) ? state.selectedId : null,
});

function commit(state, clips, extra = {}) {
  return { ...state, ...extra, clips: compactLanes(clips), past: remember(state), future: [] };
}

// Changing the clip in Propriétés (or removing clips) ends a group selection, unless the action set
// one itself; clips that no longer exist leave it.
export function reducer(state, action) {
  const next = applyAction(state, action);
  if (next === state) return state;
  let multi = next.multi;
  if (multi === state.multi && next.selectedId !== state.selectedId) multi = [];
  if (multi.length && next.clips !== state.clips) {
    const ids = new Set(next.clips.map((c) => c.id));
    const kept = multi.filter((id) => ids.has(id));
    if (kept.length !== multi.length) multi = kept.length >= 2 ? kept : [];
  }
  return multi === next.multi ? next : { ...next, multi };
}

function applyAction(state, action) {
  switch (action.type) {
    // A live change during a drag (the history entry is made once at the start, by CHECKPOINT).
    case 'LIVE_CLIPS':
      return { ...state, clips: action.clips };

    case 'ADD_CLIPS':
      return addClips(state, action);

    // The selected clips one after the other, and what else can line them up.
    case 'ALIGN': {
      const ids = new Set(action.ids);
      const link = action.link !== false;
      const nameOf = (c) => state.media.find((m) => m.id === c.mediaId)?.name || c.text || '';
      const sorts = {
        sequence: (l) => l,
        main: (l) => l,
        reverse: (l) => [...l].reverse(),
        name: (l) => [...l].sort((a, b) => naturalOrder(nameOf(a), nameOf(b))),
        shuffle: shuffled,
      };
      if (sorts[action.how]) {
        const base =
          action.how === 'main'
            ? state.clips.map((c) => (ids.has(c.id) && c.track === 'video' && laneOf(c) > 0 ? { ...c, lane: 0, transform: undefined } : c))
            : state.clips;
        return commit(state, alignInSequence(base, action.ids, sorts[action.how], link));
      }
      // Same start, same end or at the playhead: the main track can't stack, so its clips stay and the rest line up.
      const chosen = state.clips.filter((c) => ids.has(c.id));
      const movable = chosen.filter((c) => !isMain(c));
      if (!movable.length) return state;
      const target =
        action.how === 'playhead' ? action.time : action.how === 'starts' ? Math.min(...chosen.map((c) => c.start)) : Math.max(...chosen.map(end));
      let clips = state.clips.filter((c) => !movable.includes(c));
      for (const c of movable) {
        const start = Math.max(0, action.how === 'ends' ? target - c.duration : target);
        clips = [...clips, { ...c, start, lane: freeLane(clips, c.track, start, c.duration, c.id, laneOf(c)) }];
      }
      return commit(state, clips);
    }

    // Main track: the selected clips swap places with their neighbour (dir: -1 or 1).
    case 'MOVE_ORDER': {
      const ids = new Set(action.ids);
      const mains = state.clips.filter(isMain).sort(byStart);
      const first = mains.findIndex((c) => ids.has(c.id));
      if (first < 0) return state;
      const index = first + action.dir;
      const others = mains.filter((c) => !ids.has(c.id)).length;
      if (index < 0 || index > others) return state;
      return commit(state, insertMain(state.clips, action.ids, 0, action.link !== false, index).clips);
    }

    // Alt + arrows: moves the selection a little, unless that would put it on another clip.
    case 'NUDGE': {
      const ids = new Set(action.ids);
      const chosen = state.clips.filter((c) => ids.has(c.id));
      if (!chosen.length) return state;
      const delta = Math.max(-Math.min(...chosen.map((c) => c.start)), action.delta);
      const clips = state.clips.map((c) => (ids.has(c.id) ? { ...c, start: c.start + delta } : c));
      const clash = clips.some((c) => ids.has(c.id) && clips.some((x) => !ids.has(x.id) && x.track === c.track && laneOf(x) === laneOf(c) && c.start < end(x) - EPS && end(c) > x.start + EPS));
      return clash || !delta ? state : commit(state, clips);
    }

    case 'DUPLICATE': {
      const ids = new Set(action.ids);
      const src = state.clips.filter((c) => ids.has(c.id)).sort(byStart);
      if (!src.length) return state;
      const pasted = applyAction({ ...state, clipboard: src }, { type: 'PASTE', time: Math.max(...src.map(end)), link: action.link });
      return { ...pasted, clipboard: state.clipboard, pasted: state.pasted };
    }

    case 'REMOVE_EFFECTS': {
      const ids = new Set(action.ids);
      return commit(state, state.clips.map((c) => (ids.has(c.id) && !isItem(c) && c.track !== 'text' ? withoutEffects(c) : c)));
    }

    // Cuts the sound of the given clips, or brings it back if it's already cut on all of them.
    case 'TOGGLE_MUTE': {
      const ids = new Set(action.ids);
      const hasSound = (c) => ids.has(c.id) && state.media.find((m) => m.id === c.mediaId)?.hasAudio;
      const targets = state.clips.filter(hasSound);
      if (!targets.length) return state;
      const muted = !targets.every((c) => c.muted);
      return commit(state, state.clips.map((c) => (hasSound(c) ? { ...c, muted } : c)));
    }

    case 'COPY': {
      const ids = new Set(action.ids);
      const clipboard = state.clips.filter((c) => ids.has(c.id)).sort((a, b) => a.start - b.start);
      return clipboard.length ? { ...state, clipboard } : state;
    }

    // Paste at the playhead, the clips keeping their spacing. On the main track, inside a clip it goes
    // after that clip, and what follows moves later if there isn't enough room.
    case 'PASTE': {
      const src = action.plain ? state.clipboard.filter((c) => !isItem(c)).map(withoutEffects) : state.clipboard;
      if (!src.length) return state;
      const from = src.reduce((t, c) => Math.min(t, c.start), Infinity);
      const span = src.reduce((t, c) => Math.max(t, end(c)), 0) - from;
      let at = Math.max(0, action.time);
      let base = state.clips;
      if (src.some(isMain)) ({ at, clips: base } = makeRoomOnMain(base, at, span, action.link !== false));
      const { clips, ids } = placeCopies(base, src.map((clip) => ({ clip, start: at + clip.start - from, duration: clip.duration })));
      return commit(state, clips, { selectedId: ids[ids.length - 1], multi: ids.length >= 2 ? ids : [], pasted: { end: at + span } });
    }

    // Repeats the selected clips after themselves, a number of times or until a given time (the last
    // copy is cut to end exactly there). On the main track, what follows moves later.
    case 'REPEAT_SELECTION': {
      const ids = new Set(action.ids);
      const base = action.plain ? state.clips.filter((c) => !(ids.has(c.id) && isItem(c))).map((c) => (ids.has(c.id) ? withoutEffects(c) : c)) : state.clips;
      const chosen = base.filter((c) => ids.has(c.id)).sort((a, b) => a.start - b.start);
      if (!chosen.length) return state;
      const from = chosen[0].start;
      const to = chosen.reduce((t, c) => Math.max(t, end(c)), 0);
      const span = to - from;
      const limit = action.until ?? to + span * (action.times || 1);
      if (!(limit > to + EPS) || !(span > 0)) return state;
      const copies = [];
      for (let round = 1; from + round * span < limit - EPS && copies.length < 5000; round++) {
        for (const clip of chosen) {
          const start = clip.start + round * span;
          const duration = Math.min(clip.duration, limit - start);
          if (duration >= 0.2) copies.push({ clip, start, duration });
          // A last sliver would just flash: the copy before it stays a little longer instead.
          else if (duration > EPS && copies.length) copies[copies.length - 1].duration += duration;
        }
      }
      if (!copies.length) return state;
      const added = copies.reduce((t, c) => Math.max(t, c.start + c.duration), to) - to;
      const pushMain = chosen.some((c) => onLane(c, 'video', 0));
      const shifted = pushMain ? base.map((c) => (onLane(c, 'video', 0) && !ids.has(c.id) && c.start >= to - EPS ? { ...c, start: c.start + added } : c)) : base;
      const placed = placeCopies(shifted, copies);
      const all = [...chosen.map((c) => c.id), ...placed.ids];
      return commit(state, placed.clips, { selectedId: all[all.length - 1], multi: all.length >= 2 ? all : [] });
    }

    // Ctrl+click: adds a clip to the group, or takes it out.
    case 'SELECT_TOGGLE': {
      const now = selectionOf(state);
      const ids = now.includes(action.id) ? now.filter((id) => id !== action.id) : [...now, action.id];
      return { ...state, multi: ids.length >= 2 ? ids : [], selectedId: ids.includes(action.id) ? action.id : ids[ids.length - 1] ?? null };
    }

    case 'SELECT_MANY': {
      const ids = action.ids || [];
      return { ...state, multi: ids.length >= 2 ? ids : [], selectedId: ids[ids.length - 1] ?? null };
    }

    case 'DELETE_MANY': {
      const ids = new Set(action.ids);
      if (!state.clips.some((c) => ids.has(c.id))) return state;
      let clips = state.clips.filter((c) => !ids.has(c.id));
      // Ripple: on the main track, what follows moves back to close the hole.
      if (action.ripple) {
        const gone = state.clips.filter((c) => ids.has(c.id) && isMain(c));
        const starts = new Map();
        for (const c of clips.filter(isMain)) {
          const shift = gone.filter((g) => g.start < c.start).reduce((t, g) => t + g.duration, 0);
          if (shift) starts.set(c.id, c.start - shift);
        }
        clips = moveMain(clips, starts, action.link !== false);
      }
      return commit(state, clips, { selectedId: null, multi: [] });
    }

    // While a group is dragged (the history entry is made once at the start, by CHECKPOINT).
    case 'GROUP_MOVE': {
      const ids = new Set(action.ids);
      const first = action.base.filter((c) => ids.has(c.id)).reduce((m, c) => Math.min(m, c.start), Infinity);
      const delta = Math.max(-first, action.delta);
      const lanes = action.lanes || 0;
      return { ...state, clips: action.base.map((c) => (ids.has(c.id) ? { ...c, start: c.start + delta, lane: laneOf(c) + lanes } : c)) };
    }

    case 'GROUP_TRIM': {
      const sizes = new Map(
        action.base.filter((c) => action.ids.includes(c.id)).map((c) => [c.id, c.duration + (action.side === 'end' ? action.delta : -action.delta)]),
      );
      return { ...state, clips: resizeClips(action.base, state.media, sizes, action) };
    }

    // The same length for all the selected clips.
    case 'SET_DURATIONS': {
      const sizes = new Map(action.ids.map((id) => [id, action.duration]));
      return commit(state, resizeClips(state.clips, state.media, sizes, action));
    }

    // Q / W on a group: each selected clip under the playhead is cut there.
    case 'TRIM_MANY': {
      const hit = state.clips.filter((c) => action.ids.includes(c.id) && action.time > c.start + MIN_PART && action.time < end(c) - MIN_PART);
      if (!hit.length) return state;
      const sizes = new Map(hit.map((c) => [c.id, action.side === 'end' ? action.time - c.start : end(c) - action.time]));
      return commit(state, resizeClips(state.clips, state.media, sizes, { side: action.side, ripple: false }));
    }

    case 'UPDATE_MANY': {
      const ids = new Set(action.ids);
      return { ...state, clips: state.clips.map((c) => (ids.has(c.id) ? { ...c, ...action.patch } : c)) };
    }

    // A slideshow on the main track (with, if asked, a music from the media placed under it).
    case 'ADD_SLIDESHOW': {
      const onMain = state.clips.filter((c) => onLane(c, 'video', 0));
      const start = totalDuration(onMain);
      let clips = state.clips;
      let until = action.until ?? null;
      if (action.loop) {
        const music = state.media.find((m) => m.id === action.musicId);
        if (music) {
          const lane = freeLane(clips, 'audio', start, music.duration);
          clips = [...clips, { id: crypto.randomUUID(), mediaId: music.id, track: 'audio', lane, start, in: 0, duration: music.duration, volume: 1, fadeIn: 0, fadeOut: 0, muted: false }];
        }
        until = totalDuration(clips.filter((c) => c.track === 'audio'));
      }
      const slides = slideshowClips({ ...action, start, until: action.loop ? until : null });
      if (!slides.length) return state;
      return commit(state, [...clips, ...slides], { selectedId: slides[slides.length - 1].id, multi: slides.length >= 2 ? slides.map((c) => c.id) : [] });
    }

    case 'ADD_MEDIA':
      return { ...state, media: [...state.media, ...action.items] };

    case 'LOAD_PROJECT':
      return { ...initialState, media: action.media, clips: action.clips, filters: action.filters || [], markers: action.markers || [] };

    case 'SET_MARKERS': {
      const markers = [...action.markers].sort((a, b) => a.time - b.time);
      if (JSON.stringify(markers) === JSON.stringify(state.markers)) return state;
      return { ...state, markers, past: remember(state), future: [] };
    }

    // The transcribed words of a file, for the part of it that was just listened to.
    case 'SET_WORDS':
      return {
        ...state,
        media: state.media.map((m) => {
          if (m.id !== action.mediaId) return m;
          const kept = (m.words || []).filter((w) => w.e <= action.from || w.t >= action.to);
          return { ...m, words: [...kept, ...action.words].sort((a, b) => a.t - b.t) };
        }),
      };

    case 'CUT_RANGES': {
      if (!action.ranges?.length) return state;
      return commit(state, cutRanges(state.clips, action.ranges), { markers: cutMarkers(state.markers, action.ranges) });
    }


    case 'ADD_FILTER':
      return { ...state, filters: [...state.filters, action.filter], past: remember(state), future: [] };

    // Removes a media file from the project, with the clips that use it. The undo history forgets
    // those clips too: undoing must never bring back a clip whose file is no longer in the project.
    case 'REMOVE_MEDIA': {
      const keep = (clips) =>
        clips
          .filter((c) => c.mediaId !== action.id)
          .map((c) => (c.reversed?.mediaId === action.id ? { ...c, reversed: null } : c));
      return {
        ...state,
        media: state.media.filter((m) => m.id !== action.id),
        clips: compactLanes(keep(state.clips)),
        clipboard: keep(state.clipboard),
        past: state.past.map((step) => ({ ...step, clips: keep(step.clips) })),
        future: state.future.map((step) => ({ ...step, clips: keep(step.clips) })),
        selectedId: state.clips.some((c) => c.id === state.selectedId && c.mediaId === action.id) ? null : state.selectedId,
      };
    }

    case 'RELINK_MEDIA':
      return { ...state, media: state.media.map((m) => (m.id === action.item.id ? action.item : m)) };

    case 'ADD_CLIP': {
      const m = state.media.find((x) => x.id === action.mediaId);
      if (!m) return state;
      const track = action.track || defaultTrack(m);
      if (!acceptsTrack(m, track)) return state;
      const duration = m.type === 'image' ? IMAGE_DEFAULT_DURATION : m.duration;
      const { start, lane } = placeItem(state.clips, track, action, duration);
      const clip = {
        id: crypto.randomUUID(), mediaId: m.id, track, lane, start, in: 0, duration,
        volume: 1, fadeIn: 0, fadeOut: 0, muted: false,
        ...(track === 'video' && lane > 0 ? { transform: { ...OVERLAY_TRANSFORM } } : {}),
      };
      return commit(state, [...state.clips, clip], { selectedId: clip.id });
    }

    case 'ADD_TEXT': {
      const duration = action.duration ?? TEXT_DEFAULT_DURATION;
      const { start, lane } = placeItem(state.clips, 'text', { ...action, start: action.start ?? 0 }, duration);
      const clip = {
        id: crypto.randomUUID(), mediaId: null, track: 'text', lane, start, in: 0, duration,
        text: action.text ?? 'Ton texte', style: { ...action.style }, ...(action.sticker ? { sticker: action.sticker } : {}),
      };
      return commit(state, [...state.clips, clip], { selectedId: clip.id });
    }

    case 'ADD_FX_ITEM': {
      const duration = FX_ITEM_DURATION;
      const { start, lane } = placeItem(state.clips, 'fx', { ...action, start: action.start ?? 0 }, duration);
      const item = {
        id: crypto.randomUUID(), mediaId: null, track: 'fx', lane, start, in: 0, duration,
        effect: { type: action.effectType, intensity: action.intensity ?? 0.7 },
        // Openings and endings already go from or to black: a fade would bring the picture back.
        fadeIn: UNFADED_FX.has(action.effectType) ? 0 : FX_ITEM_FADE,
        fadeOut: UNFADED_FX.has(action.effectType) ? 0 : FX_ITEM_FADE,
      };
      return commit(state, [...state.clips, item], { selectedId: item.id });
    }

    case 'ADD_FILTER_ITEM': {
      const duration = action.duration ?? FX_ITEM_DURATION;
      const { start, lane } = placeItem(state.clips, 'filter', { ...action, start: action.start ?? 0 }, duration);
      const item = {
        id: crypto.randomUUID(), mediaId: null, track: 'filter', lane, start, in: 0, duration,
        filter: { id: action.filterId, amount: action.amount ?? 0.8 },
        fadeIn: action.fade ?? FX_ITEM_FADE, fadeOut: action.fade ?? FX_ITEM_FADE,
      };
      return commit(state, [...state.clips, item], { selectedId: item.id });
    }

    // Moves one edge of a clip to a given time (the playhead, or a typed value).
    case 'TRIM_TO': {
      const c = state.clips.find((x) => x.id === action.id);
      if (!c) return state;
      const media = state.media.find((m) => m.id === c.mediaId);
      let patch;
      if (action.side === 'end') {
        const d = Math.min(action.time - c.start, maxDuration(c, state.clips, media));
        if (!(d >= MIN_PART) || Math.abs(d - c.duration) < EPS) return state;
        patch = { duration: d };
      } else {
        const s = Math.max(action.time, minStart(c, state.clips, media));
        const delta = s - c.start;
        if (Math.abs(delta) < EPS || c.duration - delta < MIN_PART) return state;
        const freeIn = !media || media.type === 'image';
        patch = { start: s, duration: c.duration - delta, in: freeIn ? c.in : c.in + delta * clipSpeed(c) };
      }
      return commit(
        state,
        state.clips.map((x) => (x.id === c.id ? { ...x, ...patch } : x)),
      );
    }

    case 'REPLACE_CLIPS':
      return commit(state, action.clips, { selectedId: null });

    case 'CHECKPOINT':
      return { ...state, past: remember(state), future: [] };

    case 'UPDATE_CLIP':
      return { ...state, clips: state.clips.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };

    // Speed change: the clip keeps the same part of its source, so its length changes. On the main
    // video track the clips after it follow (like CapCut); elsewhere they move only if it now reaches them.
    case 'SET_SPEED': {
      const c = state.clips.find((x) => x.id === action.id);
      if (!c) return state;
      const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, action.speed));
      if (Math.abs(speed - clipSpeed(c)) < 1e-6) return state;
      const duration = (c.duration * clipSpeed(c)) / speed;
      const delta = duration - c.duration;
      const after = state.clips
        .filter((x) => x.id !== c.id && onLane(x, c.track, laneOf(c)) && x.start >= end(c) - EPS)
        .sort((a, b) => a.start - b.start);
      const ripple = c.track === 'video' && laneOf(c) === 0;
      const push = ripple ? delta : after.length ? Math.max(0, c.start + duration - after[0].start) : 0;
      const moved = new Set(push ? after.map((x) => x.id) : []);
      // While a slider is dragged, the history entry is made once at the start (CHECKPOINT).
      const apply = action.live ? (s, clips) => ({ ...s, clips }) : commit;
      return apply(
        state,
        state.clips.map((x) =>
          x.id === c.id
            ? { ...x, speed, duration, fadeIn: Math.min(x.fadeIn ?? 0, duration), fadeOut: Math.min(x.fadeOut ?? 0, duration) }
            : moved.has(x.id)
              ? { ...x, start: Math.max(0, x.start + push) }
              : x,
        ),
      );
    }

    case 'SPEED_RAMP': {
      const c = state.clips.find((x) => x.id === action.id);
      if (!c || !action.speeds?.length) return state;
      const part = (c.duration * clipSpeed(c)) / action.speeds.length;
      let at = c.start;
      const pieces = action.speeds.map((raw, i) => {
        const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, raw));
        const piece = {
          ...c,
          id: i ? crypto.randomUUID() : c.id,
          start: at,
          in: c.in + part * i,
          speed,
          duration: part / speed,
          fadeIn: i ? 0 : c.fadeIn,
          fadeOut: i === action.speeds.length - 1 ? c.fadeOut : 0,
          ...(i ? { transition: undefined } : {}),
        };
        at += piece.duration;
        return piece;
      });
      const delta = at - end(c);
      const after = state.clips
        .filter((x) => x.id !== c.id && onLane(x, c.track, laneOf(c)) && x.start >= end(c) - EPS)
        .sort((a, b) => a.start - b.start);
      const ripple = c.track === 'video' && laneOf(c) === 0;
      const push = ripple ? delta : after.length ? Math.max(0, at - after[0].start) : 0;
      const moved = new Set(push ? after.map((x) => x.id) : []);
      return commit(state, state.clips.flatMap((x) => {
        if (x.id === c.id) return pieces;
        return moved.has(x.id) ? [{ ...x, start: Math.max(0, x.start + push) }] : [x];
      }), { selectedId: c.id, multi: [] });
    }

    // Freeze frame: the video clip is cut at `time` and a still of that frame (already extracted to
    // `mediaId`) is inserted there; everything that starts after it moves later by the still's length.
    case 'FREEZE': {
      const c = state.clips.find((x) => x.id === action.id);
      const t = action.time;
      if (!c || !(t > c.start + MIN_PART && t < end(c) - MIN_PART)) return state;
      const d = action.duration;
      const left = t - c.start;
      const still = {
        id: crypto.randomUUID(), mediaId: action.mediaId, track: c.track, lane: laneOf(c), start: t, in: 0, duration: d,
        volume: 1, fadeIn: 0, fadeOut: 0, muted: false,
        color: c.color, filter: c.filter, transform: c.transform, keyframes: stillKeyframes(c, left),
      };
      const clips = state.clips.flatMap((x) => {
        if (x.id === c.id) {
          return [
            { ...x, duration: left, fadeOut: 0 },
            still,
            { ...x, id: crypto.randomUUID(), start: t + d, in: x.in + left * clipSpeed(x), duration: x.duration - left, fadeIn: 0, transition: null },
          ];
        }
        return x.start >= t - EPS ? [{ ...x, start: x.start + d }] : [x];
      });
      return commit(state, clips, { selectedId: still.id });
    }

    // Reverse: the clip now plays a reversed copy of the part of the source it used (or the original back).
    case 'SET_SOURCE': {
      const c = state.clips.find((x) => x.id === action.id);
      if (!c) return state;
      // extra: what to remember to go back (reversed / cutout); without it, the reverse state is set.
      const extra = action.extra ?? { reversed: action.reversed };
      return commit(state, state.clips.map((x) => (x.id === c.id ? { ...x, mediaId: action.mediaId, in: action.in, keyframes: shiftKeyframes(x.keyframes, action.in - x.in), ...extra } : x)));
    }

    // Cut out the silences: the clip becomes its spoken parts, one after the other (keep: ranges in
    // seconds from the clip's start). On its lane, what came after it moves back by the time removed.
    case 'CUT_SILENCES': {
      const c = state.clips.find((x) => x.id === action.id);
      const keep = (action.keep || []).filter(([a, b]) => b - a > 0.05 && a >= 0 && b <= c?.duration + EPS);
      if (!c || !keep.length) return state;
      let cursor = c.start;
      const parts = keep.map(([a, b], i) => {
        const part = {
          ...c,
          id: i === 0 ? c.id : crypto.randomUUID(),
          start: cursor,
          in: c.in + a * clipSpeed(c),
          duration: b - a,
          fadeIn: i === 0 ? c.fadeIn : 0,
          fadeOut: i === keep.length - 1 ? c.fadeOut : 0,
          transition: i === 0 ? c.transition : null,
        };
        cursor += b - a;
        return part;
      });
      const removed = c.duration - (cursor - c.start);
      const clips = state.clips.flatMap((x) => {
        if (x.id === c.id) return parts;
        if (onLane(x, c.track, laneOf(c)) && x.start >= end(c) - EPS) return [{ ...x, start: Math.max(0, x.start - removed) }];
        return [x];
      });
      return commit(state, clips, { selectedId: c.id });
    }

    // After a drag: lanes left empty disappear (no history entry, the drag already made one).
    case 'COMPACT_LANES':
      return { ...state, clips: compactLanes(state.clips) };

    case 'DELETE':
      if (!state.clips.some((c) => c.id === action.id)) return state;
      return commit(state, state.clips.filter((c) => c.id !== action.id), { selectedId: null });

    case 'SPLIT': {
      const t = action.time;
      const inside = (c) => t > c.start + MIN_PART && t < end(c) - MIN_PART;
      const chosen = selectionOf(state);
      const selected = state.clips.filter((c) => chosen.includes(c.id) && inside(c));
      const targets = selected.length ? selected : state.clips.filter(inside);
      if (!targets.length) return state;
      const ids = new Set(targets.map((c) => c.id));
      const clips = state.clips.flatMap((c) => {
        if (!ids.has(c.id)) return [c];
        const left = t - c.start;
        if (c.words?.length) {
          // A subtitle's words go with their half, and its text follows them.
          const before = c.words.filter((w) => w.a < left);
          const after = c.words.filter((w) => w.a >= left).map((w) => ({ ...w, a: w.a - left, b: w.b - left }));
          const part = (words) => (words.length ? { words, text: words.map((w) => w.w).join(' ') } : { words: undefined });
          return [
            { ...c, ...part(before), duration: left, fadeOut: 0 },
            { ...c, ...part(after), id: crypto.randomUUID(), start: t, duration: c.duration - left, fadeIn: 0 },
          ];
        }
        return [
          { ...c, duration: left, fadeOut: 0 },
          { ...c, id: crypto.randomUUID(), start: t, in: c.in + left * clipSpeed(c), duration: c.duration - left, fadeIn: 0, transition: null },
        ];
      });
      return commit(state, clips);
    }

    case 'SELECT':
      return { ...state, selectedId: action.id };

    case 'UNDO': {
      if (!state.past.length) return state;
      return restore(state, state.past[state.past.length - 1], {
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
      });
    }

    case 'REDO': {
      if (!state.future.length) return state;
      return restore(state, state.future[0], {
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
      });
    }

    default:
      return state;
  }
}
