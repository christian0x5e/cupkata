import { useEffect, useState } from 'react';
import { T } from '../i18n.js';

const LANGUAGES = [
  ['french', T('Français')],
  ['english', T('Anglais')],
  ['spanish', T('Espagnol')],
  ['german', T('Allemand')],
  ['italian', T('Italien')],
  ['portuguese', T('Portugais')],
  ['arabic', T('Arabe')],
  ['auto', T('Détection automatique')],
];
const MODELS = [
  ['onnx-community/whisper-base', T('Rapide (≈ 80 Mo)')],
  ['onnx-community/whisper-small', T('Précis (≈ 250 Mo, plus lent)')],
];
const SOURCES = [
  ['video', T('Le son des clips vidéo')],
  ['audio', T('La piste Audio (voix off)')],
  ['selected', T('Le clip sélectionné seulement')],
];

export default function SubtitlesModal({ open, wordsOnly = false, canUseSelected, onClose, onRun }) {
  const [language, setLanguage] = useState('french');
  const [model, setModel] = useState(MODELS[0][0]);
  const [source, setSource] = useState('video');
  const [maxWords, setMaxWords] = useState(7);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (open) setStatus(null);
  }, [open]);

  useEffect(() => window.cupkata.onTranscriptionProgress((p) => setStatus((s) => (s?.running ? { ...s, ...p } : s))), []);

  if (!open) return null;

  async function run() {
    setStatus({ running: true, phase: 'model', progress: 0 });
    try {
      await onRun({ language, model, source: wordsOnly ? 'main' : source, maxWords, wordsOnly });
      onClose();
    } catch (err) {
      const message = String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      setStatus(message === T('Transcription annulée') ? null : { error: message });
    }
  }

  const running = status?.running;
  const label =
    status?.phase === 'model'
      ? T('Préparation du modèle… {0} %', Math.round((status.progress || 0) * 100))
      : status?.phase === 'transcribe'
        ? T('Transcription du clip {0} sur {1}…', Math.min(status.index + 1, status.count), status.count)
        : '';
  const progress = status?.phase === 'model' ? status.progress || 0 : status?.count ? status.index / status.count : 0;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{wordsOnly ? T('Transcrire la vidéo') : T('Sous-titres automatiques')}</h2>
        {!running && (
          <div className="form">
            <label className="field">
              <span>{T('Langue parlée')}</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{T('Précision')}</span>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {!wordsOnly && <label className="field">
              <span>{T('Transcrire')}</span>
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.filter(([v]) => v !== 'selected' || canUseSelected).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>}
            {!wordsOnly && <label className="field">
              <span className="field-row">
                <span>{T('Mots par sous-titre')}</span>
                <span className="field-value">{maxWords}</span>
              </span>
              <input type="range" min="2" max="14" step="1" value={maxWords} onChange={(e) => setMaxWords(Number(e.target.value))} />
            </label>}
            <p className="hint">
             {T('Tout se passe sur ton ordinateur. La première fois, le modèle de reconnaissance (Whisper) est téléchargé une seule fois depuis Hugging Face.')}{!wordsOnly && T('Les anciens sous-titres automatiques sont remplacés, tes textes ajoutés à la main sont gardés.')}
            </p>
            {status?.error && <pre className="error-text">{status.error}</pre>}
          </div>
        )}
        {running && (
          <>
            <div className="progress">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="muted">{label}</p>
          </>
        )}
        <div className="modal-actions">
          {running ? (
            <button className="btn" onClick={() => window.cupkata.cancelTranscription()}>
             {T('Annuler')}
            </button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>
               {T('Fermer')}
              </button>
              <button className="btn primary" onClick={run}>
                {wordsOnly ? T('Transcrire') : T('Générer')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
