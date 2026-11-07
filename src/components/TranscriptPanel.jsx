import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { clipSpeed, end, laneOf } from '../project.js';
import { Scissors } from './icons.jsx';
import { T } from '../i18n.js';

// Margin kept around a cut word, without eating into its neighbours.
const CUT_PAD = 0.04;

// The words of the main track in timeline order. They are stored in source seconds on the media, so a
// word disappears from this list as soon as its clip no longer shows it.
export function timelineWords(clips, media) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const main = clips.filter((c) => c.track === 'video' && laneOf(c) === 0).sort((a, b) => a.start - b.start);
  return main.flatMap((c) => {
    const speed = clipSpeed(c);
    const last = c.in + c.duration * speed;
    return (byId.get(c.mediaId)?.words || [])
      .filter((w) => w.t >= c.in - 1e-3 && w.t < last)
      .map((w) => ({ w: w.w, start: c.start + (w.t - c.in) / speed, end: Math.min(end(c), c.start + (w.e - c.in) / speed), clipId: c.id }));
  });
}

// The part of the timeline to remove for the words first..last.
export function cutRangeOf(words, first, last) {
  const before = words[first - 1];
  const after = words[last + 1];
  const from = words[first].start - Math.min(CUT_PAD, before ? Math.max(0, words[first].start - before.end) / 2 : CUT_PAD);
  const to = words[last].end + Math.min(CUT_PAD, after ? Math.max(0, after.start - words[last].end) / 2 : CUT_PAD);
  return [Math.max(0, from), to];
}

const Word = memo(function Word({ index, w, active, picked }) {
  return (
    <span data-word={index} className={`tr-word ${picked ? 'picked' : ''} ${active ? 'active' : ''}`}>
      {w}{' '}
    </span>
  );
});

// "Montage par le texte": select words, press Suppr, and that passage leaves the video.
export default function TranscriptPanel({ clips, media, time, dispatch, onSeek, onTranscribe }) {
  const words = useMemo(() => timelineWords(clips, media), [clips, media]);
  const [range, setRange] = useState(null);
  const anchor = useRef(null);
  useEffect(() => setRange(null), [words]);

  let active = -1;
  for (let i = 0; i < words.length && words[i].start <= time + 1e-3; i++) active = i;
  const low = range ? Math.min(...range) : -1;
  const high = range ? Math.max(...range) : -1;

  const wordAt = (e) => {
    const index = e.target.dataset?.word;
    return index == null ? null : Number(index);
  };
  const cut = () => {
    if (!range) return;
    dispatch({ type: 'CUT_RANGES', ranges: [cutRangeOf(words, low, high)] });
    setRange(null);
  };

  if (!words.length) {
    return (
      <div className="captions-card">
        <strong>{T('Montage par le texte')}</strong>
        <p className="muted">
         {T('Cupkata écrit ce qui est dit dans tes clips de la piste principale. Supprime ensuite une phrase du texte : le passage est coupé dans la vidéo.')}
        </p>
        <button className="btn primary" onClick={onTranscribe}>
         {T('Transcrire la vidéo')}
        </button>
      </div>
    );
  }

  return (
    <div className="transcript">
      <div className="fx-target">
        <span className="muted">{T('Sélectionne des mots, puis Suppr pour les couper. Ctrl+Z annule.')}</span>
        <button className="btn" onClick={cut} disabled={!range}>
          <Scissors /> {T('Couper')}
        </button>
      </div>
      <div
        className="tr-text"
        tabIndex={0}
        onPointerDown={(e) => {
          const i = wordAt(e);
          if (i == null) {
            setRange(null);
            return;
          }
          e.currentTarget.focus();
          if (e.shiftKey && anchor.current != null) setRange([anchor.current, i]);
          else {
            anchor.current = i;
            setRange([i, i]);
            onSeek(words[i].start);
          }
        }}
        onPointerOver={(e) => {
          if (!e.buttons || anchor.current == null) return;
          const i = wordAt(e);
          if (i != null) setRange([anchor.current, i]);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Delete' && e.key !== 'Backspace') return;
          // Here these keys are about the words, not the selected clips.
          e.preventDefault();
          e.stopPropagation();
          cut();
        }}
      >
        {words.map((w, i) => (
          <Word key={`${w.clipId}:${i}`} index={i} w={w.w} active={i === active} picked={i >= low && i <= high} />
        ))}
      </div>
      <div className="tr-foot">
        <button className="btn ghost" onClick={onTranscribe}>
         {T('Transcrire à nouveau')}
        </button>
      </div>
    </div>
  );
}
