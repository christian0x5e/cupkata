import { useEffect, useRef, useState } from 'react';
import { formatShort } from '../format.js';
import { Download, ExternalLink, Pause, Play, Sparkles } from './icons.jsx';
import { T } from '../i18n.js';

const api = window.cupkata;
const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Genres of the "Musique" menu and the word each one adds to the search.
export const GENRES = [
  ['all', T('Tout'), ''],
  ['chill', 'Chill', 'chill'],
  ['lofi', 'Lo-fi', 'lofi'],
  ['electro', T('Électro'), 'electronic'],
  ['hiphop', 'Hip-hop', 'hiphop'],
  ['rock', 'Rock', 'rock'],
  ['piano', 'Piano', 'piano'],
  ['acoustic', T('Acoustique'), 'acoustic'],
  ['ambient', T('Ambiance'), 'ambient'],
  ['jazz', 'Jazz', 'jazz'],
  ['cinematic', T('Cinématique'), 'cinematic'],
];

// One sound previewed at a time, from the Music tab.
let player = null;
function usePlayer() {
  const [playing, setPlaying] = useState(null);
  useEffect(() => () => player?.pause(), []);
  const toggle = (id, src, onError) => {
    if (playing === id) {
      player?.pause();
      setPlaying(null);
      return;
    }
    player?.pause();
    player = new Audio(src);
    player.volume = 0.85;
    player.onended = () => setPlaying(null);
    player.onerror = () => {
      setPlaying(null);
      onError?.();
    };
    player.play().catch(() => {});
    setPlaying(id);
  };
  return [playing, toggle];
}

const licenceClass = (r) => (r.commercial ? 'ok' : 'nc');

