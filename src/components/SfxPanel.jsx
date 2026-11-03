import { useEffect, useRef, useState } from 'react';
import { MEDIA_MIME } from '../project.js';
import { IconAudio } from './icons.jsx';

const api = window.cupkata;

// Sound-effect library: a click listens, the + or a drag puts the sound on the timeline.
export default function SfxPanel({ media, time, dispatch, onNotice }) {
  const [sounds, setSounds] = useState(null);
  const [error, setError] = useState(null);
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
    player.current = new Audio(api.mediaUrl(sound.item.path));
    player.current.play().catch(() => {});
  };

  if (error) return <pre className="error-text">{error}</pre>;
  if (!sounds) return <p className="muted sfx-wait">Préparation des bruitages…</p>;
  const groups = [...new Set(sounds.map((s) => s.group))];
  return (
    <div className="fx-panel">
      <div className="fx-target">
        <span className="muted">Clique pour écouter, glisse sur la timeline ou utilise + pour poser à la tête de lecture.</span>
      </div>
      {groups.map((group) => (
        <div key={group}>
          <h4 className="sfx-group">{group}</h4>
          <div className="sfx-list">
            {sounds.filter((s) => s.group === group).map((sound) => (
              <div
                key={sound.id}
                className="sfx-item"
                draggable
                onClick={() => listen(sound)}
                onDragStart={(e) => {
                  e.dataTransfer.setData(MEDIA_MIME, mediaIdOf(sound));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                title={`${sound.name} (${sound.item.duration.toFixed(1).replace('.', ',')} s)`}
              >
                <IconAudio />
                <span>{sound.name}</span>
                <button
                  className="btn ghost"
                  title="Poser à la tête de lecture"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'ADD_CLIP', mediaId: mediaIdOf(sound), track: 'audio', start: time });
                    onNotice({ kind: 'ok', text: `« ${sound.name} » ajouté sur la piste Audio.` });
                  }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
