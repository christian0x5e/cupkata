import { useEffect, useRef, useState } from 'react';
import { formatShort } from '../format.js';

const api = window.cupkata;
const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Genres of the "Musique" menu and the word each one adds to the search.
export const GENRES = [
  ['all', 'Tout', ''],
  ['chill', 'Chill', 'chill'],
  ['lofi', 'Lo-fi', 'lofi'],
  ['electro', 'Électro', 'electronic'],
  ['hiphop', 'Hip-hop', 'hiphop'],
  ['rock', 'Rock', 'rock'],
  ['piano', 'Piano', 'piano'],
  ['acoustic', 'Acoustique', 'acoustic'],
  ['ambient', 'Ambiance', 'ambient'],
  ['jazz', 'Jazz', 'jazz'],
  ['cinematic', 'Cinématique', 'cinematic'],
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
          ? `« ${r.title} » téléchargé. Sa licence demande de citer l’auteur : clique « Crédit » pour copier la mention.`
          : `« ${r.title} » téléchargé dans Documents\\Cupkata\\Musiques.`,
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
    onNotice({ kind: 'ok', text: `« ${r.title} » ajouté sur la piste Audio à la tête de lecture.` });
  };

  const copyCredit = async (r) => {
    try {
      await navigator.clipboard.writeText(got[r.id].credit);
      onNotice({ kind: 'ok', text: 'Crédit copié : colle-le dans la description de ta vidéo.' });
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
        <input className="bin-search" type="search" placeholder="Rechercher une musique ou un artiste…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="toggle music-filter" title="Masque les licences « NC » (pas d'usage commercial)">
          <input type="checkbox" checked={commercial} onChange={(e) => setCommercial(e.target.checked)} />
          Usage commercial autorisé
        </label>
      </form>
      <div className="bin-body">
        {state.error && <div className="bin-errors">{state.error}</div>}
        {state.failed.length > 0 && !state.error && (
          <p className="hint">Indisponible pour l’instant : {state.failed.map((f) => f.source).join(', ')}.</p>
        )}
        <div className="bin-grid list">
          {state.results.map((r) => {
            const g = got[r.id];
            return (
              <div key={r.id} className="bin-item music-row">
                <button
                  className={`music-play ${playing === r.id ? 'on' : ''}`}
                  onClick={() => toggle(r.id, r.audio, () => onNotice({ kind: 'error', text: 'Écoute indisponible pour ce morceau : ouvre sa page.' }))}
                  title={playing === r.id ? 'Pause' : 'Écouter'}
                >
                  {playing === r.id ? '❚❚' : '▶'}
                </button>
                <div className="bin-name">
                  <span className="music-title" title={r.album ? `${r.title} — album « ${r.album} »` : r.title}>{r.title}</span>
                  <span className="bin-meta">
                    {r.artist}
                    {r.duration > 0 && ` · ${formatShort(r.duration)}`}
                  </span>
                  <span className="music-tags">
                    <span className={`music-licence ${licenceClass(r)}`} title={r.commercial ? 'Usage commercial autorisé' : 'Pas d’usage commercial (NC)'}>
                      {r.licence}
                    </span>
                    <span className="muted">{r.source}</span>
                  </span>
                </div>
                <div className="music-actions">
                  {!r.downloadable && (
                    <button className="btn small" onClick={() => api.openMusicPage(r.id)} title="Ouvrir sa page dans le navigateur pour le télécharger">
                      ↗ Page
                    </button>
                  )}
                  {r.downloadable && !g && (
                    <button className="btn small" onClick={() => download(r)} title="Télécharger dans Documents\Cupkata\Musiques">
                      ⬇
                    </button>
                  )}
                  {g === 'loading' && <span className="muted">…</span>}
                  {g && g !== 'loading' && (
                    <>
                      <button className="btn small primary" onClick={() => add(r)} title="Ajouter sur la piste Audio à la tête de lecture">
                        +
                      </button>
                      {g.needsCredit && (
                        <button className="btn small" onClick={() => copyCredit(r)} title="Copier la mention de l'auteur demandée par la licence">
                          Crédit
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {state.loading && <p className="muted music-loading">Recherche dans les bibliothèques de musique libre…</p>}
        {state.results.length > 0 && (
          <p className="hint">
            La licence affichée est celle déclarée par la personne qui a publié le morceau. Méfie-toi des reprises de morceaux célèbres : leur
            licence n’est pas toujours valable.
          </p>
        )}
        {!state.loading && !state.error && state.results.length === 0 && <p className="muted music-loading">Aucun morceau trouvé : essaie un autre mot.</p>}
        {!state.loading && state.more && (
          <button className="btn ghost music-more" onClick={() => search(state.page + 1)}>
            Plus de résultats
          </button>
        )}
      </div>
    </div>
  );
}

// Styles offered for AI music: the French label shown, the English description the model understands.
const AI_STYLES = [
  ['Lo-fi calme', 'calm lofi hip hop beat, mellow piano, vinyl crackle'],
  ['Épique', 'epic orchestral cinematic music, big drums, strings, brass'],
  ['Électro dansante', 'upbeat electronic dance music, synth bass, four on the floor'],
  ['Acoustique', 'warm acoustic guitar, folk, gentle percussion'],
  ['Piano doux', 'soft emotional piano solo, slow'],
  ['Rock', 'energetic rock, electric guitars, live drums'],
  ['Ambiance', 'ambient atmospheric pads, relaxing, slow evolving'],
  ['Hip-hop', 'hip hop beat, punchy drums, groovy bass'],
  ['Joyeux', 'happy upbeat ukulele and claps, cheerful'],
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
      onNotice({ kind: 'ok', text: 'Musique créée : elle est dans « Tes sons ».' });
    } catch (err) {
      const message = clean(err);
      setStatus(message === 'Génération annulée' ? null : { error: message });
    }
  }

  const running = status?.running;
  const label =
    status?.phase === 'model'
      ? `Préparation du modèle (une seule fois, ≈ 650 Mo)… ${Math.round((status.progress || 0) * 100)} %`
      : `Composition… ${Math.round((status?.progress || 0) * 100)} %`;

  return (
    <div className="bin music">
      <div className="bin-body ai-music">
        <label className="field">
          <span>Décris ta musique (en anglais, c’est plus précis)</span>
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
            <span>Durée</span>
            <span className="field-value">{duration} s</span>
          </span>
          <input type="range" min={5} max={30} step={1} value={duration} disabled={running} onChange={(e) => setDuration(Number(e.target.value))} />
        </label>
        {!running ? (
          <button className="btn primary" onClick={generate} disabled={!prompt.trim()}>
            ✦ Créer la musique
          </button>
        ) : (
          <>
            <div className="progress">
              <div style={{ width: `${Math.round((status.progress || 0) * 100)}%` }} />
            </div>
            <p className="muted">{label}</p>
            <button className="btn" onClick={() => api.cancelMusic()}>
              Annuler
            </button>
          </>
        )}
        {status?.error && <pre className="error-text">{status.error}</pre>}
        <p className="hint">
          Créée sur ton ordinateur par le modèle MusicGen (Meta), sans envoyer ta description sur Internet. Compte environ une minute pour 10 s de
          musique selon ton PC. Ce modèle est sous licence CC BY-NC 4.0 : garde ses musiques pour un usage non commercial.
        </p>
        {made.length > 0 && (
          <div className="bin-grid list">
            {made.map((m) => (
              <div key={m.id} className="bin-item music-row">
                <button className={`music-play ${playing === m.id ? 'on' : ''}`} onClick={() => toggle(m.id, api.mediaUrl(m.path))}>
                  {playing === m.id ? '❚❚' : '▶'}
                </button>
                <div className="bin-name">
                  <span className="music-title">{m.name}</span>
                  <span className="bin-meta">{formatShort(m.duration)}</span>
                </div>
                <div className="music-actions">
                  <button
                    className="btn small primary"
                    onClick={() => dispatch({ type: 'ADD_CLIP', mediaId: m.id, track: 'audio', start: time })}
                    title="Ajouter sur la piste Audio à la tête de lecture"
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

// Music bought on iTunes / Apple Music and downloaded on this PC (or any folder picked here).
export function LibraryPanel({ media, time, dispatch, onNotice }) {
  const [lib, setLib] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, toggle] = usePlayer();

  async function scan(pick = false) {
    setBusy(true);
    try {
      const r = await api.scanLibrary(pick);
      if (r) setLib(r);
    } catch (err) {
      onNotice({ kind: 'error', text: clean(err) });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A track already imported is reused instead of being added twice to the media list.
  async function mediaFor(t) {
    const have = media.find((m) => m.path === t.path);
    if (have) return have;
    const [r] = await api.importLibrary([t.path]);
    if (!r || r.error) throw new Error(r?.error || 'Import impossible');
    const item = { ...r, id: crypto.randomUUID() };
    dispatch({ type: 'ADD_MEDIA', items: [item] });
    return item;
  }

  async function add(t) {
    try {
      const m = await mediaFor(t);
      dispatch({ type: 'ADD_CLIP', mediaId: m.id, track: 'audio', start: time });
      onNotice({ kind: 'ok', text: `« ${t.title} » ajouté sur la piste Audio à la tête de lecture.` });
    } catch (err) {
      onNotice({ kind: 'error', text: clean(err) });
    }
  }

  async function listen(t) {
    try {
      const m = await mediaFor(t);
      toggle(t.path, api.mediaUrl(m.path));
    } catch (err) {
      onNotice({ kind: 'error', text: clean(err) });
    }
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tracks = (lib?.tracks || []).filter((t) => words.every((w) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(w)));
  const usable = (lib?.tracks || []).filter((t) => !t.protected).length;

  return (
    <div className="bin music">
      <div className="bin-tools">
        <input className="bin-search" type="search" placeholder="Rechercher un titre, un artiste, un album…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="bin-filters">
          <span className="muted bin-count">{lib ? `${usable} morceau${usable > 1 ? 'x' : ''} utilisable${usable > 1 ? 's' : ''}` : 'Lecture…'}</span>
          <button className="btn small" disabled={busy} onClick={() => scan(false)} title="Relire les dossiers">
            ↻
          </button>
          <button className="btn small" disabled={busy} onClick={() => scan(true)}>
            Autre dossier…
          </button>
        </div>
      </div>
      <div className="bin-body">
        {lib && lib.tracks.length === 0 && (
          <div className="captions-card">
            <strong>Aucun morceau téléchargé trouvé</strong>
            <p className="muted">
              Tes achats iTunes restent dans le nuage tant qu’ils ne sont pas téléchargés. Dans l’app <b>Apple Music</b> (ou iTunes) : Bibliothèque › choisis
              le morceau ou l’album › bouton <b>⬇ Télécharger</b>. Reviens ici et clique ↻.
            </p>
            <p className="muted">Dossiers lus : {lib.roots.map((r) => r.path).join(' · ')}</p>
          </div>
        )}
        <div className="bin-grid list">
          {tracks.map((t) => (
            <div key={t.path} className={`bin-item music-row ${t.protected ? 'protected' : ''}`}>
              <button
                className={`music-play ${playing === t.path ? 'on' : ''}`}
                disabled={t.protected}
                onClick={() => listen(t)}
                title={t.protected ? 'Protégé par DRM' : 'Écouter'}
              >
                {playing === t.path ? '❚❚' : '▶'}
              </button>
              <div className="bin-name">
                <span className="music-title">{t.title}</span>
                <span className="bin-meta">{[t.artist, t.album].filter(Boolean).join(' · ') || t.path}</span>
                {t.protected && (
                  <span className="music-tags">
                    <span className="music-licence nc">Protégé (DRM)</span>
                    <span className="muted">achat ancien ou abonnement : pas utilisable</span>
                  </span>
                )}
              </div>
              <div className="music-actions">
                {!t.protected && (
                  <button className="btn small primary" onClick={() => add(t)} title="Ajouter sur la piste Audio à la tête de lecture">
                    +
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {lib && lib.tracks.length > 0 && (
          <p className="hint">
            Un morceau acheté est fait pour ton écoute personnelle : dans une vidéo gardée pour toi ou ta famille, aucun souci. Publiée sur YouTube,
            TikTok ou Instagram, elle peut être bloquée ou démonétisée pour droits d’auteur.
          </p>
        )}
      </div>
    </div>
  );
}
