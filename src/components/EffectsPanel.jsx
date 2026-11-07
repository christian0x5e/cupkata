import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, clipEffect, DEFAULT_INTENSITY, drawEffectOverlay, EFFECTS, renderClipEffect } from '../effects.js';

import { isOverlay } from '../project.js';
import { playComparison, TILE_H as TH, TILE_W as TW, usePreviewPictures } from '../previewPictures.js';
import SideMenu from './SideMenu.jsx';
import { EffectIcon } from './icons.jsx';
import { T } from '../i18n.js';

// Moment shown on a still thumbnail (in a 4-second sample): where the effect is easiest to recognise.
const STILL_AT = { theend: 3.6, irisout: 3.5, opening: 1.7, irisin: 0.9, countdown: 1.5 };

export const EFFECT_MIME = 'application/x-cupkata-effect';

// Whether the effect changes over the 4 seconds of the sample; those that do not get compared with the original.
const MOMENTS = [0.1, 1.3, 2.6, 3.7];
function moves(ctx, draw) {
  let first = null;
  return MOMENTS.some((tau) => {
    draw(tau);
    const { data } = ctx.getImageData(0, 0, TW, TH);
    first ??= data;
    return data.some((v, i) => v !== first[i]);
  });
}

function EffectTile({ effect, picture, active, onApply }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!picture) return undefined;
    const ctx = ref.current.getContext('2d');
    const clip = { id: `apercu-${effect.id}`, duration: 4, effect: { type: effect.id, intensity: DEFAULT_INTENSITY } };
    const fx = clipEffect(clip);
    const draw = (tau) => {
      renderClipEffect(ctx, TW, TH, fx, tau, (c, extra) => {
        c.filter = extra || 'none';
        c.drawImage(picture, 0, 0);
        c.filter = 'none';
      });
      drawEffectOverlay(ctx, clip, tau, TW, TH);
    };
    const still = () => draw(STILL_AT[effect.id] ?? 1.3);
    if (!hover) {
      still();
      return undefined;
    }
    if (!moves(ctx, draw)) {
      still();
      return playComparison(ctx, picture);
    }
    let raf;
    const t0 = performance.now();
    const loop = () => {
      draw(((performance.now() - t0) / 1000) % 4);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [effect.id, hover, picture]);

  return (
    <button
      className={`fx-tile ${active ? 'active' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(EFFECT_MIME, effect.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onApply(effect.id)}
      title={T("{0} — clique pour l'appliquer au clip sélectionné, ou glisse-le sur un clip", effect.label)}
    >
      <canvas ref={ref} width={TW} height={TH} />
      <span>
        <EffectIcon id={effect.id} /> {effect.label}
      </span>
    </button>
  );
}

const NO_FILES = [];

export default function EffectsPanel({ clip, media, time, dispatch, onNotice }) {
  const [cat, setCat] = useState(T('Tous'));
  const fx = clipEffect(clip);
  // Overlays take no clip effect: with one selected, a new effect goes on the effect track instead.
  const onClip = clip?.track === 'video' && !isOverlay(clip);
  const onItem = clip?.track === 'fx';
  const usable = onClip || onItem;
  const picture = usePreviewPictures(NO_FILES, 1)?.[0];

  // Clip selected: effect on that clip. Effect-track item selected: change it. Nothing: new item at the playhead.
  const apply = (type) => {
    if (!usable) {
      if (!type) return;
      dispatch({ type: 'ADD_FX_ITEM', effectType: type, start: time });
      onNotice({ kind: 'ok', text: T('Effet posé sur la piste Effets : règle sa durée et ses fondus dans Propriétés.') });
      return;
    }
    if (onItem && !type) {
      dispatch({ type: 'DELETE', id: clip.id });
      return;
    }
    dispatch({ type: 'CHECKPOINT' });
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { effect: type ? { type, intensity: fx?.intensity ?? DEFAULT_INTENSITY } : null } });
  };

  const shown = cat === T('Tous') ? EFFECTS : EFFECTS.filter((e) => e.cat === cat);

  return (
    <div className="lp-split">
      <SideMenu
        items={[T('Tous'), ...CATEGORIES].map((c) => ({ id: c, label: c, count: c === T('Tous') ? EFFECTS.length : EFFECTS.filter((e) => e.cat === c).length }))}
        value={cat}
        onChange={setCat}
      />
    <div className="fx-panel">
      <div className="fx-target">
        {onClip && (
          <>
            <span className="muted">{T('Clip :')}</span> {media?.name || T('clip')}
            {fx && (
              <button className="btn ghost small" onClick={() => apply(null)}>
                {T("Retirer l'effet")}
              </button>
            )}
          </>
        )}
        {onItem && (
          <>
            <span className="muted">{T('Piste Effets :')}</span> {T('clique un effet pour le remplacer')}
            <button className="btn ghost small" onClick={() => apply(null)}>
              {T('Supprimer')}
            </button>
          </>
        )}
        {!usable && <span className="muted">{T('Clique un effet pour le poser sur la piste Effets, ou glisse-le sur un clip.')}</span>}
        <span className="muted fx-source">{T("Survole une vignette pour voir l'effet.")}</span>
      </div>
      <div className="fx-grid">
        {shown.map((e) => (
          <EffectTile key={e.id} effect={e} picture={picture} active={fx?.type === e.id} onApply={apply} />
        ))}
      </div>
    </div>
    </div>
  );
}
