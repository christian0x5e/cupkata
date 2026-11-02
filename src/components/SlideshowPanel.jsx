import { useMemo, useState } from 'react';
import { end, laneOf, naturalOrder, TRANSITIONS } from '../project.js';
import { formatShort } from '../format.js';

const api = window.cupkata;

// Médias › Diaporama: the chosen photos repeat in a loop until the music ends (or for some rounds).
export default function SlideshowPanel({ media, clips, dispatch, onNotice }) {
  const photos = media.filter((m) => m.type === 'image' && !m.missing).sort((a, b) => naturalOrder(a.name, b.name));
  const sounds = media.filter((m) => m.type === 'audio' && !m.missing);
  const [off, setOff] = useState(() => new Set());
  const [duration, setDuration] = useState(3);
  const [mode, setMode] = useState('music');
  const [rounds, setRounds] = useState(1);
  const [musicId, setMusicId] = useState('');
  const [shuffle, setShuffle] = useState(false);
  const [transition, setTransition] = useState('');
  const [zoom, setZoom] = useState(false);

  const chosen = photos.filter((m) => !off.has(m.id));
  const start = useMemo(() => clips.filter((c) => c.track === 'video' && laneOf(c) === 0).reduce((t, c) => Math.max(t, end(c)), 0), [clips]);
  const audioEnd = useMemo(() => clips.filter((c) => c.track === 'audio').reduce((t, c) => Math.max(t, end(c)), 0), [clips]);
  const music = sounds.find((m) => m.id === musicId);
  // The audio track's end, or the chosen sound placed under the slideshow if it ends later.
  const until = mode === 'music' ? Math.max(audioEnd, music ? start + music.duration : 0) : null;
  const length = mode === 'music' ? until - start : chosen.length * duration * rounds;
  const count = length > 0 ? Math.ceil(length / duration - 1e-6) : 0;

  let problem = null;
  if (!photos.length) problem = 'Importe d’abord des photos dans « Tes médias ».';
  else if (!chosen.length) problem = 'Choisis au moins une photo.';
  else if (mode === 'music' && !audioEnd && !music) problem = 'Pose une musique sur la piste Audio, ou choisis-en une ci-dessous.';
  else if (mode === 'music' && !(length > 0)) problem = 'La musique se termine avant la fin de la piste Vidéo : il ne reste rien à remplir.';

  function create() {
    dispatch({
      type: 'ADD_SLIDESHOW',
      mediaIds: chosen.map((m) => m.id),
      photoDuration: duration,
      loop: mode === 'music',
      musicId: mode === 'music' ? musicId : '',
      rounds,
      shuffle,
      transition: transition && duration > 0.6 ? { type: transition, duration: Math.min(1, duration / 3) } : null,
      effect: zoom ? { type: 'zoomslow', intensity: 0.6 } : null,
    });
    onNotice({ kind: 'ok', text: `Diaporama créé : ${count} images. Elles restent sélectionnées : change leur durée d’un coup dans Propriétés.` });
  }

  return (
    <div className="bin">
      <div className="bin-body slideshow">
        <div className="bin-filters">
          <strong>Photos ({chosen.length} / {photos.length})</strong>
          <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setOff(new Set())}>Toutes</button>
          <button className="btn small" onClick={() => setOff(new Set(photos.map((m) => m.id)))}>Aucune</button>
        </div>
        <div className="slide-grid">
          {photos.map((m) => {
            const rank = chosen.indexOf(m);
            return (
              <button
                key={m.id}
                className={`slide-photo ${rank >= 0 ? 'on' : ''}`}
                title={m.name}
                onClick={() =>
                  setOff((s) => {
                    const n = new Set(s);
                    if (n.has(m.id)) n.delete(m.id);
                    else n.add(m.id);
                    return n;
                  })
                }
              >
                <img src={api.mediaUrl(m.thumb || m.path)} alt="" draggable={false} />
                {rank >= 0 && <span>{rank + 1}</span>}
              </button>
            );
          })}
        </div>

        <label className="field">
          <span className="field-row">
            <span>Durée de chaque photo</span>
            <span className="field-value">{String(duration).replace('.', ',')} s</span>
          </span>
          <input type="range" min={0.5} max={10} step={0.5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </label>

        <label className="field">
          <span>Répéter</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="music">En boucle jusqu’à la fin de la musique</option>
            <option value="rounds">Un nombre de tours</option>
          </select>
        </label>
        {mode === 'music' ? (
          <label className="field">
            <span>Musique</span>
            <select value={musicId} onChange={(e) => setMusicId(e.target.value)}>
              <option value="">{audioEnd ? `Celle de la piste Audio (finit à ${formatShort(audioEnd)})` : 'Aucune sur la piste Audio'}</option>
              {sounds.map((m) => (
                <option key={m.id} value={m.id}>
                  Ajouter : {m.name} ({formatShort(m.duration)})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>Nombre de tours</span>
            <input type="number" min={1} max={100} value={rounds} onChange={(e) => setRounds(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
          </label>
        )}

        <label className="field">
          <span>Transition entre les photos</span>
          <select value={transition} onChange={(e) => setTransition(e.target.value)}>
            <option value="">Aucune</option>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
          Ordre mélangé à chaque tour
        </label>
        <label className="toggle">
          <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
          Zoom lent sur chaque photo
        </label>

        <div className={`slide-summary ${problem ? 'bad' : ''}`}>
          {problem || `${count} images · ${formatShort(length)}${start > 0 ? `, après la vidéo déjà en place (à ${formatShort(start)})` : ''}`}
        </div>
        <button className="btn primary" disabled={!!problem} onClick={create}>
          ▶ Créer le diaporama
        </button>
      </div>
    </div>
  );
}
