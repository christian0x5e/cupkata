import { useEffect, useMemo, useRef, useState } from 'react';
import { clipAudio, clipSpeed, MAX_VOLUME, end, freeLane, insertMain, laneCount, laneOf, overlaps, sitsOn, totalDuration, videoTransitions, MEDIA_LIST_MIME, MEDIA_MIME, OVERLAY_TRANSFORM, selectionOf, STACKED, TRANSITIONS } from '../project.js';
import { formatShort, formatTime } from '../format.js';
import { clipEffect, EFFECTS } from '../effects.js';
import Waveform from './Waveform.jsx';

// Small diamonds on a clip, where it has keyframes.
function KeyframeMarks({ clip, pps }) {
  const speed = clip.speed ?? 1;
  const times = new Set(Object.values(clip.keyframes || {}).flat().map((k) => (k.t - clip.in) / speed));
  return [...times].filter((tau) => tau >= 0 && tau <= clip.duration).map((tau) => <span key={tau} className="kf-mark" style={{ left: tau * pps }} />);
}
import { EFFECT_MIME } from './EffectsPanel.jsx';
import { FILTER_MIME } from './FiltersPanel.jsx';
import { filterInfo } from '../filters.js';
import { DEFAULT_INTENSITY } from '../effects.js';

const SNAP_PX = 8;
const TRACKS = [
  { id: 'text', label: 'Texte' },
  { id: 'fx', label: 'Effets' },
  { id: 'filter', label: 'Filtres' },
  { id: 'video', label: 'Vidéo' },
  { id: 'audio', label: 'Audio' },
];

function tickStep(pps) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s * pps >= 70) return s;
  return 600;
}

const isMainClip = (c) => c.track === 'video' && laneOf(c) === 0;

