import { useEffect, useRef, useState } from 'react';
import { end, laneOf, TRANSITIONS } from '../project.js';
import { drawTransition } from '../transitions.js';
import { previewFiles, TILE_H as TH, TILE_W as TW, usePreviewPictures } from '../previewPictures.js';
import SideMenu from './SideMenu.jsx';
import { DECIMAL, T } from '../i18n.js';
import { getSetting } from '../settings.js';

// One pass while the mouse is over a tile: a pause on each picture, so the change is easy to follow.
const PASS = 2200;
const HOLD = 0.2;
const passProgress = (t) => Math.min(1, Math.max(0, ((t % PASS) / PASS - HOLD) / (1 - 2 * HOLD)));

// Shows the transition between two pictures; it plays while the mouse is over the tile.
function TransitionTile({ t, pictures, active, onApply }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!pictures) return;
    const [a, b] = pictures;
    const ctx = ref.current.getContext('2d');
    const draw = (p) => {
      ctx.clearRect(0, 0, TW, TH);
      if (!t.id) ctx.drawImage(p < 0.5 ? a : b, 0, 0);
      else drawTransition(ctx, TW, TH, t.id, p, (c) => c.drawImage(a, 0, 0), (c) => c.drawImage(b, 0, 0));
    };
    if (!hover) {
      draw(0.5);
      return;
    }
    let raf;
    const t0 = performance.now();
    const loop = () => {
      draw(passProgress(performance.now() - t0));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [hover, t.id, pictures]);
  return (
    <button
      className={`fx-tile ${active ? 'active' : ''}`}
      onClick={onApply}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={t.id ? T('{0} — survole pour la voir', t.label) : T('Retirer la transition')}
    >
      <canvas ref={ref} width={TW} height={TH} />
      <span>{t.label}</span>
    </button>
  );
}

// "Transitions" tab: a click puts the transition on the selected clip of the main video track, or
// on the cut nearest to the playhead.
export default function TransitionsPanel({ clips, media, selectedId, transitionId, time, dispatch, onNotice }) {
  const main = clips.filter((c) => c.track === 'video' && laneOf(c) === 0);
  const hasPrev = (c) => main.some((p) => p.id !== c.id && Math.abs(end(p) - c.start) < 1e-3);
  const selected = main.find((c) => c.id === (transitionId ?? selectedId));
  const target = selected && hasPrev(selected)
    ? selected
    : main.filter(hasPrev).sort((a, b) => Math.abs(a.start - time) - Math.abs(b.start - time))[0];
  const before = target && main.find((p) => p.id !== target.id && Math.abs(end(p) - target.start) < 1e-3);
  const files = previewFiles(clips, media, [before?.mediaId, target?.mediaId]);
  const pictures = usePreviewPictures(files, 2);

  const apply = (type) => {
    if (!target) {
      onNotice({ kind: 'error', text: T('Mets deux clips vidéo bout à bout sur la piste Vidéo pour placer une transition entre eux.') });
      return;
    }
    if (!type) {
      dispatch({ type: 'REMOVE_TRANSITION', ids: [target.id] });
      return;
    }
    dispatch({ type: 'CHECKPOINT' });
    dispatch({ type: 'UPDATE_CLIP', id: target.id, patch: { transition: { type, duration: target.transition?.duration ?? getSetting('transitionDuration') } } });
    dispatch({ type: 'SELECT_TRANSITION', id: target.id });
    onNotice({ kind: 'ok', text: T('Transition à {0} s — règle sa durée dans Propriétés.', target.start.toFixed(1).replace('.', DECIMAL)) });
  };

  return (
    <div className="lp-split">
      <SideMenu items={[{ id: 'all', label: T('Toutes'), count: TRANSITIONS.length }]} value="all" onChange={() => {}} />
      <div className="fx-panel">
        <div className="fx-target">
          <span className="muted">
            {target
              ? T('Cible : la coupure à {0} s {1}', target.start.toFixed(1).replace('.', DECIMAL), selected !== target ? T('(la plus proche de la tête de lecture)') : transitionId ? T('(transition sélectionnée)') : T('(clip sélectionné)'))
              : T('Mets deux clips bout à bout sur la piste Vidéo pour placer une transition.')}
          </span>
          {target?.transition?.type && (
            <button className="btn ghost small" onClick={() => apply(null)}>
              {T('Retirer la transition')}
            </button>
          )}
          <span className="muted fx-source">{files.length ? T('Aperçu avec tes médias. Survole une vignette pour la voir en mouvement.') : T("Aperçu avec des photos d'exemple. Survole une vignette pour la voir en mouvement.")}</span>
        </div>
        <div className="fx-grid">
          {[{ id: null, label: T('Aucune') }, ...TRANSITIONS].map((t) => (
            <TransitionTile key={t.id || 'none'} t={t} pictures={pictures} active={(target?.transition?.type || null) === t.id} onApply={() => apply(t.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
