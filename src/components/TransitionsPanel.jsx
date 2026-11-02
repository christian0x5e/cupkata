import { useEffect, useRef, useState } from 'react';
import { end, laneOf, TRANSITIONS } from '../project.js';
import { drawTransition } from '../transitions.js';
import { sampleScene } from './EffectsPanel.jsx';
import SideMenu from './SideMenu.jsx';

const TW = 160;
const TH = 90;

// The second picture of the samples: the same little scene, in night colours.
let night = null;
function nightScene() {
  if (night) return night;
  night = document.createElement('canvas');
  night.width = TW;
  night.height = TH;
  const c = night.getContext('2d');
  c.filter = 'hue-rotate(200deg) saturate(1.4) brightness(0.75)';
  c.drawImage(sampleScene(), 0, 0);
  return night;
}

// Shows the transition between the two sample pictures; it plays while the mouse is over the tile.
function TransitionTile({ t, active, onApply }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    const draw = (p) => {
      ctx.clearRect(0, 0, TW, TH);
      if (!t.id) ctx.drawImage(p < 0.5 ? sampleScene() : nightScene(), 0, 0);
      else drawTransition(ctx, TW, TH, t.id, p, (c) => c.drawImage(sampleScene(), 0, 0), (c) => c.drawImage(nightScene(), 0, 0));
    };
    if (!hover) {
      draw(0.5);
      return;
    }
    let raf;
    const t0 = performance.now();
    const loop = () => {
      draw(((performance.now() - t0) / 1600) % 1);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [hover, t.id]);
  return (
    <button
      className={`fx-tile ${active ? 'active' : ''}`}
      onClick={onApply}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={t.id ? `${t.label} — survole pour la voir` : 'Retirer la transition'}
    >
      <canvas ref={ref} width={TW} height={TH} />
      <span>{t.label}</span>
    </button>
  );
}

// "Transitions" tab: a click puts the transition on the selected clip of the main video track, or
// on the cut nearest to the playhead.
export default function TransitionsPanel({ clips, selectedId, time, dispatch, onNotice }) {
  const main = clips.filter((c) => c.track === 'video' && laneOf(c) === 0);
  const hasPrev = (c) => main.some((p) => p.id !== c.id && Math.abs(end(p) - c.start) < 1e-3);
  const selected = main.find((c) => c.id === selectedId);
  const target = selected && hasPrev(selected)
    ? selected
    : main.filter(hasPrev).sort((a, b) => Math.abs(a.start - time) - Math.abs(b.start - time))[0];

  const apply = (type) => {
    if (!target) {
      onNotice({ kind: 'error', text: 'Mets deux clips vidéo bout à bout sur la piste Vidéo pour placer une transition entre eux.' });
      return;
    }
    dispatch({ type: 'CHECKPOINT' });
    dispatch({ type: 'UPDATE_CLIP', id: target.id, patch: { transition: type ? { type, duration: target.transition?.duration ?? 1 } : null } });
    dispatch({ type: 'SELECT', id: target.id });
    if (type) onNotice({ kind: 'ok', text: `Transition à ${target.start.toFixed(1).replace('.', ',')} s — règle sa durée dans Propriétés.` });
  };

  return (
    <div className="lp-split">
      <SideMenu items={[{ id: 'all', label: 'Toutes', count: TRANSITIONS.length }]} value="all" onChange={() => {}} />
      <div className="fx-panel">
        <div className="fx-target">
          <span className="muted">
            {target
              ? `Cible : la coupure à ${target.start.toFixed(1).replace('.', ',')} s${selected === target ? ' (clip sélectionné)' : ' (la plus proche de la tête de lecture)'}`
              : 'Mets deux clips bout à bout sur la piste Vidéo pour placer une transition.'}
          </span>
        </div>
        <div className="fx-grid">
          {[{ id: null, label: 'Aucune' }, ...TRANSITIONS].map((t) => (
            <TransitionTile key={t.id || 'none'} t={t} active={(target?.transition?.type || null) === t.id} onApply={() => apply(t.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
