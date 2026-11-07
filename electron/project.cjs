const path = require('path');
const { T } = require('./i18n.cjs');
const fs = require('fs');

const TYPES = ['video', 'image', 'audio'];
const TRACKS = ['video', 'audio', 'text', 'fx', 'filter'];
const TRANSITION_IDS = [
  'fade', 'fadeblack', 'fadewhite', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown', 'circleopen', 'zoomin', 'hblur',
  'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 'circleclose', 'radial', 'vertopen', 'vertclose', 'horzopen', 'horzclose',
  'diagtl', 'diagtr', 'diagbl', 'diagbr', 'rectcrop', 'pixelize', 'squeezeh',
  'coverleft', 'coverright', 'coverup', 'coverdown', 'revealleft', 'revealright', 'revealup', 'revealdown',
];
const EFFECT_IDS = require('../shared/effects.json').ids;
// Kept in sync with shared/filters.mjs (ESM, not loadable here synchronously).
// Must list every id of shared/filters.mjs PRESETS (checked by the filters test).
const PRESET_IDS = [
  'doux', 'clair', 'net', 'lumineux', 'portrait', 'miel', 'coucher', 'ambre', 'cannelle', 'ete',
  'glacier', 'nordique', 'brume', 'minuit', 'menthe', 'sarcelle', 'blockbuster', 'western', 'thriller', 'desature',
  'polar', 'retro70', 'instantane', 'pellicule', 'sepiadoux', 'delave', 'cartepostale', 'nbclassique', 'nbcontraste', 'nbdoux',
  'argentique', 'selenium', 'nbchaud', 'pastel', 'barbe', 'lavande', 'peche', 'eclatant', 'tropical', 'neon',
  'popcolor', 'nuitamericaine', 'neonnuit', 'clairdelune', 'naturelvif', 'matin', 'peau', 'nature', 'studio', 'ombresdouces',
  'heuredoree', 'caramel', 'terracotta', 'feudecamp', 'cuivre', 'abricot', 'arctique', 'acier', 'ocean', 'givre',
  'lagon', 'dune', 'matrice', 'noirfilm', 'apocalypse', 'aventure', 'scifi', 'drame', 'bleacher', 'kodaque',
  'retro80', 'annees50', 'jauni', 'vhs', 'croise', 'nbdramatique', 'nbfiltrerouge', 'nbfiltrevert', 'nbdelave', 'cyanotype',
  'platine', 'menthealeau', 'rosepoudre', 'nuage', 'dragee', 'citronnade', 'saturation', 'arcenciel', 'fluo', 'bonbon',
  'hdr', 'ville', 'cyberpunk', 'vision', 'lanterne', 'plage', 'montagne', 'desert', 'tokyo', 'paris',
  'jungle', 'mediterranee', 'gourmand', 'frais', 'cafe', 'patisserie', 'grill', 'printemps', 'automne', 'hiver',
  'canicule', 'pluie', 'rougeseul', 'orangeseul', 'jauneseul', 'vertseul', 'bleuseul', 'roseseul', 'duobleuorange', 'duorose',
  'duovert', 'duorouge', 'duocyan', 'duoor', 'infrarouge', 'inverse', 'bd', 'affiche', 'echange', 'arcade',
  'thermique',
];
const FILTER_ID = /^(custom:)?[\w-]{1,80}$/;
const CUSTOM_LUT_SIZE = 33;

function sanitizeFilters(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (f) =>
        f && typeof f.id === 'string' && /^custom:[\w-]{1,80}$/.test(f.id) && f.size === CUSTOM_LUT_SIZE &&
        Array.isArray(f.data) && f.data.length === CUSTOM_LUT_SIZE ** 3 * 3,
    )
    .slice(0, 30)
    .map((f) => ({
      id: f.id,
      name: typeof f.name === 'string' ? f.name.slice(0, 60) : 'Filtre importé',
      size: CUSTOM_LUT_SIZE,
      data: f.data.map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)),
    }));
}
const RESOLUTIONS = ['720p', '1080p', '1440p'];
// Picture formats (same ids as src/ratio.js).
const RATIOS = ['16:9', '9:16', '1:1', '4:5', '4:3', '3:4', '21:9'];
const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

