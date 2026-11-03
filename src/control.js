import { flushSync } from 'react-dom';
import SPEC from '../shared/control-commands.json';
import EFFECT_IDS from '../shared/effects.json';
import { BACKGROUNDS, laneOf, overlaps, TRANSITIONS } from './project.js';
import { FILTER_CATEGORIES, PRESETS } from './filters.js';
import { CATEGORIES, EFFECTS } from './effects.js';
import { DEFAULT_TEXT_STYLE, FONTS, TEXT_ANIMS_IN, TEXT_ANIMS_LOOP, TEXT_ANIMS_OUT, TEXT_PRESETS } from './text.js';
import { RATIOS } from './ratio.js';
import { FPS } from './format.js';
import { EMOJIS, SHAPES, STICKER_IDS } from './stickers.js';
import { EXPORT_PRESETS } from './exportPresets.js';
import { cutRangeOf, timelineWords } from './components/TranscriptPanel.jsx';
import { KEYFRAME_RANGES, removeKeyframe, setKeyframe, MAX_KEYFRAMES, keyframesOf, keyframeAt } from './keyframes.js';

// Carries out the commands of the local API (electron/control.cjs). `app.current` holds what App knows
// at its latest render; commands go through the same reducer and functions as the buttons.
const api = window.cupkata;

class ControlError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new ControlError(code, message);
};

// ── Argument checks (the subset of JSON Schema used by shared/control-commands.json) ──
function checkValue(name, value, rule) {
  const bad = (what) => fail('bad_args', `${name} ${what}.`);
  if (rule.enum && !rule.enum.includes(value)) bad(`doit valoir : ${rule.enum.join(', ')}`);
  if (rule.type === 'string' && typeof value !== 'string') bad('doit être un texte');
  if (rule.type === 'boolean' && typeof value !== 'boolean') bad('doit être true ou false');
  if (rule.type === 'number' && !Number.isFinite(value)) bad('doit être un nombre');
  if (rule.type === 'integer' && !Number.isInteger(value)) bad('doit être un entier');
  if (rule.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) bad('doit être un objet');
  if (rule.type === 'array' && !Array.isArray(value)) bad('doit être une liste');
  if (rule.minimum != null && value < rule.minimum) bad(`doit être au moins ${rule.minimum}`);
  if (rule.maximum != null && value > rule.maximum) bad(`doit être au plus ${rule.maximum}`);
  if (rule.exclusiveMinimum != null && value <= rule.exclusiveMinimum) bad(`doit être supérieur à ${rule.exclusiveMinimum}`);
  if (rule.minLength != null && value.length < rule.minLength) bad('est trop court');
  if (rule.maxLength != null && value.length > rule.maxLength) bad('est trop long');
  if (rule.minItems != null && value.length < rule.minItems) bad('ne doit pas être vide');
  if (rule.maxItems != null && value.length > rule.maxItems) bad(`contient trop d’éléments (${rule.maxItems} au plus)`);
  if (rule.items) value.forEach((v, i) => checkValue(`${name}[${i}]`, v, rule.items));
}

function checkArgs(spec, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) fail('bad_args', 'args doit être un objet.');
  for (const key of Object.keys(args)) {
    if (!spec.args[key]) fail('bad_args', `Argument inconnu : ${key}. Attendus : ${Object.keys(spec.args).join(', ') || 'aucun'}.`);
    checkValue(key, args[key], spec.args[key]);
  }
  for (const key of spec.required || []) if (args[key] === undefined) fail('bad_args', `Argument manquant : ${key}.`);
}

// ── Clip settings: what clip_update accepts, track by track (same limits as electron/project.cjs) ──
const HEX = /^#[0-9a-fA-F]{6}$/;
const number = (lo, hi) => (v) => Number.isFinite(v) && v >= lo && v <= hi;
const oneOf = (...list) => (v) => list.includes(v);
const isBool = (v) => typeof v === 'boolean';
const shape = (rules) => (v) =>
  v !== null && typeof v === 'object' && Object.entries(v).every(([k, x]) => rules[k]?.(x)) && Object.keys(v).length > 0;
const orNull = (rule) => (v) => v === null || rule(v);

