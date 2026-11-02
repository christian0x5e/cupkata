const path = require('path');
const fs = require('fs');

const TYPES = ['video', 'image', 'audio'];
const TRACKS = ['video', 'audio', 'text', 'fx', 'filter'];
const TRANSITION_IDS = ['fade', 'fadeblack', 'fadewhite', 'wipeleft', 'slideleft', 'circleopen'];
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

function sanitize(raw) {
  if (!raw || raw.app !== 'cupkata' || !Array.isArray(raw.media) || !Array.isArray(raw.clips)) {
    throw new Error("Ce fichier n'est pas un projet Cupkata valide");
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
      if (isText(c)) return { ...base, text: c.text.slice(0, 500), style: sanitizeStyle(c.style), anim: sanitizeAnim(c.anim), auto: c.auto === true };
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
  return { media, clips: kept, filters, settings: { resolution, normalize: raw.settings?.normalize === true, ratio } };
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