const HEX = /^#[0-9a-fA-F]{6}$/;
// Same ids as BUBBLES and TEXT_EFFECTS in src/text.js.
const TEXT_BUBBLES = ['none', 'round', 'speech', 'thought', 'shout', 'ellipse', 'banner', 'tag', 'note'];
const TEXT_EFFECTS = ['none', 'neon', 'glitch', '3d', 'long', 'hollow', 'double', 'sticker', 'retro', 'echo', 'chrome', 'fire', 'ice', 'rainbow'];
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function sanitizeStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  const out = {};
  if (typeof s.font === 'string' && /^[\w \-]{1,40}$/.test(s.font)) out.font = s.font;
  if (Number.isFinite(s.size)) out.size = clampTo(s.size, 20, 400);
  for (const k of ['color', 'outlineColor', 'boxColor', 'shadowColor', 'glowColor', 'bubbleColor', 'bubbleBorder']) {
    if (typeof s[k] === 'string' && HEX.test(s[k])) out[k] = s[k];
  }
  if (TEXT_BUBBLES.includes(s.bubble)) out.bubble = s.bubble;
  if (TEXT_EFFECTS.includes(s.effect)) out.effect = s.effect;
  if (s.tail === 'left' || s.tail === 'right') out.tail = s.tail;
  if (s.gradient === null || (typeof s.gradient === 'string' && HEX.test(s.gradient))) out.gradient = s.gradient;
  for (const k of ['bold', 'italic', 'upper', 'outline', 'box', 'shadow', 'glow']) if (typeof s[k] === 'boolean') out[k] = s[k];
  if (['left', 'center', 'right'].includes(s.align)) out.align = s.align;
  if (Number.isFinite(s.spacing)) out.spacing = clampTo(s.spacing, -0.05, 0.5);
  if (Number.isFinite(s.outlineWidth)) out.outlineWidth = clampTo(s.outlineWidth, 0, 0.3);
  if (Number.isFinite(s.boxOpacity)) out.boxOpacity = clampTo(s.boxOpacity, 0, 1);
  if (Number.isFinite(s.opacity)) out.opacity = clampTo(s.opacity, 0, 1);
  if (Number.isFinite(s.rotation)) out.rotation = clampTo(s.rotation, -360, 360);
  if (Number.isFinite(s.x)) out.x = clampTo(s.x, -0.5, 1.5);
  if (Number.isFinite(s.y)) out.y = clampTo(s.y, -0.5, 1.5);
  return out;
}

const TEXT_ANIMS = {
  in: ['none', 'fade', 'up', 'down', 'left', 'right', 'pop', 'zoom', 'type', 'spin'],
  out: ['none', 'fade', 'up', 'down', 'zoom', 'shrink'],
  loop: ['none', 'pulse', 'float', 'shake', 'swing', 'blink'],
};
function sanitizeAnim(anim) {
  if (!anim || typeof anim !== 'object') return null;
  const out = {};
  for (const k of ['in', 'out', 'loop']) out[k] = TEXT_ANIMS[k].includes(anim[k]) ? anim[k] : 'none';
  out.duration = clampTo(finite(anim.duration, 0.5), 0.1, 2);
  return out;
}

