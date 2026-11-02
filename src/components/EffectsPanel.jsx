import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, clipEffect, DEFAULT_INTENSITY, drawEffectOverlay, EFFECTS, renderClipEffect } from '../effects.js';

import { isOverlay } from '../project.js';
import SideMenu from './SideMenu.jsx';

// Moment shown on a still thumbnail (in a 4-second sample): where the effect is easiest to recognise.
const STILL_AT = { theend: 3.6, irisout: 3.5, opening: 1.7, irisin: 0.9, countdown: 1.5 };

export const EFFECT_MIME = 'application/x-cupkata-effect';
const TW = 160;
const TH = 90;

// A small original scene used to preview every effect.
let sample = null;
export function sampleScene() {
  if (sample) return sample;
  sample = document.createElement('canvas');
  sample.width = TW;
  sample.height = TH;
  const c = sample.getContext('2d');
  const sky = c.createLinearGradient(0, 0, 0, TH);
  sky.addColorStop(0, '#3a7bd5');
  sky.addColorStop(1, '#f6b38a');
  c.fillStyle = sky;
  c.fillRect(0, 0, TW, TH);
  c.fillStyle = '#ffe08a';
  c.beginPath();
  c.arc(112, 34, 14, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#2f6150';
  c.beginPath();
  c.moveTo(0, 70);
  c.quadraticCurveTo(40, 48, 80, 66);
  c.quadraticCurveTo(120, 82, 160, 60);
  c.lineTo(160, 90);
  c.lineTo(0, 90);
  c.fill();
  c.fillStyle = '#1f4438';
  c.fillRect(0, 80, TW, 10);
  // A red kite and pink flowers, so filters that keep one colour (red, pink…) show something too.
  c.fillStyle = '#e8303a';
  c.beginPath();
  c.moveTo(34, 12);
  c.lineTo(46, 24);
  c.lineTo(34, 40);
  c.lineTo(22, 24);
  c.fill();
  c.strokeStyle = '#f2e6d8';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(34, 40);
  c.quadraticCurveTo(28, 52, 40, 62);
  c.stroke();
  c.fillStyle = '#ff5fa8';
  for (const [x, y] of [[18, 76], [30, 79], [52, 76], [64, 80]]) {
    c.beginPath();
    c.arc(x, y, 3, 0, Math.PI * 2);
    c.fill();
  }
  return sample;
}

function EffectTile({ effect, active, onApply }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    const clip = { id: `apercu-${effect.id}`, duration: 4, effect: { type: effect.id, intensity: 0.8 } };
    const fx = clipEffect(clip);
    const draw = (tau) => {
      renderClipEffect(ctx, TW, TH, fx, tau, (c, extra) => {
        c.filter = extra || 'none';
        c.drawImage(sampleScene(), 0, 0);
        c.filter = 'none';
      });
      drawEffectOverlay(ctx, clip, tau, TW, TH);
    };
    if (!hover) {
      draw(STILL_AT[effect.id] ?? 1.3);
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const loop = () => {
      draw(((performance.now() - t0) / 1000) % 4);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [effect.id, hover]);

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
      title={`${effect.label} — clique pour l'appliquer au clip sélectionné, ou glisse-le sur un clip`}
    >
      <canvas ref={ref} width={TW} height={TH} />
      <span>
        {effect.icon} {effect.label}
      </span>
    </button>
  );
}

export default function EffectsPanel({ clip, media, time, dispatch, onNotice }) {
  const [cat, setCat] = useState('Tous');
  const fx = clipEffect(clip);
  // Overlays take no clip effect: with one selected, a new effect goes on the effect track instead.
  const onClip = clip?.track === 'video' && !isOverlay(clip);
  const onItem = clip?.track === 'fx';
  const usable = onClip || onItem;

  // Clip selected: effect on that clip. Effect-track item selected: change it. Nothing: new item at the playhead.
  const apply = (type) => {
    if (!usable) {
      if (!type) return;
      dispatch({ type: 'ADD_FX_ITEM', effectType: type, start: time });
      onNotice({ kind: 'ok', text: "Effet posé sur la piste Effets : règle sa durée et ses fondus dans Propriétés." });
      return;
    }
    if (onItem && !type) {
      dispatch({ type: 'DELETE', id: clip.id });
      return;
    }
    dispatch({ type: 'CHECKPOINT' });
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { effect: type ? { type, intensity: fx?.intensity ?? DEFAULT_INTENSITY } : null } });
  };

  const shown = cat === 'Tous' ? EFFECTS : EFFECTS.filter((e) => e.cat === cat);

  return (
    <div className="lp-split">
      <SideMenu
        items={['Tous', ...CATEGORIES].map((c) => ({ id: c, label: c, count: c === 'Tous' ? EFFECTS.length : EFFECTS.filter((e) => e.cat === c).length }))}
        value={cat}
        onChange={setCat}
      />
    <div className="fx-panel">
      <div className="fx-target">
        {onClip && (
          <>
            <span className="muted">Clip :</span> {media?.name || 'clip'}
            {fx && (
              <button className="btn ghost small" onClick={() => apply(null)}>
                Retirer l'effet
              </button>
            )}
          </>
        )}
        {onItem && (
          <>
            <span className="muted">Piste Effets :</span> clique un effet pour le remplacer
            <button className="btn ghost small" onClick={() => apply(null)}>
              Supprimer
            </button>
          </>
        )}
        {!usable && <span className="muted">Clique un effet pour le poser sur la piste Effets, ou glisse-le sur un clip.</span>}
      </div>
      <div className="fx-grid">
        {shown.map((e) => (
          <EffectTile key={e.id} effect={e} active={fx?.type === e.id} onApply={apply} />
        ))}
      </div>
    </div>
    </div>
  );
}