const fades = { fadeIn: number(0, 3600), fadeOut: number(0, 3600) };
const isEffect = shape({ type: oneOf(...EFFECT_IDS.ids), intensity: number(0, 1) });
const isFilter = (custom) => shape({ id: (id) => PRESETS.some((p) => p.id === id) || custom.some((f) => f.id === id), amount: number(0, 1) });
const textRules = {
  text: (v) => typeof v === 'string' && v.length <= 500,
  style: shape({
    font: oneOf(...FONTS), size: number(20, 400), color: (v) => HEX.test(v), outlineColor: (v) => HEX.test(v), boxColor: (v) => HEX.test(v),
    shadowColor: (v) => HEX.test(v), glowColor: (v) => HEX.test(v), bubbleColor: (v) => HEX.test(v), bubbleBorder: (v) => HEX.test(v),
    gradient: orNull((v) => HEX.test(v)), bold: isBool, italic: isBool, upper: isBool, outline: isBool, box: isBool, shadow: isBool, glow: isBool,
    align: oneOf('left', 'center', 'right'), spacing: number(-0.05, 0.5), outlineWidth: number(0, 0.3), boxOpacity: number(0, 1), opacity: number(0, 1),
    rotation: number(-360, 360), x: number(-0.5, 1.5), y: number(-0.5, 1.5), tail: oneOf('left', 'right'),
    bubble: oneOf('none', 'round', 'speech', 'thought', 'shout', 'ellipse', 'banner', 'tag', 'note'),
    effect: oneOf('none', 'neon', 'glitch', '3d', 'long', 'hollow', 'double', 'sticker', 'retro', 'echo', 'chrome', 'fire', 'ice', 'rainbow'),
  }),
  anim: shape({
    in: oneOf(...TEXT_ANIMS_IN.map(([id]) => id)), out: oneOf(...TEXT_ANIMS_OUT.map(([id]) => id)),
    loop: oneOf(...TEXT_ANIMS_LOOP.map(([id]) => id)), duration: number(0.1, 2),
  }),
};
function patchRules(clip, custom) {
  if (clip.track === 'text') return textRules;
  if (clip.track === 'fx') return { ...fades, effect: isEffect };
  if (clip.track === 'filter') return { ...fades, filter: isFilter(custom) };
  const sound = { ...fades, volume: number(0, 2), muted: isBool };
  if (clip.track === 'audio') return { ...sound, duck: orNull(shape({ level: number(0, 1) })) };
  return {
    ...sound,
    effect: orNull(isEffect),
    filter: orNull(isFilter(custom)),
    color: shape({ brightness: number(0.5, 1.5), contrast: number(0.5, 1.5), saturation: number(0, 2) }),
    background: orNull(shape({ mode: oneOf(...BACKGROUNDS), blur: number(0, 1), color: (v) => HEX.test(v) })),
    transform: orNull(shape({ x: number(-1, 2), y: number(-1, 2), scale: number(0.02, 4), rotation: number(-360, 360), opacity: number(0, 1) })),
    transition: orNull(shape({ type: oneOf(...TRANSITIONS.map((t) => t.id)), duration: number(0.1, 3) })),
  };
}

// Nested settings are merged, so that one value can change without repeating the others.
function mergedPatch(clip, patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && clip[key] && typeof clip[key] === 'object' ? { ...clip[key], ...value } : value;
  }
  return out;
}

// ── State shown to the caller ──
function describe(a) {
  const { state } = a;
  return {
    project: { path: a.projectPath, unsaved_changes: a.dirty && a.hasContent, duration: a.total, resolution: a.resolution, ratio: a.ratio, normalize: a.normalize },
    media: state.media.map(({ id, path, name, type, duration, width, height, hasAudio, missing }) => ({ id, path, name, type, duration, width, height, hasAudio, missing: !!missing })),
    clips: [...state.clips].sort((x, y) => x.start - y.start || x.track.localeCompare(y.track) || laneOf(x) - laneOf(y)),
    custom_filters: state.filters.map(({ id, name }) => ({ id, name })),
    markers: state.markers,
    selection: state.multi.length ? state.multi : state.selectedId ? [state.selectedId] : [],
    time: a.time,
    playing: a.playing,
    zone: a.zone,
    can_undo: state.past.length > 0,
    can_redo: state.future.length > 0,
    recovery_pending: !!a.recovery,
    export: a.exp,
    task: a.aiJob || (a.busy ? { label: a.busy } : null),
  };
}

function catalog(custom) {
  const options = (list) => list.map(([id, name]) => ({ id, name }));
  return {
    effects: EFFECTS.map(({ id, label, cat }) => ({ id, name: label, category: cat })),
    effect_categories: CATEGORIES,
    transitions: TRANSITIONS.map(({ id, label }) => ({ id, name: label })),
    shapes: SHAPES.map(({ id, name }) => ({ id, name })),
    emojis: EMOJIS,
    export_presets: EXPORT_PRESETS.filter((p) => p.ratio).map(({ id, name, ratio, resolution }) => ({ id, name, ratio, resolution })),
    filters: PRESETS.map(({ id, name, cat }) => ({ id, name, category: cat })),
    filter_categories: FILTER_CATEGORIES,
    custom_filters: custom.map(({ id, name }) => ({ id, name })),
    backgrounds: BACKGROUNDS,
    ratios: RATIOS.map(({ id, hint }) => ({ id, hint })),
    fonts: FONTS,
    text_default_style: DEFAULT_TEXT_STYLE,
    text_presets: TEXT_PRESETS.map(({ id, name, style }) => ({ id, name, style })),
    text_animations: { in: options(TEXT_ANIMS_IN), out: options(TEXT_ANIMS_OUT), loop: options(TEXT_ANIMS_LOOP) },
  };
}