// Same names and limits as src/keyframes.js.
const KEYFRAME_RANGES = { scale: [0.02, 4], x: [-1, 2], y: [-1, 2], rotation: [-360, 360], opacity: [0, 1], volume: [0, 2] };
const KEYFRAME_EASES = ['in', 'out', 'inOut', 'hold'];
function sanitizeKeyframes(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [prop, [lo, hi]] of Object.entries(KEYFRAME_RANGES)) {
    const list = Array.isArray(raw[prop]) ? raw[prop].filter((k) => Number.isFinite(k?.t) && Number.isFinite(k?.v)) : [];
    if (list.length) out[prop] = list.slice(0, 100).map((k) => ({ t: k.t, v: clampTo(k.v, lo, hi), ...(prop !== 'volume' && KEYFRAME_EASES.includes(k.ease) ? { ease: k.ease } : {}) })).sort((a, b) => a.t - b.t);
  }
  return Object.keys(out).length ? out : null;
}

const VOICE_EFFECT_IDS = require('../shared/voice-effects.json').map((e) => e.id);
const STICKER_IDS = ['arrow', 'ring', 'frame', 'band', 'line', 'star', 'heart', 'progress'];
const MAX_WORDS = 200000;

// Transcribed words of a file: w, then its start and end in seconds of the source.
function sanitizeWords(raw) {
  if (!Array.isArray(raw)) return undefined;
  const words = raw
    .slice(0, MAX_WORDS)
    .filter((x) => x && typeof x.w === 'string' && Number.isFinite(x.t) && Number.isFinite(x.e))
    .map((x) => ({ w: x.w.slice(0, 100), t: x.t, e: x.e }));
  return words.length ? words : undefined;
}

// The words of a subtitle, in seconds from its start, and the way the spoken one stands out.
function sanitizeCaptionWords(raw) {
  if (!Array.isArray(raw)) return undefined;
  const words = raw
    .slice(0, 100)
    .filter((x) => x && typeof x.w === 'string' && Number.isFinite(x.a) && Number.isFinite(x.b))
    .map((x) => ({ w: x.w.slice(0, 100), a: x.a, b: x.b }));
  return words.length ? words : undefined;
}

function sanitizeKaraoke(k) {
  if (!k || !['color', 'box', 'pop'].includes(k.mode)) return undefined;
  return { mode: k.mode, color: typeof k.color === 'string' && HEX.test(k.color) ? k.color : '#ffe000' };
}

function sanitizeReframe(raw) {
  if (!Array.isArray(raw)) return null;
  const points = raw
    .slice(0, 200)
    .filter((p) => p && [p.t, p.x, p.y].every(Number.isFinite))
    .map((p) => ({ t: Math.max(0, p.t), x: clampTo(p.x, 0, 1), y: clampTo(p.y, 0, 1) }))
    .sort((a, b) => a.t - b.t);
  return points.length ? points : null;
}

function sanitizeMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 2000)
    .filter((m) => m && typeof m.id === 'string' && Number.isFinite(m.time) && m.time >= 0)
    .map((m) => ({ id: m.id, time: m.time, label: typeof m.label === 'string' ? m.label.slice(0, 80) : '', beat: m.beat === true }));
}

