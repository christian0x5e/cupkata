import { useState } from 'react';
import { end } from '../project.js';
import { formatShort } from '../format.js';
import { T } from '../i18n.js';

// Repeats the selected clips one after the other, to make a loop (e.g. a slideshow as long as the music).
export default function RepeatTools({ clips, ids, dispatch }) {
  const [plain, setPlain] = useState(true);
  const [times, setTimes] = useState(1);
  const chosen = clips.filter((c) => ids.includes(c.id));
  const stop = chosen.reduce((t, c) => Math.max(t, end(c)), 0);
  const musicEnd = clips.filter((c) => c.track === 'audio' && !ids.includes(c.id)).reduce((t, c) => Math.max(t, end(c)), 0);
  return (
    <>
      <h3>{T('Répéter en boucle')}</h3>
      <button className="btn primary" disabled={musicEnd <= stop + 0.05} onClick={() => dispatch({ type: 'REPEAT_SELECTION', ids, until: musicEnd, plain })}>
        {T('⟲ Jusqu’à la fin de la musique')}{musicEnd > 0 ? ` (${formatShort(musicEnd)})` : ''}
      </button>
      <div className="group-input">
        <input
          type="number"
          min={1}
          max={200}
          value={times}
          aria-label={T('Nombre de copies')}
          onChange={(e) => setTimes(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
        />
        <button className="btn" onClick={() => dispatch({ type: 'REPEAT_SELECTION', ids, times, plain })}>
          {T('Ajouter')} {times} {T('répétition')}{times > 1 ? 's' : ''}
        </button>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={plain} onChange={(e) => setPlain(e.target.checked)} />
        {T('Sans effets (retire effets, filtres, couleurs et transitions)')}
      </label>
      <p className="hint">
        {musicEnd > stop + 0.05
          ? T('La boucle s’arrête pile à la fin de la musique. Ctrl+Z annule.')
          : musicEnd > 0
            ? T('Ces clips vont déjà jusqu’à la fin de la musique.')
            : T('Pose une musique sur la piste Audio pour répéter jusqu’à sa fin.')}
      </p>
    </>
  );
}
