import { useState } from 'react';
import { KARAOKE_MODES, TEXT_PRESETS, textStyle } from '../text.js';
import TranscriptPanel from './TranscriptPanel.jsx';
import SideMenu from './SideMenu.jsx';
import { SampleTile } from './TextInspector.jsx';

// "Sous-titres" tab: generate them from the voice, then give them all the same look in one click.
const LANGS = [
  ['fr', 'Français'],
  ['en', 'Anglais'],
  ['es', 'Espagnol'],
  ['de', 'Allemand'],
  ['it', 'Italien'],
  ['ar', 'Arabe'],
];

export default function CaptionsPanel({ clips, media, time, captions, onCaptions, onSeek, dispatch, onOpenSubtitles, onTranscribe, onNotice, onTranslate }) {
  const [view, setView] = useState('auto');
  const [from, setFrom] = useState('fr');
  const [to, setTo] = useState('en');
  const [onlyAuto, setOnlyAuto] = useState(true);
  const auto = clips.filter((c) => c.track === 'text' && c.auto);

  // Word by word: applies to the subtitles there are and to the ones generated next.
  const karaoke = auto.find((c) => c.karaoke)?.karaoke ?? captions?.karaoke ?? null;
  const setKaraoke = (next) => {
    onCaptions({ ...captions, karaoke: next });
    if (auto.length) dispatch({ type: 'REPLACE_CLIPS', clips: clips.map((c) => (c.track === 'text' && c.auto ? { ...c, karaoke: next ?? undefined } : c)) });
  };

  const restyle = (preset) => {
    onCaptions({ ...captions, style: preset.style });
    dispatch({
      type: 'REPLACE_CLIPS',
      clips: clips.map((c) => {
        if (!(c.track === 'text' && c.auto)) return c;
        const { x, y, size, rotation, opacity } = textStyle(c);
        return { ...c, style: { ...preset.style, x, y, size, rotation, opacity } };
      }),
    });
    onNotice({ kind: 'ok', text: `Style « ${preset.name} » appliqué à ${auto.length} sous-titre${auto.length > 1 ? 's' : ''}.` });
  };

  async function removeAll() {
    if (!(await window.cupkata.confirm(`Supprimer les ${auto.length} sous-titres automatiques ?`))) return;
    dispatch({ type: 'REPLACE_CLIPS', clips: clips.filter((c) => !(c.track === 'text' && c.auto)) });
  }

  return (
    <div className="lp-split">
      <SideMenu
        items={[
          { id: 'auto', label: 'Automatiques', count: auto.length },
          { id: 'transcript', label: 'Par le texte', title: 'Montage par le texte : supprime des mots pour couper la vidéo' },
          { id: 'styles', label: 'Styles', count: TEXT_PRESETS.length },
          { id: 'translate', label: 'Traduire' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className="fx-panel">
        {view === 'auto' && (
          <div className="captions-card">
            <strong>Sous-titres automatiques</strong>
            <p className="muted">
              Cupkata écoute la voix de tes clips et écrit les sous-titres sur la piste Texte, au bon moment. Tout se fait sur ton ordinateur.
            </p>
            <button className="btn primary" onClick={onOpenSubtitles}>
              Générer les sous-titres
            </button>
            <label className="field">
              <span>Mot par mot</span>
              <select
                value={karaoke?.mode ?? 'none'}
                onChange={(e) => setKaraoke(e.target.value === 'none' ? null : { mode: e.target.value, color: karaoke?.color ?? '#ffe000' })}
              >
                <option value="none">Désactivé</option>
                {KARAOKE_MODES.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            {karaoke && (
              <label className="field-row">
                <span>Couleur du mot prononcé</span>
                <input type="color" value={karaoke.color} onChange={(e) => setKaraoke({ ...karaoke, color: e.target.value })} />
              </label>
            )}
            {karaoke && auto.some((c) => !c.words?.length) && (
              <p className="hint">Certains sous-titres n’ont pas le temps de chaque mot : génère-les à nouveau pour les animer.</p>
            )}
            {auto.length > 0 && (
              <>
                <p className="muted">
                  {auto.length} sous-titre{auto.length > 1 ? 's' : ''} dans le montage. Change leur style d'un coup dans « Styles ».
                </p>
                <button className="btn ghost" onClick={removeAll}>
                  Supprimer les sous-titres automatiques
                </button>
              </>
            )}
          </div>
        )}
        {view === 'transcript' && (
          <TranscriptPanel clips={clips} media={media} time={time} dispatch={dispatch} onSeek={onSeek} onTranscribe={onTranscribe} />
        )}
        {view === 'translate' && (
          <div className="captions-card">
            <strong>Traduire les textes</strong>
            <p className="muted">Avec les modèles OPUS-MT (Helsinki-NLP), sur ton ordinateur. Chaque langue se télécharge une seule fois (≈ 80 Mo).</p>
            <div className="translate-row">
              <select value={from} onChange={(e) => setFrom(e.target.value)} title="Langue d'origine">
                {LANGS.map(([id, l]) => (
                  <option key={id} value={id}>{l}</option>
                ))}
              </select>
              <span>→</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} title="Traduire en">
                {LANGS.map(([id, l]) => (
                  <option key={id} value={id}>{l}</option>
                ))}
              </select>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={onlyAuto} onChange={(e) => setOnlyAuto(e.target.checked)} />
              Seulement les sous-titres automatiques
            </label>
            <button className="btn primary" disabled={from === to} onClick={() => onTranslate(from, to, onlyAuto)}>
              Traduire
            </button>
            <p className="muted">Ctrl+Z remet le texte d’origine.</p>
          </div>
        )}
        {view === 'styles' && (
          <>
            <div className="fx-target">
              <span className="muted">
                {auto.length ? 'Clique un style pour l’appliquer à tous les sous-titres automatiques.' : 'Génère d’abord des sous-titres pour leur donner un style.'}
              </span>
            </div>
            <div className="fx-grid text-grid">
              {TEXT_PRESETS.map((p) => (
                <SampleTile key={p.id} style={p.style} label={p.name} onApply={() => auto.length && restyle(p)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