function sanitize(raw) {
  if (!raw || raw.app !== 'cupkata' || !Array.isArray(raw.media) || !Array.isArray(raw.clips)) {
    throw new Error(T("Ce fichier n'est pas un projet Cupkata valide"));
  }
  const media = raw.media
    .filter((m) => m && typeof m.id === 'string' && typeof m.path === 'string' && TYPES.includes(m.type))
    .map((m) => ({
      id: m.id,
      path: m.path,
      relPath: typeof m.relPath === 'string' ? m.relPath : null,
      name: typeof m.name === 'string' ? m.name : path.basename(m.path),
      type: m.type,
      duration: Math.max(0, finite(m.duration)),
      width: finite(m.width),
      height: finite(m.height),
      hasAudio: m.hasAudio === true,
      words: sanitizeWords(m.words),
    }));
  const ids = new Set(media.map((m) => m.id));
  const isText = (c) => c.track === 'text';
  const isFx = (c) => c.track === 'fx';
  const isFilterItem = (c) => c.track === 'filter';
  const noMedia = (c) => isText(c) || isFx(c) || isFilterItem(c);
  const clips = raw.clips
    .filter(
      (c) =>
        c && typeof c.id === 'string' && TRACKS.includes(c.track) && finite(c.duration) > 0 &&
        (isText(c)
          ? typeof c.text === 'string'
          : isFx(c)
            ? EFFECT_IDS.includes(c.effect?.type)
            : isFilterItem(c)
              ? typeof c.filter?.id === 'string' && FILTER_ID.test(c.filter.id)
              : ids.has(c.mediaId)),
    )
    .map((c) => {
      const base = {
        id: c.id,
        mediaId: noMedia(c) ? null : c.mediaId,
        track: c.track,
        // Stacked lanes; video lanes above 0 are overlays (picture-in-picture).
        lane: Math.min(999, Math.max(0, Math.floor(finite(c.lane)))),
        start: Math.max(0, finite(c.start)),
        in: noMedia(c) ? 0 : Math.max(0, finite(c.in)),
        duration: c.duration,
      };
      if (isFilterItem(c)) {
        return {
          ...base,
          filter: { id: c.filter.id, amount: Math.min(1, Math.max(0, finite(c.filter.amount, 0.8))) },
          fadeIn: Math.max(0, finite(c.fadeIn, 0.5)),
          fadeOut: Math.max(0, finite(c.fadeOut, 0.5)),
        };
      }
      if (isFx(c)) {
        return {
          ...base,
          effect: { type: c.effect.type, intensity: Math.min(1, Math.max(0, finite(c.effect.intensity, 0.7))) },
          fadeIn: Math.max(0, finite(c.fadeIn, 0.5)),
          fadeOut: Math.max(0, finite(c.fadeOut, 0.5)),
        };
      }
      if (isText(c)) {
        return {
          ...base,
          text: c.text.slice(0, 500),
          style: sanitizeStyle(c.style),
          anim: sanitizeAnim(c.anim),
          auto: c.auto === true,
          words: sanitizeCaptionWords(c.words),
          karaoke: sanitizeKaraoke(c.karaoke),
          sticker: STICKER_IDS.includes(c.sticker) ? c.sticker : undefined,
        };
      }
      return {
        ...base,
        volume: Math.min(2, Math.max(0, finite(c.volume, 1))),
        speed: Math.min(4, Math.max(0.25, finite(c.speed, 1))),
        // A reversed clip remembers the original source, to put it back the right way round.
        reversed:
          c.reversed && ids.has(c.reversed.mediaId)
            ? { mediaId: c.reversed.mediaId, in: Math.max(0, finite(c.reversed.in)), span: Math.max(0, finite(c.reversed.span)) }
            : null,
        fadeIn: Math.max(0, finite(c.fadeIn)),
        fadeOut: Math.max(0, finite(c.fadeOut)),
        muted: c.muted === true,
        keyframes: sanitizeKeyframes(c.keyframes),
        duck: c.track === 'audio' && c.duck ? { level: Math.min(1, Math.max(0, finite(c.duck.level, 0.25))) } : null,
        filter:
          c.track === 'video' && typeof c.filter?.id === 'string' && FILTER_ID.test(c.filter.id)
            ? { id: c.filter.id, amount: Math.min(1, Math.max(0, finite(c.filter.amount, 0.8))) }
            : null,
        color: {
          brightness: Math.min(1.5, Math.max(0.5, finite(c.color?.brightness, 1))),
          contrast: Math.min(1.5, Math.max(0.5, finite(c.color?.contrast, 1))),
          saturation: Math.min(2, Math.max(0, finite(c.color?.saturation, 1))),
        },
        effect: EFFECT_IDS.includes(c.effect?.type)
          ? { type: c.effect.type, intensity: Math.min(1, Math.max(0, finite(c.effect.intensity, 0.7))) }
          : null,
        // A clip whose background was removed remembers the original source, to put it back.
        cutout:
          c.cutout && ids.has(c.cutout.mediaId) ? { mediaId: c.cutout.mediaId, in: Math.max(0, finite(c.cutout.in)) } : null,
        // The same for a clip that plays a stabilized copy.
        stable:
          c.stable && ids.has(c.stable.mediaId) ? { mediaId: c.stable.mediaId, in: Math.max(0, finite(c.stable.in)) } : null,
        // The same for a clip that plays a copy with its voice cleaned.
        cleaned:
          c.cleaned && ids.has(c.cleaned.mediaId) ? { mediaId: c.cleaned.mediaId, in: Math.max(0, finite(c.cleaned.in)) } : null,
        // The same for a clip that plays a copy with a voice effect.
        voiced:
          c.voiced && ids.has(c.voiced.mediaId) && VOICE_EFFECT_IDS.includes(c.voiced.effect)
            ? { mediaId: c.voiced.mediaId, in: Math.max(0, finite(c.voiced.in)), effect: c.voiced.effect }
            : null,
        reframe: c.track === 'video' ? sanitizeReframe(c.reframe) : null,
        background:
          c.track === 'video' && ['blur', 'fill', 'color'].includes(c.background?.mode)
            ? {
                mode: c.background.mode,
                blur: Math.min(1, Math.max(0, finite(c.background.blur, 0.5))),
                color: typeof c.background.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.background.color) ? c.background.color : '#000000',
              }
            : null,
        transform:
          c.track === 'video' && c.transform && typeof c.transform === 'object'
            ? {
                x: Math.min(2, Math.max(-1, finite(c.transform.x, 0.5))),
                y: Math.min(2, Math.max(-1, finite(c.transform.y, 0.5))),
                scale: Math.min(4, Math.max(0.02, finite(c.transform.scale, 1))),
                rotation: Math.min(360, Math.max(-360, finite(c.transform.rotation, 0))),
                opacity: Math.min(1, Math.max(0, finite(c.transform.opacity, 1))),
              }
            : null,
        transition: TRANSITION_IDS.includes(c.transition?.type)
          ? { type: c.transition.type, duration: Math.min(3, Math.max(0.1, finite(c.transition.duration, 1))) }
          : null,
      };
    });
  const resolution = RESOLUTIONS.includes(raw.settings?.resolution) ? raw.settings.resolution : '1080p';
  const filters = sanitizeFilters(raw.filters);
  const filterIds = new Set([...PRESET_IDS, ...filters.map((f) => f.id)]);
  for (const c of clips) {
    if (c.track === 'video' && c.filter && !filterIds.has(c.filter.id)) c.filter = null;
  }
  const kept = clips.filter((c) => c.track !== 'filter' || filterIds.has(c.filter.id));
  const ratio = RATIOS.includes(raw.settings?.ratio) ? raw.settings.ratio : '16:9';
  const captions = raw.settings?.captions;
  return {
    media,
    clips: kept,
    filters,
    markers: sanitizeMarkers(raw.markers),
    settings: {
      resolution,
      normalize: raw.settings?.normalize === true,
      ratio,
      captions: captions ? { style: sanitizeStyle(captions.style), karaoke: sanitizeKaraoke(captions.karaoke) ?? null } : null,
    },
  };
}

function resolveMediaPath(m, baseDir) {
  const candidates = [m.path];
  if (m.relPath && baseDir) candidates.push(path.resolve(baseDir, m.relPath));
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function toFileContent(data, filePath) {
  const clean = sanitize({ app: 'cupkata', ...data });
  const dir = filePath ? path.dirname(filePath) : null;
  return JSON.stringify(
    {
      app: 'cupkata',
      version: 1,
      settings: clean.settings,
      media: clean.media.map((m) => ({ ...m, relPath: dir ? path.relative(dir, m.path) : null })),
      clips: clean.clips,
      filters: clean.filters,
      markers: clean.markers,
    },
    null,
    2,
  );
}

async function writeAtomic(filePath, content) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, content, 'utf8');
  await fs.promises.rename(tmp, filePath);
}

module.exports = { sanitize, resolveMediaPath, toFileContent, writeAtomic };