// ── Helpers for commands ──
const macrotask = () =>
  new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(0);
  });
// Lets React finish the updates started by an asynchronous tool, so `app.current` is up to date.
const settle = async () => {
  await macrotask();
  await macrotask();
};

// Same limit as electron/project.cjs: more would be lost when the project is saved.
const MAX_CUSTOM_FILTERS = 30;
const mediaInfo = ({ id, path, name, type, duration, width, height, hasAudio }) => ({ id, path, name, type, duration, width, height, hasAudio });

function clipOf(a, id, ...tracks) {
  const clip = a.state.clips.find((c) => c.id === id);
  if (!clip) fail('not_found', `Clip inconnu : ${id}.`);
  if (tracks.length && !tracks.includes(clip.track)) fail('invalid', `Cette commande ne s’applique pas à un clip de la piste ${clip.track}.`);
  return clip;
}
function mediaOf(a, id) {
  const media = a.state.media.find((m) => m.id === id);
  if (!media) fail('not_found', `Média inconnu : ${id}.`);
  if (media.missing) fail('invalid', `Le fichier de ce média est introuvable : ${media.path}.`);
  return media;
}
function clipsOf(a, ids) {
  for (const id of ids) clipOf(a, id);
  return ids;
}
// A setting that needs its identifier (effect, filter, transition) can't be made of options alone.
function checkComplete(patch) {
  const needs = { effect: 'type', filter: 'id', transition: 'type' };
  for (const [key, id] of Object.entries(needs)) {
    if (patch[key] && !patch[key][id]) fail('bad_args', `${key} demande ${id}, car ce clip n’en a pas encore.`);
  }
}

