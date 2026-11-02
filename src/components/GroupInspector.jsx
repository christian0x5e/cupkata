import { useState } from 'react';
import { clipAudio, laneOf, MAX_VOLUME, TRANSITIONS } from '../project.js';
import RepeatTools from './RepeatTools.jsx';

const DURATIONS = [0.5, 1, 2, 3, 5];
const seconds = (v) => `${String(v).replace('.', ',')} s`;

// Propriétés when several clips are selected: what applies to all of them at once.
export default function GroupInspector({ clips, media, ids, dispatch, time = 0, link = true }) {
  const [typed, setTyped] = useState('');
  const [together, setTogether] = useState(true);
  const chosen = clips.filter((c) => ids.includes(c.id));
  const byId = new Map(media.map((m) => [m.id, m]));
  const withSound = chosen.filter((c) => byId.get(c.mediaId)?.hasAudio);
  const mainVideo = chosen.filter((c) => c.track === 'video' && laneOf(c) === 0);
  const total = chosen.reduce((n, c) => n + c.duration, 0);
  const same = chosen.every((c) => Math.abs(c.duration - chosen[0].duration) < 0.005) ? chosen[0].duration : null;

  const setDuration = (duration) => {
    if (duration > 0) dispatch({ type: 'SET_DURATIONS', ids, duration, ripple: together, link: true });
  };
  const volume = withSound.length ? clipAudio(withSound[0]).volume : 1;
  const transition = mainVideo.find((c) => c.transition)?.transition?.type || '';
  const align = (how) => dispatch({ type: 'ALIGN', ids, how, time, link });
  const canStack = chosen.some((c) => c.track !== 'video' || laneOf(c) > 0);
  const overlays = chosen.some((c) => c.track === 'video' && laneOf(c) > 0);

  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>Propriétés</span>
        <span className="bin-kind static">Groupe</span>
      </div>
      <div className="inspector-body">
        <div className="group-title">{ids.length} clips sélectionnés</div>
        <p className="hint">Durée totale : {total.toFixed(1).replace('.', ',')} s. Tire le bord d’un clip sélectionné dans la timeline pour tous les raccourcir ou les allonger ensemble.</p>

        <h3>Aligner</h3>
        <button className="btn primary" onClick={() => align('sequence')} title="Les clips se suivent sans trou, dans leur ordre sur la timeline ; ce qu'ils recouvriraient se décale">
          ⇥⇤ Bout à bout
        </button>
        {overlays && (
          <button className="btn" onClick={() => align('main')} title="Les incrustations sélectionnées rejoignent la piste Vidéo principale, à la suite">
            ⤓ Sur la piste principale
          </button>
        )}
        {canStack && (
          <div className="group-durations">
            <button className="btn" onClick={() => align('starts')} title="Tous commencent au même moment">⇤ Même début</button>
            <button className="btn" onClick={() => align('ends')} title="Tous finissent au même moment">Même fin ⇥</button>
            <button className="btn" onClick={() => align('playhead')} title="Tous commencent à la tête de lecture">À la tête de lecture</button>
          </div>
        )}
        <h3>Ordre</h3>
        <div className="group-durations">
          <button className="btn" onClick={() => align('name')} title="Trie par nom de fichier : photo 2 avant photo 10">A→Z Par nom</button>
          <button className="btn" onClick={() => align('reverse')}>⇄ Inverser</button>
          <button className="btn" onClick={() => align('shuffle')}>🔀 Mélanger</button>
        </div>

        <h3>Durée de chaque clip</h3>
        <div className="group-durations">
          {DURATIONS.map((d) => (
            <button key={d} className={`btn ${same !== null && Math.abs(same - d) < 0.005 ? 'active' : ''}`} onClick={() => setDuration(d)}>
              {seconds(d)}
            </button>
          ))}
        </div>
        <form
          className="group-input"
          onSubmit={(e) => {
            e.preventDefault();
            setDuration(Number(typed.replace(',', '.')));
            setTyped('');
          }}
        >
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={same !== null ? same.toFixed(2).replace('.', ',') : 'mixte'} aria-label="Durée en secondes" />
          <button className="btn" disabled={!(Number(typed.replace(',', '.')) > 0)}>
            Appliquer
          </button>
        </form>
        <label className="toggle">
          <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} />
          Garder les clips collés
        </label>
        <p className="hint">Une vidéo ou un son ne peut pas dépasser la longueur de son fichier.</p>

        {withSound.length > 0 && (
          <>
            <h3>Son</h3>
            <button className="btn" onClick={() => dispatch({ type: 'TOGGLE_MUTE', ids })} title="Couper ou rétablir le son des clips sélectionnés (M)">
              {withSound.every((c) => c.muted) ? '🔊 Rétablir le son' : '🔇 Couper le son'}
            </button>
            <label className="field">
              <span className="field-row">
                <span>Volume</span>
                <span className="field-value">{Math.round(volume * 100)} %</span>
              </span>
              <input
                type="range"
                min={0}
                max={MAX_VOLUME * 100}
                value={Math.round(volume * 100)}
                onPointerDown={() => dispatch({ type: 'CHECKPOINT' })}
                onChange={(e) => dispatch({ type: 'UPDATE_MANY', ids: withSound.map((c) => c.id), patch: { volume: Number(e.target.value) / 100 } })}
              />
            </label>
          </>
        )}

        {mainVideo.length > 1 && (
          <>
            <h3>Transition entre les clips</h3>
            <select
              value={transition}
              onChange={(e) => {
                dispatch({ type: 'CHECKPOINT' });
                dispatch({ type: 'UPDATE_MANY', ids: mainVideo.map((c) => c.id), patch: { transition: e.target.value ? { type: e.target.value, duration: 0.5 } : null } });
              }}
            >
              <option value="">Aucune</option>
              {TRANSITIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </>
        )}

        <RepeatTools clips={clips} ids={ids} dispatch={dispatch} />

        <h3>Sélection</h3>
        <button className="btn" onClick={() => dispatch({ type: 'DELETE_MANY', ids })}>
          🗑 Supprimer les {ids.length} clips
        </button>
        <p className="hint">Ctrl + clic ajoute ou retire un clip, Ctrl + A sélectionne tout, Échap désélectionne. Ctrl+C copie, Ctrl+V colle, Ctrl+D duplique, Ctrl+← / → change l’ordre, Alt+← / → décale.</p>
      </div>
    </aside>
  );
}
