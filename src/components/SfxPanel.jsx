import { useEffect, useRef, useState } from 'react';
import { MEDIA_MIME } from '../project.js';
import { Pause, Play } from './icons.jsx';
import { DECIMAL, T } from '../i18n.js';

const api = window.cupkata;

// Sound-effect library: a click listens, the + or a drag puts the sound on the timeline.
export default function SfxPanel({ group, media, time, dispatch, onNotice }) {
  const [sounds, setSounds] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState(null);
  const player = useRef(null);

  useEffect(() => {
    api.listSfx().then(setSounds, (err) => setError(String(err?.message || err)));
    return () => player.current?.pause();
  }, []);

  // A sound joins the project's media the first time it is used.
  const mediaIdOf = (sound) => {
    const known = media.find((m) => m.path === sound.item.path);
    if (known) return known.id;
    const id = crypto.randomUUID();
    dispatch({ type: 'ADD_MEDIA', items: [{ ...sound.item, id }] });
    return id;
  };
  const listen = (sound) => {
    player.current?.pause();
    if (playing === sound.id) {
      setPlaying(null);
      return;
    }
    player.current = new Audio(api.mediaUrl(sound.item.path));
    player.current.onended = () => setPlaying(null);
    player.current.play().catch(() => setPlaying(null));
    setPlaying(sound.id);
  };

  if (error) return <pre className="error-text">{error}</pre>;
  if (!sounds) return <p className="muted sfx-wait">{T('Préparation des effets sonores…')}</p>;
  const words = query.trim().toLowerCase();
  const shown = sounds.filter((s) => (group === 'all' || s.group === group) && (!words || T(s.name).toLowerCase().includes(words)));
  const groups = [...new Set(shown.map((s) => s.group))];
  return (
    <div className="fx-panel">
      <div className="bin-tools">
        <input
          className="bin-search"
          type="search"
          placeholder={T('Rechercher un son…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
      </div>
      <div className="fx-target">
        <span className="muted">{T('Clique pour écouter, glisse sur la timeline ou utilise + pour poser à la tête de lecture.')}</span>
      </div>
      <div className="sfx-scroll">
        {groups.map((name) => (
          <div key={name}>
            <h4 className="sfx-group">{T(name)}</h4>
            <div className="sfx-list">
              {shown.filter((s) => s.group === name).map((sound) => (
                <div
                  key={sound.id}
                  className={`sfx-item ${playing === sound.id ? 'playing' : ''}`}
                  draggable
                  onClick={() => listen(sound)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(MEDIA_MIME, mediaIdOf(sound));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={`${T(sound.name)} (${sound.item.duration.toFixed(1).replace('.', DECIMAL)} s)`}
                >
                  {playing === sound.id ? <Pause /> : <Play />}
                  <span>{T(sound.name)}</span>
                  <small className="muted">{sound.item.duration.toFixed(1).replace('.', DECIMAL)} s</small>
                  <button
                    className="btn ghost"
                    title={T('Poser à la tête de lecture')}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'ADD_CLIP', mediaId: mediaIdOf(sound), track: 'audio', start: time });
                      onNotice({ kind: 'ok', text: T('« {0} » ajouté sur la piste Audio.', T(sound.name)) });
                    }}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!shown.length && <p className="muted sfx-wait">{T('Aucun son ne correspond.')}</p>}
        <p className="muted sfx-credit">{T('Sons créés avec Stable Audio 3.')} Powered by Stability AI</p>
      </div>
    </div>
  );
}