// ── Commands ──
export function createCommands(app, dispatchRaw) {
  // Applied at once, so the answer and the next command see the result.
  const dispatch = (action) => flushSync(() => dispatchRaw(action));
  const setDuration = (id, duration) => {
    if (duration == null) return;
    const clip = app.current.state.clips.find((c) => c.id === id);
    if (overlaps(app.current.state.clips, clip.track, clip.start, duration, id, laneOf(clip))) {
      dispatch({ type: 'UNDO' });
      fail('invalid', 'Cette durée recouvrirait un autre clip de la même ligne.');
    }
    dispatch({ type: 'UPDATE_CLIP', id, patch: { duration } });
  };
  const newest = () => {
    const a = app.current;
    return a.state.clips.find((c) => c.id === a.state.selectedId) ?? null;
  };
  const clipsChange = (action) => {
    const before = app.current.state.clips;
    dispatch(action);
    return { changed: app.current.state.clips !== before };
  };
  // Runs one of App's tools; a failure it only shows as a notice becomes the command's error.
  const runTool = async (work) => {
    app.current.notices.last = null;
    await work();
    await settle();
    const notice = app.current.notices.last;
    if (notice?.kind === 'error') fail('invalid', notice.text);
    return { changed: true, message: notice?.text ?? null };
  };
  const guardDiscard = (args) => {
    const a = app.current;
    if (a.dirty && a.hasContent && !args.discard_changes) fail('unsaved_changes', 'Le projet a des modifications non enregistrées : enregistre-le, ou passe discard_changes.');
  };

  return {
    get_state: () => describe(app.current),
    list_catalog: () => catalog(app.current.state.filters),
    wait_idle: async (args) => {
      const limit = performance.now() + (args.timeout_seconds ?? 60) * 1000;
      let idle = !isWorking(app.current);
      while (!idle && performance.now() < limit) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        idle = !isWorking(app.current);
      }
      const a = app.current;
      return { idle, export: a.exp, task: a.aiJob || (a.busy ? { label: a.busy } : null) };
    },
    capture_frame: async (args) => {
      const a = app.current;
      flushSync(() => {
        a.setPlaying(false);
        a.setHoverTime(null);
        if (args.time != null) a.seek(args.time);
      });
      const frame = await a.preview.current.capture();
      return { ...frame, time: app.current.time };
    },

    project_new: (args) => {
      guardDiscard(args);
      flushSync(() => app.current.applyProject({ media: [], clips: [], settings: { resolution: '1080p' }, filePath: null }, true));
      return { changed: true };
    },
    project_open: async (args) => {
      guardDiscard(args);
      const p = await api.controlOpenProject(args.path);
      flushSync(() => app.current.applyProject(p, true));
      return { changed: true, missing_media: p.media.filter((m) => m.missing).map((m) => m.path) };
    },
    project_save: async (args) => {
      const a = app.current;
      if (!args.path && !a.projectPath) fail('bad_args', 'Ce projet n’a pas encore de fichier : donne path.');
      const same = args.path && a.projectPath && args.path.toLowerCase() === a.projectPath.toLowerCase();
      const target = args.path ? await api.controlCheckTarget(args.path, '.cupkata', args.overwrite || same) : a.projectPath;
      const saved = await api.saveProject(a.serialize(), target);
      flushSync(() => a.markSaved(saved));
      return { path: saved };
    },
    recovery_choose: (args) => {
      const a = app.current;
      if (!a.recovery) fail('invalid', 'Aucune reprise n’est proposée.');
      flushSync(() => a.chooseRecovery(args.action === 'resume'));
      return { changed: true };
    },
    set_settings: (args) => {
      flushSync(() => {
        const a = app.current;
        if (args.resolution) a.setResolution(args.resolution);
        if (args.ratio) a.setRatio(args.ratio);
        if (args.normalize != null) a.setNormalize(args.normalize);
      });
      return { changed: true };
    },
    undo: () => clipsChange({ type: 'UNDO' }),
    redo: () => clipsChange({ type: 'REDO' }),

    media_import: async (args) => {
      const results = await api.probeMedia(args.paths);
      const known = new Map(app.current.state.media.map((m) => [m.path.toLowerCase(), m]));
      const items = results.filter((r) => !r.error && !known.has(r.path.toLowerCase())).map((r) => ({ ...r, id: crypto.randomUUID() }));
      if (items.length) dispatch({ type: 'ADD_MEDIA', items });
      const added = new Map(items.map((m) => [m.path.toLowerCase(), m]));
      return {
        media: results.filter((r) => !r.error).map((r) => {
          const m = added.get(r.path.toLowerCase()) || known.get(r.path.toLowerCase());
          return mediaInfo(m);
        }),
        errors: results.filter((r) => r.error).map((r) => ({ path: r.path, message: r.error })),
      };
    },
    filters_import: async (args) => {
      const results = await api.controlImportFilters(args.paths);
      const filters = results.filter((r) => !r.error);
      if (app.current.state.filters.length + filters.length > MAX_CUSTOM_FILTERS) fail('invalid', `Un projet garde ${MAX_CUSTOM_FILTERS} filtres importés au plus.`);
      for (const filter of filters) dispatch({ type: 'ADD_FILTER', filter });
      return { filters: filters.map(({ id, name }) => ({ id, name })), errors: results.filter((r) => r.error).map(({ name, error }) => ({ name, message: error })) };
    },
    music_search: async (args) => {
      const { results, failed } = await api.searchMusic({ query: args.query, page: args.page, commercial: !!args.commercial_only });
      return {
        results: results.map(({ id, title, artist, source, duration, licence, commercial, credit, downloadable, page }) => ({ id, title, artist, source, duration, licence, commercial, credit_required: credit, downloadable, page })),
        failed_sources: failed.map((f) => f.source),
      };
    },
    music_download: async (args) => {
      const { item, credit, needsCredit } = await api.downloadMusic(args.id);
      const id = crypto.randomUUID();
      dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
      return { media: mediaInfo({ ...item, id }), credit, credit_required: needsCredit };
    },
    music_generate: async (args) => {
      flushSync(() => app.current.setBusy('music'));
      try {
        const item = await api.generateMusic({ prompt: args.prompt, duration: args.duration ?? 10 });
        const id = crypto.randomUUID();
        dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
        return { media: mediaInfo({ ...item, id }) };
      } finally {
        flushSync(() => app.current.setBusy(null));
      }
    },
    media_remove: (args) => {
      mediaExists(app.current, args.media_id);
      dispatch({ type: 'REMOVE_MEDIA', id: args.media_id });
      return { changed: true };
    },

    clip_add: (args) => {
      const m = mediaOf(app.current, args.media_id);
      const before = app.current.state.clips;
      dispatch({ type: 'ADD_CLIP', mediaId: m.id, track: args.track, start: args.start, lane: args.lane });
      if (app.current.state.clips === before) fail('invalid', `Ce média ne peut pas aller sur la piste ${args.track}.`);
      return { clip: newest() };
    },
    text_add: (args) => {
      const preset = args.preset ? TEXT_PRESETS.find((p) => p.id === args.preset) : null;
      if (args.preset && !preset) fail('bad_args', `Style inconnu : ${args.preset}. Voir list_catalog.`);
      for (const key of ['style', 'anim']) {
        if (args[key] && !textRules[key](args[key])) fail('bad_args', `${key} contient un réglage inconnu ou hors limites.`);
      }
      const style = { ...DEFAULT_TEXT_STYLE, ...preset?.style, ...args.style };
      dispatch({ type: 'ADD_TEXT', start: args.start ?? app.current.time, lane: args.lane, style });
      const id = app.current.state.selectedId;
      setDuration(id, args.duration);
      dispatch({ type: 'UPDATE_CLIP', id, patch: { text: args.text, ...(args.anim ? { anim: args.anim } : {}) } });
      return { clip: newest() };
    },
    effect_add: (args) => {
      if (!EFFECT_IDS.ids.includes(args.effect)) fail('bad_args', `Effet inconnu : ${args.effect}. Voir list_catalog.`);
      dispatch({ type: 'ADD_FX_ITEM', effectType: args.effect, start: args.start ?? app.current.time, intensity: args.intensity, lane: args.lane });
      setDuration(app.current.state.selectedId, args.duration);
      return { clip: newest() };
    },
    filter_add: (args) => {
      const a = app.current;
      if (!PRESETS.some((p) => p.id === args.filter) && !a.state.filters.some((f) => f.id === args.filter)) fail('bad_args', `Filtre inconnu : ${args.filter}. Voir list_catalog.`);
      dispatch({ type: 'ADD_FILTER_ITEM', filterId: args.filter, start: args.start ?? a.time, amount: args.amount, lane: args.lane });
      setDuration(app.current.state.selectedId, args.duration);
      return { clip: newest() };
    },
    slideshow_add: (args) => {
      for (const id of args.media_ids) if (mediaOf(app.current, id).type === 'audio') fail('invalid', 'Un diaporama ne contient que des images ou des vidéos.');
      if (args.transition && !patchRules({ track: 'video' }, []).transition(args.transition)) fail('bad_args', 'transition invalide.');
      if (args.effect && !isEffect(args.effect)) fail('bad_args', 'effect invalide.');
      const before = new Set(app.current.state.clips.map((c) => c.id));
      dispatch({ type: 'ADD_SLIDESHOW', mediaIds: args.media_ids, photoDuration: args.photo_duration, rounds: args.rounds ?? 1, shuffle: !!args.shuffle, transition: args.transition, effect: args.effect });
      return { clips: app.current.state.clips.filter((c) => !before.has(c.id)) };
    },

    clip_update: (args) => {
      const a = app.current;
      const clip = clipOf(a, args.clip_id);
      const rules = patchRules(clip, a.state.filters);
      for (const [key, value] of Object.entries(args.patch)) {
        if (!rules[key]) fail('bad_args', `Le champ ${key} n’existe pas sur la piste ${clip.track}. Attendus : ${Object.keys(rules).join(', ')}.`);
        if (!rules[key](value)) fail('bad_args', `Valeur invalide pour ${key}. Voir le guide et list_catalog.`);
      }
      const patch = mergedPatch(clip, args.patch);
      checkComplete(patch);
      dispatch({ type: 'CHECKPOINT' });
      dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
      return { clip: clipOf(app.current, clip.id) };
    },
    clip_keyframe: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video', 'audio');
      if (clip.track === 'audio' && args.property !== 'volume') fail('invalid', 'Un clip audio n’a que la propriété volume.');
      const tau = args.time - clip.start;
      if (tau < 0 || tau > clip.duration) fail('invalid', 'time doit être à l’intérieur du clip.');
      if (args.remove) {
        if (!keyframeAt(clip, args.property, tau)) fail('invalid', 'Aucune image clé à cet instant.');
      } else {
        const [lo, hi] = KEYFRAME_RANGES[args.property];
        if (args.value == null) fail('bad_args', 'Donne value, ou remove: true.');
        if (args.value < lo || args.value > hi) fail('bad_args', `value doit être entre ${lo} et ${hi} pour ${args.property}.`);
        if (keyframesOf(clip, args.property).length >= MAX_KEYFRAMES && !keyframeAt(clip, args.property, tau)) fail('invalid', `${MAX_KEYFRAMES} images clés au plus par propriété.`);
      }
      dispatch({ type: 'CHECKPOINT' });
      dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: args.remove ? removeKeyframe(clip, args.property, tau) : setKeyframe(clip, args.property, tau, args.value) });
      return { clip: clipOf(app.current, clip.id) };
    },
    clip_move: (args) => {
      const a = app.current;
      const clip = clipOf(a, args.clip_id);
      const lane = args.lane ?? laneOf(clip);
      if (overlaps(a.state.clips, clip.track, args.start, clip.duration, clip.id, lane)) fail('invalid', `La ligne ${lane} de la piste ${clip.track} est déjà occupée à cet endroit.`);
      dispatch({ type: 'CHECKPOINT' });
      dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { start: args.start, lane } });
      dispatch({ type: 'COMPACT_LANES' });
      return { clip: clipOf(app.current, clip.id) };
    },
    clip_trim: (args) => {
      clipOf(app.current, args.clip_id);
      const before = app.current.state.clips;
      dispatch({ type: 'TRIM_TO', id: args.clip_id, side: args.side, time: args.time });
      if (app.current.state.clips === before) fail('invalid', 'Rien à couper : cet instant est hors du clip ou au-delà de ses limites.');
      return { clip: clipOf(app.current, args.clip_id) };
    },
    clips_set_duration: (args) => {
      clipsOf(app.current, args.clip_ids);
      dispatch({ type: 'SET_DURATIONS', ids: args.clip_ids, duration: args.duration, ripple: !!args.ripple, link: true });
      return { clips: app.current.state.clips.filter((c) => args.clip_ids.includes(c.id)) };
    },
    clip_set_speed: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video', 'audio');
      dispatch({ type: 'SET_SPEED', id: clip.id, speed: args.speed });
      return { clip: clipOf(app.current, clip.id) };
    },
    clips_split: (args) => {
      clipsOf(app.current, args.clip_ids || []);
      dispatch({ type: 'SELECT_MANY', ids: args.clip_ids || [] });
      const before = new Set(app.current.state.clips.map((c) => c.id));
      dispatch({ type: 'SPLIT', time: args.time });
      const created = app.current.state.clips.filter((c) => !before.has(c.id));
      if (!created.length) fail('invalid', 'Aucun clip à couper à cet instant.');
      return { created };
    },
    clips_delete: (args) => {
      clipsOf(app.current, args.clip_ids);
      dispatch({ type: 'DELETE_MANY', ids: args.clip_ids, ripple: args.ripple !== false, link: args.link !== false });
      return { changed: true };
    },
    clips_duplicate: (args) => {
      clipsOf(app.current, args.clip_ids);
      const before = new Set(app.current.state.clips.map((c) => c.id));
      dispatch({ type: 'DUPLICATE', ids: args.clip_ids, link: args.link });
      return { created: app.current.state.clips.filter((c) => !before.has(c.id)) };
    },
    clips_reorder: (args) => {
      clipsOf(app.current, args.clip_ids);
      return clipsChange({ type: 'MOVE_ORDER', ids: args.clip_ids, dir: args.direction, link: args.link });
    },
    clips_align: (args) => {
      clipsOf(app.current, args.clip_ids);
      if (args.how === 'playhead' && args.time == null) fail('bad_args', 'how=playhead demande time.');
      return clipsChange({ type: 'ALIGN', ids: args.clip_ids, how: args.how, time: args.time, link: args.link });
    },
    clips_repeat: (args) => {
      clipsOf(app.current, args.clip_ids);
      if ((args.times == null) === (args.until == null)) fail('bad_args', 'Donne times ou until, pas les deux.');
      const before = new Set(app.current.state.clips.map((c) => c.id));
      dispatch({ type: 'REPEAT_SELECTION', ids: args.clip_ids, times: args.times, until: args.until });
      return { created: app.current.state.clips.filter((c) => !before.has(c.id)) };
    },
    clips_remove_effects: (args) => {
      clipsOf(app.current, args.clip_ids);
      return clipsChange({ type: 'REMOVE_EFFECTS', ids: args.clip_ids });
    },
    clips_select: (args) => {
      clipsOf(app.current, args.clip_ids);
      dispatch({ type: 'SELECT_MANY', ids: args.clip_ids });
      return { selection: args.clip_ids };
    },

    seek: (args) => {
      flushSync(() => {
        app.current.setPlaying(false);
        app.current.seek(args.time);
      });
      return { time: app.current.time };
    },
    play: () => {
      if (!app.current.playing) flushSync(() => app.current.togglePlay());
      return { playing: app.current.playing };
    },
    pause: () => {
      flushSync(() => app.current.setPlaying(false));
      return { playing: false, time: app.current.time };
    },
    set_zone: (args) => {
      if ((args.start == null) !== (args.end == null)) fail('bad_args', 'Donne start et end, ou aucun des deux.');
      if (args.start != null && args.end <= args.start) fail('bad_args', 'end doit être après start.');
      flushSync(() => app.current.setZone(args.start == null ? null : [args.start, args.end]));
      return { zone: app.current.zone };
    },

    freeze_frame: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video');
      if (args.time <= clip.start + 0.05 || args.time >= clip.start + clip.duration - 0.05) fail('invalid', 'time doit être à l’intérieur du clip.');
      flushSync(() => app.current.seek(args.time));
      return runTool(() => app.current.freezeFrame(clip));
    },
    clip_reverse: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video', 'audio');
      if (app.current.state.media.find((m) => m.id === clip.mediaId)?.type === 'image') fail('invalid', 'Une image ne peut pas être inversée.');
      return runTool(() => app.current.reverseClip(clip));
    },
    clip_cutout: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video');
      return runTool(() => app.current.cutoutClip(clip));
    },
    marker_add: (args) => {
      const time = args.time ?? app.current.time;
      if (app.current.state.markers.some((m) => Math.abs(m.time - time) < 0.5 / FPS)) fail('invalid', 'Un marqueur existe déjà à cet instant.');
      const marker = { id: crypto.randomUUID(), time, label: args.label ?? '', beat: false };
      dispatch({ type: 'SET_MARKERS', markers: [...app.current.state.markers, marker] });
      return { marker };
    },
    marker_remove: (args) => {
      const { markers } = app.current.state;
      if (!markers.some((m) => m.id === args.marker_id)) fail('not_found', 'Marqueur inconnu.');
      dispatch({ type: 'SET_MARKERS', markers: markers.filter((m) => m.id !== args.marker_id) });
      return { removed: true };
    },
    transcript_generate: (args) =>
      runTool(() => app.current.generateSubtitles({ language: args.language ?? 'french', model: args.model ?? 'onnx-community/whisper-base', source: 'main', wordsOnly: true })),
    transcript_get: () => ({ words: timelineWords(app.current.state.clips, app.current.state.media) }),
    transcript_cut: (args) => {
      const words = timelineWords(app.current.state.clips, app.current.state.media);
      if (args.first > args.last || args.last >= words.length) fail('bad_args', 'Ces mots n’existent pas. Voir transcript_get.');
      const range = cutRangeOf(words, args.first, args.last);
      dispatch({ type: 'CUT_RANGES', ranges: [range] });
      return { removed_seconds: range[1] - range[0] };
    },
    clip_beats: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video', 'audio');
      if (!app.current.state.media.find((m) => m.id === clip.mediaId)?.hasAudio) fail('invalid', 'Ce clip n’a pas de son.');
      return runTool(() => app.current.applyBeats(clip, args.mode, args.every ?? 1));
    },
    clip_reframe: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video');
      if (laneOf(clip) !== 0) fail('invalid', 'Le recadrage concerne la piste principale.');
      return runTool(() => app.current.reframeClip(clip));
    },
    clip_clean_voice: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video', 'audio');
      if (!app.current.state.media.find((m) => m.id === clip.mediaId)?.hasAudio) fail('invalid', 'Ce clip n’a pas de son.');
      return runTool(() => app.current.cleanVoice(clip));
    },
    sticker_add: (args) => {
      if (!!args.shape === !!args.emoji) fail('bad_args', 'Donne shape ou emoji.');
      if (args.shape && !STICKER_IDS.includes(args.shape)) fail('bad_args', `Forme inconnue : ${args.shape}. Voir list_catalog.`);
      if (args.color && !HEX.test(args.color)) fail('bad_args', 'color attend une couleur #rrggbb.');
      const style = {
        ...(args.emoji ? { font: 'Segoe UI Emoji', bold: false, size: 180 } : { color: '#ffe000', size: 160 }),
        outline: false, y: 0.5,
        ...(args.color ? { color: args.color } : {}),
        ...(args.x != null ? { x: args.x } : {}),
        ...(args.y != null ? { y: args.y } : {}),
        ...(args.size != null ? { size: args.size } : {}),
      };
      dispatch({
        type: 'ADD_TEXT', start: args.start ?? app.current.time, style, duration: args.duration,
        text: args.emoji ?? SHAPES.find((s) => s.id === args.shape).name, sticker: args.shape,
      });
      return { clip: app.current.state.clips.find((c) => c.id === app.current.state.selectedId) };
    },
    captions_word_by_word: (args) => {
      if (args.color && !HEX.test(args.color)) fail('bad_args', 'color attend une couleur #rrggbb.');
      const karaoke = args.mode === 'none' ? null : { mode: args.mode, color: args.color ?? '#ffe000' };
      app.current.setCaptions((c) => ({ ...c, karaoke }));
      dispatch({ type: 'REPLACE_CLIPS', clips: app.current.state.clips.map((c) => (c.track === 'text' && c.auto ? { ...c, karaoke: karaoke ?? undefined } : c)) });
      return { changed: true };
    },
    clip_cut_silences: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'video', 'audio');
      if (!app.current.state.media.find((m) => m.id === clip.mediaId)?.hasAudio) fail('invalid', 'Ce clip n’a pas de son.');
      return runTool(() => app.current.cutSilences(clip, args.min_silence));
    },
    text_speak: (args) => {
      const clip = clipOf(app.current, args.clip_id, 'text');
      return runTool(() => app.current.speakText(clip, args.lang, args.rate ?? 1));
    },
    texts_translate: (args) => runTool(() => app.current.translateTexts(args.from, args.to, !!args.only_auto)),
    subtitles_generate: (args) => {
      if (args.source && args.clip_id) fail('bad_args', 'Donne source ou clip_id, pas les deux.');
      if (args.clip_id) {
        clipOf(app.current, args.clip_id, 'video', 'audio');
        dispatch({ type: 'SELECT', id: args.clip_id });
      }
      return runTool(() =>
        app.current.generateSubtitles({
          language: args.language ?? 'auto',
          model: args.model ?? 'onnx-community/whisper-base',
          source: args.clip_id ? 'selected' : args.source ?? 'video',
          maxWords: args.max_words ?? 7,
        }),
      );
    },

    export_start: async (args) => {
      if (app.current.total <= 0) fail('invalid', 'La timeline est vide.');
      const target = await api.controlCheckTarget(args.path, '.mp4', args.overwrite);
      const preset = args.preset ? EXPORT_PRESETS.find((p) => p.id === args.preset && p.ratio) : null;
      if (args.preset && !preset) fail('bad_args', `Préréglage inconnu : ${args.preset}. Voir list_catalog.`);
      const a = app.current;
      const from = args.from ?? 0;
      const to = args.to ?? a.total;
      if ((args.from != null || args.to != null) && !(from >= 0 && to > from && from < a.total)) fail('bad_args', 'Extrait invalide : il faut 0 ≤ from < to.');
      if (preset) {
        a.setRatio(preset.ratio);
        a.setResolution(preset.resolution);
        await settle();
      }
      app.current.startExport(target, {
        encode: preset ? { video: preset.video, audio: preset.audio } : null,
        range: args.from != null || args.to != null ? { start: from, duration: Math.min(to, a.total) - from } : null,
      });
      return { started: true, path: target };
    },
    export_cancel: () => {
      if (!isExporting(app.current)) fail('invalid', 'Aucun export en cours.');
      app.current.cancelExport();
      return { cancelled: true };
    },
    task_cancel: () => {
      api.aiCancel();
      api.cancelTranscription();
      api.cancelMusic();
      return { cancelled: true };
    },
  };
}