// Free music from Creative Commons libraries: listen, download (with its licence), add.
export default function MusicBrowser({ genre, time, dispatch, onNotice }) {
  const [query, setQuery] = useState('');
  const [commercial, setCommercial] = useState(true);
  const [state, setState] = useState({ results: [], loading: false, error: null, failed: [], page: 0, more: false });
  const [got, setGot] = useState({}); // id -> { mediaId, credit, needsCredit } or 'loading'
  const [playing, toggle] = usePlayer();
  const asked = useRef(0);

  async function search(page = 0) {
    const n = ++asked.current;
    const word = GENRES.find((g) => g[0] === genre)?.[2] || '';
    setState((s) => ({ ...s, loading: true, error: null, ...(page === 0 ? { results: [] } : {}) }));
    try {
      const r = await api.searchMusic({ query: [query, word].filter(Boolean).join(' '), commercial, page });
      if (n !== asked.current) return;
      setState((s) => ({
        results: page === 0 ? r.results : [...s.results, ...r.results.filter((x) => !s.results.some((y) => y.id === x.id))],
        loading: false,
        error: null,
        failed: r.failed,
        page,
        more: r.results.length > 0,
      }));
    } catch (err) {
      if (n === asked.current) setState((s) => ({ ...s, loading: false, error: clean(err) }));
    }
  }

  useEffect(() => {
    search(0);
    // A new genre or the licence filter starts a new search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre, commercial]);

  async function download(r) {
    setGot((g) => ({ ...g, [r.id]: 'loading' }));
    try {
      const { item, credit, needsCredit } = await api.downloadMusic(r.id);
      const mediaId = crypto.randomUUID();
      dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id: mediaId }] });
      setGot((g) => ({ ...g, [r.id]: { mediaId, credit, needsCredit } }));
      onNotice({
        kind: 'ok',
        text: needsCredit
          ? T('« {0} » téléchargé. Sa licence demande de citer l’auteur : clique « Crédit » pour copier la mention.', r.title)
          : T('« {0} » téléchargé dans Documents\\Cupkata\\Musiques.', r.title),
      });
    } catch (err) {
      setGot((g) => {
        const n = { ...g };
        delete n[r.id];
        return n;
      });
      onNotice({ kind: 'error', text: clean(err) });
    }
  }

  const add = (r) => {
    dispatch({ type: 'ADD_CLIP', mediaId: got[r.id].mediaId, track: 'audio', start: time });
    onNotice({ kind: 'ok', text: T('« {0} » ajouté sur la piste Audio à la tête de lecture.', r.title) });
  };

  const copyCredit = async (r) => {
    try {
      await navigator.clipboard.writeText(got[r.id].credit);
      onNotice({ kind: 'ok', text: T('Crédit copié : colle-le dans la description de ta vidéo.') });
    } catch {
      onNotice({ kind: 'error', text: got[r.id].credit });
    }
  };

  return (
    <div className="bin music">
      <form
        className="bin-tools"
        onSubmit={(e) => {
          e.preventDefault();
          search(0);
        }}
      >
        <input className="bin-search" type="search" placeholder={T('Rechercher une musique ou un artiste…')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="toggle music-filter" title={T("Masque les licences « NC » (pas d'usage commercial)")}>
          <input type="checkbox" checked={commercial} onChange={(e) => setCommercial(e.target.checked)} />
          {T('Usage commercial autorisé')}
        </label>
      </form>
      <div className="bin-body">
        {state.error && <div className="bin-errors">{state.error}</div>}
        {state.failed.length > 0 && !state.error && (
          <p className="hint">{T('Indisponible pour l’instant :')} {state.failed.map((f) => f.source).join(', ')}.</p>
        )}
        <div className="bin-grid list">
          {state.results.map((r) => {
            const g = got[r.id];
            return (
              <div key={r.id} className="bin-item music-row">
                <button
                  className={`music-play ${playing === r.id ? 'on' : ''}`}
                  onClick={() => toggle(r.id, r.audio, () => onNotice({ kind: 'error', text: T('Écoute indisponible pour ce morceau : ouvre sa page.') }))}
                  title={playing === r.id ? T('Pause') : T('Écouter')}
                >
                  {playing === r.id ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                </button>
                <div className="bin-name">
                  <span className="music-title" title={r.album ? T('{0} — album « {1} »', r.title, r.album) : r.title}>{r.title}</span>
                  <span className="bin-meta">
                    {r.artist}
                    {r.duration > 0 && ` · ${formatShort(r.duration)}`}
                  </span>
                  <span className="music-tags">
                    <span className={`music-licence ${licenceClass(r)}`} title={r.commercial ? T('Usage commercial autorisé') : T('Pas d’usage commercial (NC)')}>
                      {r.licence}
                    </span>
                    <span className="muted">{r.source}</span>
                  </span>
                </div>
                <div className="music-actions">
                  {!r.downloadable && (
                    <button className="btn small" onClick={() => api.openMusicPage(r.id)} title={T('Ouvrir sa page dans le navigateur pour le télécharger')}>
                      <ExternalLink /> {T('Page')}
                    </button>
                  )}
                  {r.downloadable && !g && (
                    <button className="btn small" onClick={() => download(r)} title={T('Télécharger dans Documents\\Cupkata\\Musiques')}>
                      <Download />
                    </button>
                  )}
                  {g === 'loading' && <span className="muted">…</span>}
                  {g && g !== 'loading' && (
                    <>
                      <button className="btn small primary" onClick={() => add(r)} title={T('Ajouter sur la piste Audio à la tête de lecture')}>
                        +
                      </button>
                      {g.needsCredit && (
                        <button className="btn small" onClick={() => copyCredit(r)} title={T("Copier la mention de l'auteur demandée par la licence")}>
                          {T('Crédit')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {state.loading && <p className="muted music-loading">{T('Recherche dans les bibliothèques de musique libre…')}</p>}
        {state.results.length > 0 && (
          <p className="hint">
            {T('La licence affichée est celle déclarée par la personne qui a publié le morceau. Méfie-toi des reprises de morceaux célèbres : leur licence n’est pas toujours valable.')}
          </p>
        )}
        {!state.loading && !state.error && state.results.length === 0 && <p className="muted music-loading">{T('Aucun morceau trouvé : essaie un autre mot.')}</p>}
        {!state.loading && state.more && (
          <button className="btn ghost music-more" onClick={() => search(state.page + 1)}>
            {T('Plus de résultats')}
          </button>
        )}
      </div>
    </div>
  );
}

// Styles offered for AI music: the French label shown, the English description the model understands.
const AI_STYLES = [
  [T('Lo-fi calme'), 'calm lofi hip hop beat, mellow piano, vinyl crackle'],
  [T('Épique'), 'epic orchestral cinematic music, big drums, strings, brass'],
  [T('Électro dansante'), 'upbeat electronic dance music, synth bass, four on the floor'],
  [T('Acoustique'), 'warm acoustic guitar, folk, gentle percussion'],
  [T('Piano doux'), 'soft emotional piano solo, slow'],
  ['Rock', 'energetic rock, electric guitars, live drums'],
  [T('Ambiance'), 'ambient atmospheric pads, relaxing, slow evolving'],
  ['Hip-hop', 'hip hop beat, punchy drums, groovy bass'],
  [T('Joyeux'), 'happy upbeat ukulele and claps, cheerful'],
  ['Suspense', 'tense suspense music, dark synth, ticking percussion'],
];

// AI music: MusicGen makes a new piece on this computer from a description.
export function AiMusicPanel({ time, dispatch, onNotice }) {
  const [prompt, setPrompt] = useState(AI_STYLES[0][1]);
  const [duration, setDuration] = useState(10);
  const [status, setStatus] = useState(null);
  const [made, setMade] = useState([]);
  const [playing, toggle] = usePlayer();

  useEffect(() => api.onMusicProgress((p) => setStatus((s) => (s?.running ? { ...s, ...p } : s))), []);

  async function generate() {
    setStatus({ running: true, phase: 'model', progress: 0 });
    try {
      const item = await api.generateMusic({ prompt, duration });
      const id = crypto.randomUUID();
      dispatch({ type: 'ADD_MEDIA', items: [{ ...item, id }] });
      setMade((m) => [{ ...item, id }, ...m]);
      setStatus(null);
      onNotice({ kind: 'ok', text: T('Musique créée : elle est dans « Tes sons ».') });
    } catch (err) {
      const message = clean(err);
      setStatus(message === T('Génération annulée') ? null : { error: message });
    }
  }

  const running = status?.running;
  const label =
    status?.phase === 'model'
      ? T('Préparation du modèle (une seule fois, ≈ 650 Mo)… {0} %', Math.round((status.progress || 0) * 100))
      : T('Composition… {0} %', Math.round((status?.progress || 0) * 100));

  return (
    <div className="bin music">
      <div className="bin-body ai-music">
        <label className="field">
          <span>{T('Décris ta musique (en anglais, c’est plus précis)')}</span>
          <textarea rows={3} value={prompt} maxLength={300} disabled={running} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <div className="ai-styles">
          {AI_STYLES.map(([label, text]) => (
            <button key={label} className={`pill ${prompt === text ? 'active' : ''}`} disabled={running} onClick={() => setPrompt(text)}>
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-row">
            <span>{T('Durée')}</span>
            <span className="field-value">{duration} s</span>
          </span>
          <input type="range" min={5} max={30} step={1} value={duration} disabled={running} onChange={(e) => setDuration(Number(e.target.value))} />
        </label>
        {!running ? (
          <button className="btn primary" onClick={generate} disabled={!prompt.trim()}>
            <Sparkles /> {T('Créer la musique')}
          </button>
        ) : (
          <>
            <div className="progress">
              <div style={{ width: `${Math.round((status.progress || 0) * 100)}%` }} />
            </div>
            <p className="muted">{label}</p>
            <button className="btn" onClick={() => api.cancelMusic()}>
              {T('Annuler')}
            </button>
          </>
        )}
        {status?.error && <pre className="error-text">{status.error}</pre>}
        <p className="hint">
          {T('Créée sur ton ordinateur par le modèle MusicGen (Meta), sans envoyer ta description sur Internet. Compte environ une minute pour 10 s de musique selon ton PC. Ce modèle est sous licence CC BY-NC 4.0 : garde ses musiques pour un usage non commercial.')}
        </p>
        {made.length > 0 && (
          <div className="bin-grid list">
            {made.map((m) => (
              <div key={m.id} className="bin-item music-row">
                <button className={`music-play ${playing === m.id ? 'on' : ''}`} onClick={() => toggle(m.id, api.mediaUrl(m.path))}>
                  {playing === m.id ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                </button>
                <div className="bin-name">
                  <span className="music-title">{m.name}</span>
                  <span className="bin-meta">{formatShort(m.duration)}</span>
                </div>
                <div className="music-actions">
                  <button
                    className="btn small primary"
                    onClick={() => dispatch({ type: 'ADD_CLIP', mediaId: m.id, track: 'audio', start: time })}
                    title={T('Ajouter sur la piste Audio à la tête de lecture')}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