export default function Timeline({ state, dispatch, time, playing, onSeek, pps, setPps, onOpenSubtitles, onToggleMarker, onTrim, peaks, onHover, onVoiceover, zone, onZone, onFreeze, magnet, setMagnet, link, setLink }) {
  const { clips, media, selectedId, past, future } = state;
  const chosen = useMemo(() => new Set(selectionOf(state)), [state.multi, selectedId]);
  const [marquee, setMarquee] = useState(null);
  const [naming, setNaming] = useState(null);
  const mediaById = useMemo(() => Object.fromEntries(media.map((m) => [m.id, m])), [media]);
  const contentRef = useRef(null);
  const scrollRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const total = totalDuration(clips);
  // While a clip is dragged, the timeline never gets narrower: shrinking it would make the browser
  // pull the scroll position back, which the drag would read as a pointer movement.
  const [dragWidth, setDragWidth] = useState(0);
  const [guide, setGuide] = useState(null);
  // While clips make room for a dragged one: its outline under the mouse, and the clips in their slots.
  const [ghost, setGhost] = useState(null);
  const [menu, setMenu] = useState(null);
  const magnetRef = useRef(magnet);
  magnetRef.current = magnet;
  const [snapOn, setSnapOn] = useState(true);
  const snapRef = useRef(snapOn);
  snapRef.current = snapOn;
  const linkRef = useRef(link);
  linkRef.current = link;
  const [axis, setAxis] = useState(true);
  const [hover, setHover] = useState(null);
  const hoverFrame = useRef(0);

  // Fade handles: drag the round dot at the top of a clip to set how long the sound (or the
  // filter / effect of a track item) takes to come in or to go out.
  function startFade(e, clip, side) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dispatch({ type: 'SELECT', id: clip.id });
    const x0 = e.clientX;
    const item = clip.track === 'fx' || clip.track === 'filter';
    const fi0 = clip.fadeIn ?? 0;
    const fo0 = clip.fadeOut ?? 0;
    let started = false;
    const move = (ev) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 2) return;
        dispatch({ type: 'CHECKPOINT' });
        started = true;
      }
      const dx = (ev.clientX - x0) / pps;
      const round = (v) => Math.round(v * 10) / 10;
      if (side === 'in') {
        const max = item ? clip.duration / 2 : clip.duration - fo0;
        const fi = Math.min(max, Math.max(0, round(fi0 + dx)));
        dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { fadeIn: fi } });
        setGuide({ time: clip.start + fi, label: `Fondu d'entrée ${fi.toFixed(1).replace('.', ',')} s` });
      } else {
        const max = item ? clip.duration / 2 : clip.duration - fi0;
        const fo = Math.min(max, Math.max(0, round(fo0 - dx)));
        dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { fadeOut: fo } });
        setGuide({ time: clip.start + clip.duration - fo, label: `Fondu de sortie ${fo.toFixed(1).replace('.', ',')} s` });
      }
    };
    const up = () => {
      setGuide(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const fadeHandles = (c, fi, fo) => (
    <>
      <div
        className="fade-handle in"
        style={{ left: Math.max(4, fi * pps) }}
        onPointerDown={(e) => startFade(e, c, 'in')}
        title="Tire vers la droite pour faire monter le son en douceur au début"
      />
      <div
        className="fade-handle out"
        style={{ right: Math.max(4, fo * pps) }}
        onPointerDown={(e) => startFade(e, c, 'out')}
        title="Tire vers la gauche pour faire baisser le son en douceur à la fin"
      />
    </>
  );
  const width = Math.max((total + 20) * pps, 30 * pps, dragWidth);
  const transitions = useMemo(() => videoTransitions(clips), [clips]);
  // One row per lane: stacked lanes of texts, effects, filters and overlays grow upwards, sound lanes
  // downwards. Above the video lanes, an empty "+ Incrustation" row takes a new overlay.
  const rows = useMemo(
    () =>
      TRACKS.flatMap((t) => {
        const n = laneCount(clips, t.id);
        const lanes = Array.from({ length: n }, (_, i) => i);
        if (t.id !== 'audio') lanes.reverse();
        const label = (lane) => (t.id === 'video' ? (lane ? `Incrust. ${lane}` : t.label) : lane ? `${t.label} ${lane + 1}` : t.label);
        const out = lanes.map((lane) => ({ ...t, lane, label: label(lane), overlay: t.id === 'video' && lane > 0 }));
        if (t.id === 'video') out.unshift({ ...t, lane: n, label: '+ Incrust.', overlay: true, ghost: true });
        return out;
      }),
    [clips],
  );
  const xToTime = (clientX) => Math.max(0, (clientX - contentRef.current.getBoundingClientRect().left) / pps);

  useEffect(() => {
    const el = scrollRef.current;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setPps((p) => Math.min(400, Math.max(5, p * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setPps]);

  const zoomToFit = () => {
    const sc = scrollRef.current;
    setPps(Math.min(400, Math.max(5, (sc.clientWidth - 40) / Math.max(1, total))));
    sc.scrollLeft = 0;
  };
  const zoomRef = useRef(zoomToFit);
  zoomRef.current = zoomToFit;

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        zoomRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Preview axis: the moment under the mouse is sent to the preview (once per frame), and cleared
  // when the mouse leaves, a button is held (dragging), playback runs or the axis is turned off.
  const showHover = (t) => {
    cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => {
      setHover(t);
      onHover?.(t);
    });
  };
  useEffect(() => {
    if (!axis || playing) showHover(null);
  }, [axis, playing]);

  useEffect(() => {
    if (!playing) return;
    const sc = scrollRef.current;
    const x = time * pps;
    if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = x - 40;
  }, [time, playing, pps]);

  function startDrag(e, clip, mode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // The outermost pixels of a clip (its border, outside the handles) also trim it.
    if (mode === 'move') {
      const b = e.currentTarget.getBoundingClientRect();
      if (b.width > 16 && e.clientX >= b.right - 3) mode = 'trim-r';
      else if (b.width > 16 && e.clientX <= b.left + 3) mode = 'trim-l';
    }
    // Ctrl + click: add to the group (or take out). Shift + click: everything between on this lane.
    if (e.ctrlKey || e.metaKey) {
      dispatch({ type: 'SELECT_TOGGLE', id: clip.id });
      return;
    }
    const nowSelected = selectionOf(stateRef.current);
    if (e.shiftKey && mode === 'move') {
      const anchor = stateRef.current.clips.find((c) => c.id === stateRef.current.selectedId);
      if (anchor && anchor.track === clip.track && laneOf(anchor) === laneOf(clip)) {
        const from = Math.min(anchor.start, clip.start);
        const to = Math.max(anchor.start, clip.start);
        const ids = stateRef.current.clips.filter((c) => c.track === clip.track && laneOf(c) === laneOf(clip) && c.start >= from && c.start <= to).map((c) => c.id);
        dispatch({ type: 'SELECT_MANY', ids });
        return;
      }
    }
    if (nowSelected.length >= 2 && nowSelected.includes(clip.id)) {
      startGroupDrag(e, clip, mode, nowSelected);
      return;
    }
    dispatch({ type: 'SELECT', id: clip.id });
    // With the magnet, trimming a main-track clip moves what follows, so the track never has a hole.
    if (mode !== 'move' && magnetRef.current && !e.altKey && isMainClip(clip)) {
      startGroupDrag(e, clip, mode, [clip.id]);
      return;
    }

    const others = stateRef.current.clips.filter((c) => c.id !== clip.id);
    const laneClips = (lane) => others.filter((c) => c.track === clip.track && laneOf(c) === lane);
    const sameTrack = laneClips(laneOf(clip));
    let curLane = laneOf(clip);
    // Dragging up or down moves an item to another lane of its track; past the last lane, onto a new one.
    const laneAt = (y) => {
      if (!STACKED.includes(clip.track)) return 0;
      const rows = [...contentRef.current.querySelectorAll(`.tl-track[data-kind="${clip.track}"]`)].map((r) => [
        Number(r.dataset.lane),
        r.getBoundingClientRect(),
      ]);
      const hit = rows.find(([, r]) => y >= r.top - 3 && y <= r.bottom + 3);
      if (hit) return hit[0];
      const top = Math.min(...rows.map(([, r]) => r.top));
      const bottom = Math.max(...rows.map(([, r]) => r.bottom));
      const beyond = clip.track === 'audio' ? y > bottom : clip.track !== 'video' && y < top;
      return beyond ? rows.length : curLane;
    };
    // Linkage: the texts, effects, filters and sounds that start on a video clip travel with it.
    const attached = (v) => others.filter((c) => sitsOn(c, v));
    const linked = linkRef.current && mode === 'move' && clip.track === 'video' && laneOf(clip) === 0 ? attached(clip) : [];
    const linkedIds = new Set(linked.map((c) => c.id));
    const snaps = snapRef.current ? [0, time, ...others.filter((c) => !linkedIds.has(c.id)).flatMap((c) => [c.start, end(c)])] : [];
    // Text clips have no source media: like photos, their length is free.
    const m = mediaById[clip.mediaId] || { type: 'image' };
    const x0 = e.clientX;
    const y0 = e.clientY;
    const sc = scrollRef.current;
    const scroll0 = sc.scrollLeft;
    setDragWidth(contentRef.current.scrollWidth);
    let started = false;
    let lastEvent = null;
    let raf = 0;
    // Magnet on the main track: the other clips open up for the dragged one as it goes over them.
    const base = stateRef.current.clips;
    const asMain = base.map((c) => (c.id === clip.id ? { ...c, lane: 0 } : c));
    let slot = null;
    const row = contentRef.current.querySelector('.tl-track[data-kind="video"][data-lane="0"]').getBoundingClientRect();
    const box = contentRef.current.getBoundingClientRect();

    const snap = (v) => {
      let best = v;
      let dist = SNAP_PX / pps;
      for (const s of snaps) {
        if (Math.abs(s - v) < dist) {
          dist = Math.abs(s - v);
          best = s;
        }
      }
      return best;
    };
    // The guide line follows the edge being moved and lights up when it is aligned on something.
    const isAligned = (t) => snaps.some((s) => Math.abs(s - t) < 1e-6);
    const showGuide = (t) => setGuide({ time: t, snapped: isAligned(t) });
    const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
    // A main-track clip moved up onto an overlay lane gets the overlay's default size and place.
    const becomesOverlay = (lane) => (clip.track === 'video' && lane > 0 && !clip.transform ? { transform: { ...OVERLAY_TRANSFORM } } : {});

    // Magnet (video and audio tracks, Alt held = place freely): on release, a moved clip sticks to the
    // end of the clip it now comes after, and the clips after it slide right if it lands on them.
    const magnetic = (ev) =>
      magnetRef.current && !ev?.altKey && ((clip.track === 'video' && curLane === 0) || clip.track === 'audio');
    function attachPlan(s, lane) {
      const mid = s + clip.duration / 2;
      const neighbours = laneClips(lane);
      const before = neighbours.filter((c) => c.start + c.duration / 2 <= mid);
      const after = neighbours.filter((c) => c.start + c.duration / 2 > mid).sort((a, b) => a.start - b.start);
      const prev = before.reduce((a, c) => (!a || end(c) > end(a) ? c : a), null);
      const start = prev ? end(prev) : s;
      const push = after.length ? Math.max(0, start + clip.duration - after[0].start) : 0;
      return { prev, start, after, push };
    }

    function move(ev) {
      lastEvent = ev;
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return;
        dispatch({ type: 'CHECKPOINT' });
        started = true;
        raf = requestAnimationFrame(autoScroll);
      }
      // Scrolling during the drag moves the content under the pointer: count it in the offset.
      const dx = (ev.clientX - x0 + sc.scrollLeft - scroll0) / pps;

      if (mode === 'move') {
        const lane = laneAt(ev.clientY);
        if (clip.track === 'video' && lane === 0 && magnetRef.current && !ev.altKey) {
          curLane = 0;
          const s = Math.max(0, clip.start + dx);
          const plan = insertMain(asMain, [clip.id], s + clip.duration / 2, linkRef.current);
          if (slot !== plan.index) {
            slot = plan.index;
            dispatch({ type: 'LIVE_CLIPS', clips: plan.clips });
          }
          setGhost({ left: s * pps, top: row.top - box.top, width: clip.duration * pps, height: row.height, id: clip.id });
          setGuide({ time: plan.start, snapped: true, label: `${formatTime(plan.start)} · s'insère ici` });
          return;
        }
        if (slot !== null) {
          slot = null;
          dispatch({ type: 'LIVE_CLIPS', clips: base });
        }
        setGhost(null);
        let s = Math.max(0, clip.start + dx);
        const snappedStart = snap(s);
        let edge = 'start';
        if (snappedStart !== s) s = snappedStart;
        else {
          const snappedEnd = snap(s + clip.duration);
          if (snappedEnd !== s + clip.duration) {
            s = snappedEnd - clip.duration;
            edge = 'end';
          }
        }
        s = Math.max(0, s);
        curLane = laneAt(ev.clientY);
        update({ start: s, lane: curLane });
        for (const l of linked) dispatch({ type: 'UPDATE_CLIP', id: l.id, patch: { start: l.start + s - clip.start } });
        const glue = magnetic(ev) && attachPlan(s, curLane);
        if (glue && glue.prev) setGuide({ time: glue.start, snapped: true, label: `${formatTime(glue.start)} · s'attache ici` });
        else showGuide(edge === 'end' ? s + clip.duration : s);
      } else if (mode === 'trim-l') {
        const prevEnd = sameTrack.filter((c) => end(c) <= clip.start + 1e-6).reduce((a, c) => Math.max(a, end(c)), 0);
        let delta = Math.max(snap(clip.start + dx), prevEnd) - clip.start;
        if (m.type !== 'image') delta = Math.max(delta, -clip.in / clipSpeed(clip));
        delta = Math.min(delta, clip.duration - 0.1);
        update({ start: clip.start + delta, duration: clip.duration - delta, in: m.type === 'image' ? 0 : clip.in + delta * clipSpeed(clip) });
        showGuide(clip.start + delta);
      } else {
        const nextStart = sameTrack.filter((c) => c.start >= end(clip) - 1e-6).reduce((a, c) => Math.min(a, c.start), Infinity);
        let e2 = Math.min(snap(end(clip) + dx), nextStart);
        if (m.type !== 'image') e2 = Math.min(e2, clip.start + (m.duration - clip.in) / clipSpeed(clip));
        const d = Math.max(0.1, e2 - clip.start);
        update({ duration: d });
        showGuide(clip.start + d);
      }
    }

    // Near the left or right edge of the timeline, keep scrolling (faster the closer the pointer).
    function autoScroll() {
      if (lastEvent) {
        const r = sc.getBoundingClientRect();
        const zone = 60;
        const x = lastEvent.clientX;
        const speed = x > r.right - zone ? (x - (r.right - zone)) / zone : x < r.left + zone ? -((r.left + zone - x) / zone) : 0;
        if (speed) {
          const before = sc.scrollLeft;
          sc.scrollLeft = before + Math.max(-1, Math.min(1, speed)) * 30;
          if (sc.scrollLeft !== before) move(lastEvent);
        }
      }
      raf = requestAnimationFrame(autoScroll);
    }

    function up() {
      cancelAnimationFrame(raf);
      setDragWidth(0);
      setGuide(null);
      setGhost(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (mode !== 'move' || !started) return;
      if (slot !== null) {
        dispatch({ type: 'COMPACT_LANES' });
        return;
      }
      const all = stateRef.current.clips;
      const dropped = all.find((x) => x.id === clip.id)?.start ?? clip.start;
      const moves = new Map();
      const followers = [];
      let start = dropped;
      let lane = curLane;
      if (magnetic(lastEvent)) {
        const plan = attachPlan(dropped, curLane);
        start = plan.start;
        if (plan.push > 0) {
          for (const c of plan.after) {
            moves.set(c.id, c.start + plan.push);
            if (!linkRef.current || clip.track !== 'video') continue;
            for (const l of attached(c)) {
              if (linkedIds.has(l.id) || moves.has(l.id)) continue;
              moves.set(l.id, l.start + plan.push);
              followers.push(l);
            }
          }
        }
      } else if (overlaps(all, clip.track, dropped, clip.duration, clip.id, curLane)) {
        start = clip.start;
        lane = laneOf(clip);
      }
      moves.set(clip.id, start);
      for (const l of linked) moves.set(l.id, l.start + start - clip.start);
      // A linked item that would land on another item of its own lane stays where it was.
      const placed = () => all.map((c) => (moves.has(c.id) ? { ...c, start: moves.get(c.id) } : c));
      for (const l of [...linked, ...followers]) {
        if (overlaps(placed(), l.track, moves.get(l.id), l.duration, l.id, laneOf(l))) moves.set(l.id, l.start);
      }
      for (const [id, s] of moves) dispatch({ type: 'UPDATE_CLIP', id, patch: id === clip.id ? { start: s, lane, ...becomesOverlay(lane) } : { start: s } });
      dispatch({ type: 'COMPACT_LANES' });
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Dragging a clip of a group: all of them move, or all get shorter or longer by the same amount
  // (with the magnet on they stay one after the other). A plain click selects just that clip.
  function startGroupDrag(e, clip, mode, ids) {
    const base = stateRef.current.clips;
    const group = new Set(ids);
    const members = base.filter((c) => group.has(c.id));
    const hasMain = members.some(isMainClip);
    const first = Math.min(...members.map((c) => c.start));
    const mains = members.filter(isMainClip);
    const span = mains.reduce((t, c) => t + c.duration, 0);
    const mainFirst = Math.min(...mains.map((c) => c.start));
    const offset = clip.start - first;
    const snaps = snapRef.current ? [0, time, ...base.filter((c) => !group.has(c.id)).flatMap((c) => [c.start, end(c)])] : [];
    const last = Math.max(...members.map(end));
    // Up or down: a group without main-track clips changes lanes together.
    const sameTrack = !hasMain && members.every((c) => c.track === clip.track);
    const minLane = Math.min(...members.map(laneOf));
    const floor = clip.track === 'video' ? 1 : 0;
    const laneShift = (y) => {
      if (!sameTrack) return 0;
      const hit = [...contentRef.current.querySelectorAll(`.tl-track[data-kind="${clip.track}"]`)].find((r) => {
        const b = r.getBoundingClientRect();
        return y >= b.top - 3 && y <= b.bottom + 3;
      });
      if (!hit) return 0;
      return Math.max(floor - minLane, Number(hit.dataset.lane) - laneOf(clip));
    };
    let slot = null;
    const row = contentRef.current.querySelector('.tl-track[data-kind="video"][data-lane="0"]').getBoundingClientRect();
    const box = contentRef.current.getBoundingClientRect();
    const x0 = e.clientX;
    const sc = scrollRef.current;
    const scroll0 = sc.scrollLeft;
    setDragWidth(contentRef.current.scrollWidth);
    let started = false;
    let delta = 0;
    const move = (ev) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        started = true;
        dispatch({ type: 'CHECKPOINT' });
      }
      delta = (ev.clientX - x0 + sc.scrollLeft - scroll0) / pps;
      if (mode === 'move') {
        if (hasMain && magnetRef.current && !ev.altKey) {
          const s = Math.max(0, mainFirst + delta);
          const plan = insertMain(base, ids, s + span / 2, linkRef.current);
          if (slot !== plan.index) {
            slot = plan.index;
            dispatch({ type: 'LIVE_CLIPS', clips: plan.clips });
          }
          setGhost({ left: s * pps, top: row.top - box.top, width: span * pps, height: row.height, label: `${ids.length} clips` });
          setGuide({ time: plan.start, snapped: true, label: `${ids.length} clips · s'insèrent à ${formatTime(plan.start)}` });
          return;
        }
        slot = null;
        setGhost(null);
        // The group's outer edges line up on the other clips and the playhead.
        let d = Math.max(-first, delta);
        let best = SNAP_PX / pps;
        let snapped = false;
        for (const s of snaps) {
          for (const edge of [first + d, last + d]) {
            if (Math.abs(s - edge) < best) {
              best = Math.abs(s - edge);
              d += s - edge;
              snapped = true;
            }
          }
        }
        delta = d;
        const shown = Math.max(0, first + d + offset);
        dispatch({ type: 'GROUP_MOVE', base, ids, delta: d, lanes: laneShift(ev.clientY) });
        setGuide({ time: shown, snapped, label: `${ids.length} clips · ${formatTime(shown)}` });
        return;
      }
      const side = mode === 'trim-l' ? 'start' : 'end';
      dispatch({ type: 'GROUP_TRIM', base, ids, side, delta, ripple: magnetRef.current && !ev.altKey, link: linkRef.current });
      const shown = clip.duration + (side === 'end' ? delta : -delta);
      setGuide({ time: side === 'end' ? clip.start + shown : clip.start + delta, label: `${ids.length} clips · ${delta >= 0 === (side === 'end') ? '+' : '−'}${Math.abs(delta).toFixed(2).replace('.', ',')} s` });
    };
    const up = () => {
      setDragWidth(0);
      setGuide(null);
      setGhost(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!started) {
        dispatch({ type: 'SELECT', id: clip.id });
        return;
      }
      if (mode === 'move') {
        if (slot !== null) {
          dispatch({ type: 'COMPACT_LANES' });
          return;
        }
        // A clip that lands on another one takes a free lane of its track. The main track can't
        // stack: if the group lands on main-track clips (Alt, or no magnet), it goes back where it was.
        let now = stateRef.current.clips;
        const onOther = (c, list) => list.some((x) => !group.has(x.id) && x.track === c.track && laneOf(x) === laneOf(c) && c.start < end(x) - 1e-6 && end(c) > x.start + 1e-6);
        if (now.some((c) => group.has(c.id) && isMainClip(c) && onOther(c, now))) {
          dispatch({ type: 'LIVE_CLIPS', clips: base });
          return;
        }
        for (const c of now) {
          if (!group.has(c.id) || !onOther(c, now)) continue;
          const lane = freeLane(now.filter((x) => !group.has(x.id)), c.track, c.start, c.duration, c.id, laneOf(c));
          now = now.map((x) => (x.id === c.id ? { ...x, lane } : x));
        }
        dispatch({ type: 'LIVE_CLIPS', clips: now });
        dispatch({ type: 'COMPACT_LANES' });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Right click: on a clip outside the selection, it becomes the selection.
  function openMenu(e) {
    e.preventDefault();
    const id = e.target.closest?.('.clip[data-id]')?.dataset.id;
    if (id && !chosen.has(id)) dispatch({ type: 'SELECT', id });
    if (!id && !state.clipboard.length) return;
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 250), y: Math.min(e.clientY, window.innerHeight - (id ? 400 : 60)), id });
  }

  // Label of a video or audio lane: cuts or sets the sound of all the clips on it at once.
  function laneSound(r) {
    if (r.ghost || (r.id !== 'video' && r.id !== 'audio')) return null;
    const list = clips.filter((c) => c.track === r.id && laneOf(c) === r.lane && mediaById[c.mediaId]?.hasAudio);
    if (!list.length) return null;
    const ids = list.map((c) => c.id);
    const muted = list.every((c) => c.muted);
    const volume = Math.round(clipAudio(list[0]).volume * 100);
    const name = r.id === 'video' ? 'des vidéos de cette piste' : 'de cette piste';
    return (
      <span className="lane-sound">
        <button
          className={muted ? 'off' : ''}
          onClick={() => dispatch({ type: 'TOGGLE_MUTE', ids })}
          title={muted ? `Rétablir le son ${name}` : `Couper le son ${name}`}
          aria-label={muted ? `Rétablir le son ${name}` : `Couper le son ${name}`}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={MAX_VOLUME * 100}
          value={muted ? 0 : volume}
          title={`Volume ${name} : ${muted ? 0 : volume} %`}
          aria-label={`Volume ${name}`}
          onPointerDown={() => dispatch({ type: 'CHECKPOINT' })}
          onChange={(e) => dispatch({ type: 'UPDATE_MANY', ids, patch: { volume: Number(e.target.value) / 100, muted: false } })}
        />
      </span>
    );
  }

  function menuItems() {
    const paste = { label: 'Coller à la tête de lecture', keys: 'Ctrl+V', off: !state.clipboard.length, run: () => dispatch({ type: 'PASTE', time, link }) };
    if (!menu.id) return [paste];
    const ids = chosen.has(menu.id) ? [...chosen] : [menu.id];
    const hasMain = clips.some((c) => ids.includes(c.id) && isMainClip(c));
    const sound = clips.filter((c) => ids.includes(c.id) && mediaById[c.mediaId]?.hasAudio);
    return [
      { label: 'Copier', keys: 'Ctrl+C', run: () => dispatch({ type: 'COPY', ids }) },
      {
        label: 'Couper',
        keys: 'Ctrl+X',
        run: () => {
          dispatch({ type: 'COPY', ids });
          dispatch({ type: 'DELETE_MANY', ids, ripple: magnet, link });
        },
      },
      paste,
      { label: 'Dupliquer', keys: 'Ctrl+D', run: () => dispatch({ type: 'DUPLICATE', ids, link }) },
      null,
      { label: 'Déplacer avant le clip précédent', keys: 'Ctrl+←', off: !hasMain, run: () => dispatch({ type: 'MOVE_ORDER', ids, dir: -1, link }) },
      { label: 'Déplacer après le clip suivant', keys: 'Ctrl+→', off: !hasMain, run: () => dispatch({ type: 'MOVE_ORDER', ids, dir: 1, link }) },
      ...(ids.length >= 2 ? [{ label: 'Aligner bout à bout', run: () => dispatch({ type: 'ALIGN', ids, how: 'sequence', time, link }) }] : []),
      null,
      { label: 'Diviser à la tête de lecture', keys: 'S', run: () => dispatch({ type: 'SPLIT', time }) },
      {
        label: sound.length && sound.every((c) => c.muted) ? 'Rétablir le son' : 'Couper le son',
        keys: 'M',
        off: !sound.length,
        run: () => dispatch({ type: 'TOGGLE_MUTE', ids }),
      },
      { label: 'Retirer les effets', run: () => dispatch({ type: 'REMOVE_EFFECTS', ids }) },
      { label: 'Supprimer', keys: 'Suppr', run: () => dispatch({ type: 'DELETE_MANY', ids, ripple: magnet, link }) },
      { label: 'Supprimer et laisser le trou', keys: 'Maj+Suppr', run: () => dispatch({ type: 'DELETE_MANY', ids }) },
    ];
  }

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // Drag on an empty part of a track: a rectangle selects the clips it touches. A click places the playhead.
  function startMarquee(e) {
    if (e.button !== 0) return;
    if (e.shiftKey) {
      startSeek(e);
      return;
    }
    const box = contentRef.current.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      started = true;
      const r = { left: Math.min(x0, ev.clientX), right: Math.max(x0, ev.clientX), top: Math.min(y0, ev.clientY), bottom: Math.max(y0, ev.clientY) };
      setMarquee({ left: r.left - box.left, top: r.top - box.top, width: r.right - r.left, height: r.bottom - r.top });
      const ids = [...contentRef.current.querySelectorAll('.clip[data-id]')]
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
        })
        .map((el) => el.dataset.id);
      dispatch({ type: 'SELECT_MANY', ids });
    };
    const up = () => {
      setMarquee(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!started) {
        dispatch({ type: 'SELECT', id: null });
        dispatch({ type: 'SELECT_MANY', ids: [] });
        onSeek(xToTime(x0));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startSeek(e) {
    if (e.button !== 0) return;
    // Shift + drag: choose the zone to play (playback then starts at its beginning and stops at its end).
    if (e.shiftKey) {
      const t0 = Math.min(xToTime(e.clientX), total);
      const move = (ev) => {
        const t1 = Math.min(xToTime(ev.clientX), total);
        onZone(Math.abs(t1 - t0) > 0.05 ? [Math.min(t0, t1), Math.max(t0, t1)] : null);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    onSeek(xToTime(e.clientX));
    const move = (ev) => onSeek(xToTime(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const step = tickStep(pps);
  const ticks = [];
  for (let t = 0; t * pps <= width; t += step) ticks.push(t);

  return (
    <section className="panel timeline">
      <div className="tl-toolbar">
        <button className="btn ghost" onClick={() => dispatch({ type: 'ADD_TEXT', start: time })} title="Ajouter un texte à la tête de lecture (T)">
          T+ Texte
        </button>
        <button className="btn ghost" onClick={onOpenSubtitles} title="Créer les sous-titres à partir de la voix">
          ✎ Sous-titres auto
        </button>
        <span className="tl-sep" />
        <button className="btn ghost" onClick={onToggleMarker} title="Poser ou retirer un marqueur à la tête de lecture (B). Maj + ↑ / ↓ pour sauter d'un marqueur à l'autre">
          ⚑ Marqueur
        </button>
        <button className="btn ghost" onClick={() => dispatch({ type: 'SPLIT', time })} title="Diviser à la tête de lecture (S)">
          ✂ Diviser
        </button>
        <button className="btn ghost" onClick={() => onFreeze()} title="Figer l'image à la tête de lecture : insère une image fixe de 3 s">
          ❄ Figer
        </button>
        <button className="btn ghost" onClick={() => onTrim('start')} title="Couper le début du clip jusqu'à la tête de lecture (Q)">
          ⇤ Début ici
        </button>
        <button className="btn ghost" onClick={() => onTrim('end')} title="Couper la fin du clip à partir de la tête de lecture (W)">
          Fin ici ⇥
        </button>
        <button
          className="btn ghost"
          disabled={!selectedId}
          onClick={() => dispatch({ type: 'DELETE_MANY', ids: [...chosen], ripple: magnet, link })}
          title="Supprimer le clip sélectionné (Suppr). Avec l'aimant, la suite recule pour combler le trou"
        >
          🗑 Supprimer
        </button>
        <button className="btn ghost" onClick={onVoiceover} title="Enregistrer ta voix au micro à partir de la tête de lecture">
          🎙 Voix off
        </button>
        <button className="btn ghost" disabled={!selectedId} onClick={() => dispatch({ type: 'COPY', ids: [...chosen] })} title="Copier la sélection (Ctrl+C)" aria-label="Copier">
          ⧉
        </button>
        <button
          className="btn ghost"
          disabled={!state.clipboard.length}
          onClick={(e) => dispatch({ type: 'PASTE', time, plain: e.shiftKey, link })}
          title="Coller à la tête de lecture (Ctrl+V) — sans effets : Ctrl+Maj+V ou Maj + clic"
          aria-label="Coller"
        >
          ⎘
        </button>
        <span className="tl-sep" />
        <button className="btn ghost" disabled={!past.length} onClick={() => dispatch({ type: 'UNDO' })} title="Annuler (Ctrl+Z)">
          ↶
        </button>
        <button className="btn ghost" disabled={!future.length} onClick={() => dispatch({ type: 'REDO' })} title="Rétablir (Ctrl+Y)">
          ↷
        </button>
        <span className="spacer" />
        <div className="tl-toggles">
          <button
            className={`btn ghost ${magnet ? 'active' : ''}`}
            onClick={() => setMagnet((v) => !v)}
            title="Aimant : sur la piste Vidéo, les clips se suivent sans trou et s'écartent quand tu en glisses un entre eux ; ailleurs, un clip se colle au précédent (Alt pendant le glissement pour placer librement)"
          >
            🧲
          </button>
          <button
            className={`btn ghost ${snapOn ? 'active' : ''}`}
            onClick={() => setSnapOn((v) => !v)}
            title="Aimantation auto : les bords des clips s'alignent sur les autres clips et la tête de lecture"
          >
            ⊹
          </button>
          <button
            className={`btn ghost ${link ? 'active' : ''}`}
            onClick={() => setLink((v) => !v)}
            title="Liaison : les textes, effets, filtres et sons posés sur un clip vidéo le suivent quand tu le déplaces"
          >
            🔗
          </button>
          <button
            className={`btn ghost ${axis ? 'active' : ''}`}
            onClick={() => setAxis((v) => !v)}
            title="Axe d'aperçu : survole la timeline pour voir l'image sous la souris sans bouger la tête de lecture"
          >
            ⇹
          </button>
        </div>
        <span className="tl-sep" />
        <button className="btn ghost" onClick={zoomToFit} title="Ajuster le zoom pour voir tout le montage (Maj+Z)">
          ⤢ Tout voir
        </button>
        <label className="zoom">
          Zoom
          <input type="range" min="5" max="400" step="1" value={Math.round(pps)} onChange={(e) => setPps(Number(e.target.value))} />
        </label>
      </div>

      <div className="tl-body">
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-inner">
          <div className="tl-labels">
            <div className="tl-ruler-spacer" />
            {rows.map((r) => (
              <div key={`${r.id}:${r.lane}`} className={`tl-label ${r.id}${r.overlay ? ' overlay' : ''}${r.ghost ? ' ghost' : ''}`} title={STACKED.includes(r.id) ? 'Glisse un élément vers le haut ou le bas pour changer de piste' : undefined}>
                {r.label}
                {laneSound(r)}
              </div>
            ))}
          </div>
          <div
            className={`tl-content ${ghost ? 'reflow' : ''}`}
            ref={contentRef}
            style={{ width }}
            onContextMenu={openMenu}
            onPointerMove={(e) => {
              if (!axis || playing) return;
              const t = xToTime(e.clientX);
              showHover(e.buttons || t > total ? null : t);
            }}
            onPointerLeave={() => showHover(null)}
          >
            <div
              className="tl-ruler"
              onPointerDown={startSeek}
              title="Clique pour placer la tête de lecture · Maj + glisser pour choisir une zone de lecture (I / O aux touches, X pour l'effacer)"
            >
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: t * pps }}>
                  {Number.isInteger(t) ? formatShort(t) : ''}
                </span>
              ))}
              {state.markers.map((m) => (
                <span
                  key={m.id}
                  className={`tl-marker ${m.beat ? 'beat' : ''}`}
                  style={{ left: m.time * pps }}
                  title={`${m.label ? `${m.label} — ` : ''}${formatShort(m.time)}\nClic : y aller · Double-clic : nommer · Clic droit : retirer`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSeek(m.time);
                  }}
                  onDoubleClick={() => setNaming(m.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dispatch({ type: 'SET_MARKERS', markers: state.markers.filter((x) => x.id !== m.id) });
                  }}
                >
                  {!m.beat && m.label && <span className="tl-marker-label">{m.label}</span>}
                  {naming === m.id && (
                    <input
                      className="tl-marker-name"
                      autoFocus
                      maxLength={80}
                      defaultValue={m.label}
                      onPointerDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        dispatch({ type: 'SET_MARKERS', markers: state.markers.map((x) => (x.id === m.id ? { ...x, label: e.target.value.trim() } : x)) });
                        setNaming(null);
                      }}
                    />
                  )}
                </span>
              ))}
            </div>

            {rows.map((track) => (
              <div
                key={`${track.id}:${track.lane}`}
                className={`tl-track ${track.id}${track.overlay ? ' overlay' : ''}${track.ghost ? ' ghost' : ''}`}
                data-kind={track.id}
                data-lane={track.lane}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  startMarquee(e);
                }}
                onDragOver={(e) => {
                  const types = e.dataTransfer.types;
                  const accepted =
                    types.includes(MEDIA_MIME) ||
                    types.includes(MEDIA_LIST_MIME) ||
                    (track.id === 'fx' && types.includes(EFFECT_MIME)) ||
                    (track.id === 'filter' && types.includes(FILTER_MIME));
                  if (!accepted) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => {
                  const effectType = track.id === 'fx' && e.dataTransfer.getData(EFFECT_MIME);
                  if (effectType) {
                    e.preventDefault();
                    dispatch({ type: 'ADD_FX_ITEM', effectType, start: xToTime(e.clientX), lane: track.lane });
                    return;
                  }
                  const filterId = track.id === 'filter' && e.dataTransfer.getData(FILTER_MIME);
                  if (filterId) {
                    e.preventDefault();
                    dispatch({ type: 'ADD_FILTER_ITEM', filterId, start: xToTime(e.clientX), lane: track.lane });
                    return;
                  }
                  const list = e.dataTransfer.getData(MEDIA_LIST_MIME);
                  const mediaId = e.dataTransfer.getData(MEDIA_MIME);
                  if (!list && !mediaId) return;
                  e.preventDefault();
                  // Several media, or one on the main track: inserted where dropped, in order.
                  if (list || (track.id === 'video' && track.lane === 0)) {
                    dispatch({ type: 'ADD_CLIPS', mediaIds: list ? JSON.parse(list) : [mediaId], track: track.id, start: xToTime(e.clientX), lane: track.lane, magnet, link });
                    return;
                  }
                  dispatch({ type: 'ADD_CLIP', mediaId, track: track.id, start: xToTime(e.clientX), lane: track.lane });
                }}
              >
                {track.id === 'fx' && !clips.some((c) => c.track === 'fx') && (
                  <span className="tl-track-hint">Glisse un effet ici pour l'appliquer à tout ce qui est en dessous</span>
                )}
                {track.id === 'filter' && !clips.some((c) => c.track === 'filter') && (
                  <span className="tl-track-hint">Glisse un filtre ici pour l'appliquer à tout ce qui est en dessous</span>
                )}
                {track.ghost && (
                  <span className="tl-track-hint">Glisse ici une vidéo ou une photo (ou un clip de la piste Vidéo) pour l'incruster par-dessus</span>
                )}
                {track.id === 'video' && track.lane === 0 &&
                  transitions.map((tr) => (
                    <div
                      key={tr.b.id}
                      className="trans-mark"
                      style={{ left: tr.from * pps, width: Math.max(10, tr.d * pps) }}
                      title={`${TRANSITIONS.find((x) => x.id === tr.type)?.label} — ${tr.d.toFixed(1)} s`}
                    >
                      ⧓
                    </div>
                  ))}
                {clips
                  .filter((c) => c.track === track.id && laneOf(c) === track.lane)
                  .map((c) => {
                    if (c.track === 'filter') {
                      const name = filterInfo(c.filter?.id, state.filters)?.name || 'Filtre';
                      const fi = Math.min(c.fadeIn ?? 0, c.duration / 2);
                      const fo = Math.min(c.fadeOut ?? 0, c.duration / 2);
                      return (
                        <div
                          key={c.id}
                          data-id={c.id}
                          className={`clip filteritem ${chosen.has(c.id) ? 'selected' : ''}`}
                          style={{ left: c.start * pps, width: Math.max(2, c.duration * pps) }}
                          onPointerDown={(e) => startDrag(e, c, 'move')}
                          title={`${name} — ${c.duration.toFixed(2)} s`}
                        >
                          {fi > 0 && <div className="fade in" style={{ width: fi * pps }} />}
                          {fo > 0 && <div className="fade out" style={{ width: fo * pps }} />}
                          {fadeHandles(c, fi, fo)}
                          <div className="handle l" onPointerDown={(e) => startDrag(e, c, 'trim-l')} />
                          <span className="clip-name">◐ {name}</span>
                          <div className="handle r" onPointerDown={(e) => startDrag(e, c, 'trim-r')} />
                        </div>
                      );
                    }
                    if (c.track === 'fx') {
                      const info = EFFECTS.find((e) => e.id === c.effect?.type);
                      const fi = Math.min(c.fadeIn ?? 0, c.duration / 2);
                      const fo = Math.min(c.fadeOut ?? 0, c.duration / 2);
                      return (
                        <div
                          key={c.id}
                          data-id={c.id}
                          className={`clip fxitem ${chosen.has(c.id) ? 'selected' : ''}`}
                          style={{ left: c.start * pps, width: Math.max(2, c.duration * pps) }}
                          onPointerDown={(e) => startDrag(e, c, 'move')}
                          title={`${info?.label || 'Effet'} — ${c.duration.toFixed(2)} s`}
                        >
                          {fi > 0 && <div className="fade in" style={{ width: fi * pps }} />}
                          {fo > 0 && <div className="fade out" style={{ width: fo * pps }} />}
                          {fadeHandles(c, fi, fo)}
                          <div className="handle l" onPointerDown={(e) => startDrag(e, c, 'trim-l')} />
                          <span className="clip-name">
                            {info?.icon} {info?.label || 'Effet'}
                          </span>
                          <div className="handle r" onPointerDown={(e) => startDrag(e, c, 'trim-r')} />
                        </div>
                      );
                    }
                    if (c.track === 'text') {
                      return (
                        <div
                          key={c.id}
                          data-id={c.id}
                          className={`clip text ${chosen.has(c.id) ? 'selected' : ''}`}
                          style={{ left: c.start * pps, width: Math.max(2, c.duration * pps) }}
                          onPointerDown={(e) => startDrag(e, c, 'move')}
                          title={`${c.text} — ${c.duration.toFixed(2)} s`}
                        >
                          <div className="handle l" onPointerDown={(e) => startDrag(e, c, 'trim-l')} />
                          <span className="clip-name">T  {c.text || '(vide)'}</span>
                          <div className="handle r" onPointerDown={(e) => startDrag(e, c, 'trim-r')} />
                        </div>
                      );
                    }
                    const m = mediaById[c.mediaId];
                    const thumb = track.id === 'video' && m.thumb ? `url("${window.cupkata.mediaUrl(m.thumb)}")` : undefined;
                    const a = clipAudio(c);
                    const fi = Math.min(a.fadeIn, c.duration);
                    const fo = Math.min(a.fadeOut, c.duration - fi);
                    const badge = !m.hasAudio ? '' : a.muted ? '🔇' : a.volume !== 1 ? `${Math.round(a.volume * 100)} %` : '';
                    const fx = clipEffect(c);
                    const fxInfo = fx && EFFECTS.find((e) => e.id === fx.type);
                    return (
                      <div
                        key={c.id}
                        data-id={c.id}
                        className={`clip ${m.type} ${chosen.has(c.id) ? 'selected' : ''}`}
                        style={{ left: c.start * pps, width: Math.max(2, c.duration * pps), backgroundImage: thumb }}
                        onPointerDown={(e) => startDrag(e, c, 'move')}
                        onDragOver={(e) => {
                          const types = e.dataTransfer.types;
                          if (track.id !== 'video' || !((types.includes(EFFECT_MIME) && !track.overlay) || types.includes(FILTER_MIME))) return;
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'copy';
                        }}
                        onDrop={(e) => {
                          if (track.id !== 'video') return;
                          // Effects stay on the main track; overlays take filters and colour settings.
                          const type = !track.overlay && e.dataTransfer.getData(EFFECT_MIME);
                          const filterId = e.dataTransfer.getData(FILTER_MIME);
                          if (!type && !filterId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({ type: 'CHECKPOINT' });
                          const patch = type
                            ? { effect: { type, intensity: c.effect?.intensity ?? DEFAULT_INTENSITY } }
                            : { filter: { id: filterId, amount: c.filter?.amount ?? 0.8 } };
                          dispatch({ type: 'UPDATE_CLIP', id: c.id, patch });
                          dispatch({ type: 'SELECT', id: c.id });
                        }}
                        title={`${m.name} — ${c.duration.toFixed(2)} s`}
                      >
                        <div className="handle l" onPointerDown={(e) => startDrag(e, c, 'trim-l')} />
                        <KeyframeMarks clip={c} pps={pps} />
                        {m.hasAudio && !m.missing && (
                          <Waveform peaks={peaks?.get(m.path)} from={c.in} duration={c.duration * clipSpeed(c)} width={c.duration * pps} />
                        )}
                        {m.hasAudio && !a.muted && fi > 0 && <div className="fade in" style={{ width: fi * pps }} />}
                        {m.hasAudio && !a.muted && fo > 0 && <div className="fade out" style={{ width: fo * pps }} />}
                        {m.hasAudio && !a.muted && !m.missing && fadeHandles(c, fi, fo)}
                        <span className="clip-name">
                          {clipSpeed(c) !== 1 && <span className="clip-badge speed">{clipSpeed(c).toFixed(2).replace(/.?0+$/, '').replace('.', ',')}×</span>}
                          {c.reversed && <span className="clip-badge">⇆</span>}
                          {badge && <span className="clip-badge">{badge}</span>}
                          {c.filter?.id && filterInfo(c.filter.id, state.filters) && (
                            <span className="clip-badge filter">◐ {filterInfo(c.filter.id, state.filters).name}</span>
                          )}
                          {fxInfo && <span className="clip-badge fx">{fxInfo.icon} {fxInfo.label}</span>}
                          {m.name}
                        </span>
                        <div className="handle r" onPointerDown={(e) => startDrag(e, c, 'trim-r')} />
                      </div>
                    );
                  })}
              </div>
            ))}

            {zone && (
              <div className="tl-zone" style={{ left: zone[0] * pps, width: (zone[1] - zone[0]) * pps }} title="Zone de lecture (X pour l'effacer)" />
            )}
            {marquee && <div className="tl-marquee" style={marquee} />}
            {ghost && (
              <div className="clip-ghost" style={{ left: ghost.left, top: ghost.top, width: Math.max(4, ghost.width), height: ghost.height }}>
                {ghost.label}
              </div>
            )}
            {hover != null && !guide && <div className="tl-hover" style={{ left: hover * pps }} />}
            {guide && (
              <div className={`tl-guide ${guide.snapped ? 'snapped' : ''}`} style={{ left: guide.time * pps }}>
                <span>
                  {guide.label || formatTime(guide.time)}
                  {guide.snapped && !guide.label && ' · aligné'}
                </span>
              </div>
            )}
            <div className="tl-playhead" style={{ left: time * pps }} />
          </div>
          </div>
        </div>
      </div>
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {menuItems().map((item, i) =>
            item ? (
              <button
                key={item.label}
                disabled={item.off}
                onClick={() => {
                  setMenu(null);
                  item.run();
                }}
              >
                <span>{item.label}</span>
                {item.keys && <kbd>{item.keys}</kbd>}
              </button>
            ) : (
              <hr key={i} />
            ),
          )}
        </div>
      )}
    </section>
  );
}