function mediaExists(a, id) {
  if (!a.state.media.some((m) => m.id === id)) fail('not_found', `Média inconnu : ${id}.`);
}
const isExporting = (a) => a.exp?.status === 'preparing' || a.exp?.status === 'running';
const isWorking = (a) => isExporting(a) || !!a.aiJob || !!a.busy;

// Commands that only read, or that stop what's running, don't wait for the running work to finish.
const ALWAYS_ALLOWED = new Set(['get_state', 'list_catalog', 'wait_idle', 'export_cancel', 'task_cancel', 'recovery_choose']);
const SPECS = new Map(SPEC.commands.map((c) => [c.name, c]));

// Listens for commands, one at a time, in the order they arrive. onLog receives each finished one.
export function installControl(app, dispatch, onLog) {
  const commands = createCommands(app, dispatch);
  let queue = Promise.resolve();

  async function execute(command, args) {
    const spec = SPECS.get(command);
    if (!spec) fail('unknown_command', `Commande inconnue : ${command}. Voir GET /v1/capabilities.`);
    checkArgs(spec, args);
    await settle();
    if (!ALWAYS_ALLOWED.has(command)) {
      const a = app.current;
      if (a.recovery) fail('recovery_pending', 'Cupkata demande s’il faut reprendre le dernier montage : réponds avec recovery_choose.');
      if (isExporting(a)) fail('busy', 'Un export est en cours : attends sa fin ou annule-le.');
      if (a.aiJob || a.busy) fail('busy', 'Une tâche est en cours : attends sa fin ou annule-la.');
    }
    return commands[command](args);
  }

  const off = api.onControlRequest(({ id, command, args }) => {
    // get_state stays immediate, so progress can be followed during a long command.
    const run = async () => {
      try {
        const result = await execute(command, args);
        api.controlRespond({ id, ok: true, result });
        if (command !== 'get_state') onLog({ command, ok: true });
      } catch (err) {
        const known = err instanceof ControlError;
        const tagged = /^(?:Error invoking remote method '[^']+': (?:Error: )?)?\[(\w+)\] (.*)$/s.exec(String(err?.message || err));
        const code = known ? err.code : tagged?.[1] || 'error';
        const message = known ? err.message : tagged?.[2] || app.current.cleanError(err);
        api.controlRespond({ id, ok: false, error: { code, message } });
        onLog({ command, ok: false, message });
      }
    };
    if (ALWAYS_ALLOWED.has(command)) run();
    else queue = queue.then(run);
  });
  return off;
}
