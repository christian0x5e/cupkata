import { useEffect, useMemo, useRef, useState } from 'react';
import { MEDIA_LIST_MIME, MEDIA_MIME, naturalOrder } from '../project.js';
import { formatShort } from '../format.js';
import SideMenu from './SideMenu.jsx';
import SfxPanel from './SfxPanel.jsx';
import MusicBrowser, { AiMusicPanel, GENRES } from './MusicBrowser.jsx';
import SOUNDS from '../../shared/sounds.json';
import SlideshowPanel from './SlideshowPanel.jsx';
import { ArrowUpDown, Check, Music, Upload, X } from './icons.jsx';
import { T } from '../i18n.js';

const api = window.cupkata;
const SOUND_MENU = [
  { id: 'sfx:all', label: T('Tous'), count: SOUNDS.length },
  ...[...new Set(SOUNDS.map((s) => s.group))].map((group) => ({ id: `sfx:${group}`, label: T(group), count: SOUNDS.filter((s) => s.group === group).length })),
];
const KINDS = [
  ['all', T('Tout')],
  ['video', T('Vidéos')],
  ['image', T('Photos')],
  ['audio', T('Audio')],
];
const SORTS = [
  ['oldest', T('Ordre d’import')],
  ['recent', T('Ajout récent')],
  ['name', T('Nom (A → Z)')],
  ['long', T('Plus longs')],
  ['short', T('Plus courts')],
];
// Accents and case don't matter when searching: "eté" finds "Été.mp4".
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Thumbnail that previews on hover: a video follows the mouse across it (left = start, right = end),
// a sound plays from the start until the mouse leaves.
function BinThumb({ m, proxy }) {
  const [hover, setHover] = useState(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const canPreview = !m.missing && (m.type === 'video' || m.type === 'audio');

  useEffect(() => {
    if (hover == null || m.type !== 'audio') return;
    const a = new Audio(api.mediaUrl(m.path));
    a.volume = 0.8;
    a.play().catch(() => {});
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
    // The sound starts once per hover, not on every mouse move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover != null, m]);

  const move = (e) => {
    if (!canPreview) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(f);
    const v = videoRef.current;
    if (v && v.readyState >= 1 && !v.seeking) v.currentTime = f * Math.max(0, m.duration - 0.05);
  };

  return (
    <div className="bin-thumb" onMouseMove={move} onMouseLeave={() => setHover(null)}>
      {m.missing ? (
        <span className="bin-missing">{T('Introuvable')}<br /><small>{T('Cliquer pour relier')}</small></span>
      ) : m.thumb ? (
        <img src={api.mediaUrl(m.thumb)} alt="" draggable={false} />
      ) : (
        <span className={`bin-audio ${hover != null ? 'playing' : ''}`}><Music /></span>
      )}
      {hover != null && m.type === 'video' && (
        <video ref={videoRef} className="bin-scrub" src={api.mediaUrl(proxy?.file || m.path)} muted preload="auto" draggable={false} />
      )}
      {hover != null && canPreview && <span className="bin-scrub-bar" style={{ left: `${hover * 100}%` }} />}
      {proxy?.status === 'pending' && <span className="bin-proxy" title={T("Création d'une copie légère pour un aperçu fluide. L'export utilise toujours l'original.")}>{T('Aperçu…')}</span>}
      {m.type !== 'image' && (
        <span className="bin-dur">{hover != null && m.type === 'video' ? formatShort(hover * m.duration) : formatShort(m.duration)}</span>
      )}
      <span className={`bin-kind ${m.type}`}>{{ video: T('Vidéo'), image: T('Photo'), audio: T('Audio') }[m.type]}</span>
    </div>
  );
}

// audio: the Audio tab (sounds only, shown as a list, with the voice-over).
export default function MediaBin({ proxies = {}, media, clips = [], time = 0, dispatch, onNotice, audio = false, onVoiceover, link = true }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState(audio ? 'audio' : 'all');
  const [sort, setSort] = useState('oldest');
  // The media selected together, in the order they'll land on the timeline.
  const [picked, setPicked] = useState([]);
  const anchor = useRef(null);

  // How many clips use each file (shown on its thumbnail).
  const uses = useMemo(() => {
    const n = new Map();
    for (const c of clips) if (c.mediaId) n.set(c.mediaId, (n.get(c.mediaId) || 0) + 1);
    return n;
  }, [clips]);

  const shown = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const list = media
      .map((m, order) => ({ m, order }))
      .filter(({ m }) => (kind === 'all' || m.type === kind) && words.every((w) => fold(m.name).includes(w)));
    const len = (m) => (m.type === 'image' ? 0 : m.duration || 0);
    const by = {
      recent: (a, b) => b.order - a.order,
      oldest: (a, b) => a.order - b.order,
      name: (a, b) => naturalOrder(a.m.name, b.m.name),
      long: (a, b) => len(b.m) - len(a.m),
      short: (a, b) => len(a.m) - len(b.m),
    }[sort];
    return list.sort(by).map(({ m }) => m);
  }, [media, query, kind, sort]);

  async function remove(m) {
    const n = uses.get(m.id) || 0;
    const ok = await api.confirm(
      n
        ? T("Retirer « {0} » du projet ? {1} clip{2} de la timeline l'utilise{3} et ser{4} supprimé{5}. Le fichier reste sur ton disque.", m.name, n, n > 1 ? 's' : '', n > 1 ? 'nt' : '', n > 1 ? 'ont' : 'a', n > 1 ? 's' : '')
        : T('Retirer « {0} » du projet ? Le fichier reste sur ton disque.', m.name),
    );
    if (ok) dispatch({ type: 'REMOVE_MEDIA', id: m.id });
  }

  function addAtPlayhead(m) {
    dispatch({ type: 'ADD_CLIP', mediaId: m.id, start: time });
    onNotice?.({ kind: 'ok', text: T('« {0} » ajouté à la tête de lecture', m.name) });
  }

  // Click: this one. Ctrl + click: adds it after the others (or takes it out). Shift + click: all from the last clicked.
  function pick(e, m) {
    if (e.shiftKey && anchor.current) {
      const a = shown.findIndex((x) => x.id === anchor.current);
      const b = shown.findIndex((x) => x.id === m.id);
      if (a >= 0 && b >= 0) {
        const range = shown.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
        setPicked(a <= b ? range : range.reverse());
        return;
      }
    }
    anchor.current = m.id;
    if (e.ctrlKey || e.metaKey) setPicked((p) => (p.includes(m.id) ? p.filter((id) => id !== m.id) : [...p, m.id]));
    else setPicked([m.id]);
  }
  const usable = picked.filter((id) => media.some((m) => m.id === id && !m.missing));

  function addPicked() {
    dispatch({ type: 'ADD_CLIPS', mediaIds: usable, link });
    onNotice?.({ kind: 'ok', text: T('{0} média{1} ajouté{2} à la suite, dans l’ordre choisi', usable.length, usable.length > 1 ? 's' : '', usable.length > 1 ? 's' : '') });
    setPicked([]);
  }

  function applyResults(results) {
    // Files of one import come in the order of their names (photo 2 before photo 10).
    const ok = results
      .filter((r) => !r.error)
      .sort((a, b) => naturalOrder(a.name || '', b.name || ''))
      .map((r) => ({ ...r, id: crypto.randomUUID() }));
    if (ok.length) dispatch({ type: 'ADD_MEDIA', items: ok });
    setErrors(results.filter((r) => r.error));
  }

  async function addResults(promise) {
    setBusy(true);
    try {
      applyResults(await promise);
    } finally {
      setBusy(false);
    }
  }

  // Dropped files are handled by the preload script, which hands back the probe results.
  useEffect(
    () =>
      api.onFilesDropped(
        () => setBusy(true),
        (results) => {
          applyResults(results);
          setBusy(false);
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function onDrop(e) {
    setDragOver(false);
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  }

  const count = (type) => media.filter((m) => type === 'all' || m.type === type).length;
  const importItem = { id: 'import', label: busy ? T('Chargement…') : T('Importer'), onClick: () => !busy && addResults(api.importMedia()) };
  const menu = audio
    ? [
        importItem,
        { id: 'audio', label: T('Tes sons'), count: count('audio') },
        { id: 'music', label: T('Musique'), children: GENRES.map(([id, label]) => ({ id: `music:${id}`, label })) },
        { id: 'ai', label: T('Musique IA'), title: T('Créer une musique à partir d’une description, sur ton ordinateur') },
        { id: 'sfx', label: T('Effets sonores'), children: SOUND_MENU },
        { id: 'voice', label: T('Voix off'), onClick: onVoiceover, title: T('Enregistrer ta voix au micro à partir de la tête de lecture') },
      ]
    : [
        importItem,
        { id: 'yours', label: T('Tes médias'), children: KINDS.map(([id, label]) => ({ id, label, count: count(id) })) },
        { id: 'slideshow', label: T('Diaporama'), title: T('Créer un diaporama qui se répète jusqu’à la fin de la musique') },
      ];
  const pool = count(kind);

  return (
    <div className={`lp-split ${audio ? 'audio' : ''}`}>
      <SideMenu items={menu} value={kind} onChange={setKind} />
    {kind === 'slideshow' ? (
      <SlideshowPanel media={media} clips={clips} dispatch={dispatch} onNotice={onNotice} />
    ) : kind.startsWith('music:') ? (
      <MusicBrowser genre={kind.slice(6)} time={time} dispatch={dispatch} onNotice={onNotice} />
    ) : kind.startsWith('sfx:') ? (
      <SfxPanel group={kind.slice(4)} media={media} time={time} dispatch={dispatch} onNotice={onNotice} />
    ) : kind === 'ai' ? (
      <AiMusicPanel time={time} dispatch={dispatch} onNotice={onNotice} />
    ) : (
    <div className="bin">
      <div className="bin-tools">
        <input
          className="bin-search"
          type="search"
          placeholder={audio ? T('Rechercher un son…') : T('Rechercher un média…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
        <div className="bin-filters">
          <span className="muted bin-count">{shown.length === pool ? T('{0} élément{1}', pool, pool > 1 ? 's' : '') : `${shown.length} sur ${pool}`}</span>
          <select className="bin-sort" value={sort} onChange={(e) => setSort(e.target.value)} title={T('Trier')}>
            {SORTS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className={`bin-body ${dragOver ? 'drag-over' : ''}`}
        data-file-drop
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {errors.length > 0 && (
          <div className="bin-errors" onClick={() => setErrors([])} title={T('Cliquer pour fermer')}>
            {errors.map((e) => (
              <div key={e.path}>
                {e.name} : {e.error}
              </div>
            ))}
          </div>
        )}

        {usable.length > 0 && (
          <div className="bin-picked">
            <span>{usable.length} {T('sélectionné')}{usable.length > 1 ? 's' : ''}</span>
            <button className="btn primary" onClick={addPicked} title={T('Ajoute-les à la fin de la timeline, dans l’ordre des numéros')}>
             {T('+ À la timeline')}
            </button>
            <button className="btn ghost" onClick={() => setPicked(shown.filter((m) => !m.missing).map((m) => m.id))} title={T('Sélectionner tout ce qui est affiché')}>
             {T('Tout')}
            </button>
            <button className="btn ghost" onClick={() => setPicked((p) => [...p].reverse())} title={T('Inverser l’ordre d’ajout')}>
              <ArrowUpDown />
            </button>
            <button className="btn ghost" onClick={() => setPicked([])} title={T('Tout désélectionner')} aria-label={T('Tout désélectionner')}>
              <X />
            </button>
          </div>
        )}
        {pool === 0 ? (
          <div className="bin-empty">
            <div className="bin-empty-icon"><Upload /></div>
            {audio
              ? T('Glisse ici tes musiques et sons (MP3, WAV…), clique sur Importer, ou enregistre ta voix avec Voix off.')
              : T('Glisse tes vidéos, photos ou musiques ici, ou clique sur Importer.')}
          </div>
        ) : shown.length === 0 ? (
          <div className="bin-empty">
           {T('Aucun média ne correspond.')}
            <button className="btn ghost" onClick={() => { setQuery(''); setKind(audio ? 'audio' : 'all'); }}>
             {T('Tout afficher')}
            </button>
          </div>
        ) : (
          <div className={`bin-grid ${audio ? 'list' : ''}`}>
            {shown.map((m) => (
              <div
                key={m.id}
                className={`bin-item ${m.missing ? 'missing' : ''} ${picked.includes(m.id) ? 'picked' : ''}`}
                draggable={!m.missing}
                title={m.missing ? T('{0} Fichier introuvable : clique pour le retrouver', m.name) : T('{0} Double-clic pour ajouter à la timeline · Ctrl + clic ou Maj + clic pour en sélectionner plusieurs', m.name)}
                onClick={async (e) => {
                  if (!m.missing) {
                    pick(e, m);
                    return;
                  }
                  try {
                    const item = await api.relinkMedia();
                    if (item) dispatch({ type: 'RELINK_MEDIA', item: { ...item, id: m.id } });
                  } catch (err) {
                    setErrors([{ path: m.path, name: m.name, error: String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }]);
                  }
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData(MEDIA_MIME, m.id);
                  // Dragging one of the selected media brings all of them, in the order of their numbers.
                  if (usable.length > 1 && usable.includes(m.id)) e.dataTransfer.setData(MEDIA_LIST_MIME, JSON.stringify(usable));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDoubleClick={() => !m.missing && dispatch({ type: 'ADD_CLIP', mediaId: m.id })}
              >
                <div className="bin-thumb-wrap">
                  <BinThumb m={m} proxy={proxies[m.path]} />
                  {picked.includes(m.id) && <span className="bin-order">{picked.indexOf(m.id) + 1}</span>}
                  {uses.get(m.id) > 0 && (
                    <span className="bin-used" title={T('Utilisé {0} fois dans la timeline', uses.get(m.id))}>
                      <Check /> {uses.get(m.id)}
                    </span>
                  )}
                  <div className="bin-actions">
                    {!m.missing && (
                      <button
                        className="bin-act add"
                        title={T('Ajouter à la tête de lecture')}
                        onClick={(e) => {
                          e.stopPropagation();
                          addAtPlayhead(m);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        +
                      </button>
                    )}
                    <button
                      className="bin-act remove"
                      title={T('Retirer du projet (le fichier reste sur ton disque)')}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(m);
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <X />
                    </button>
                  </div>
                </div>
                <div className="bin-name">
                  {m.name}
                  {audio && <span className="bin-meta">{formatShort(m.duration)}{uses.get(m.id) ? T('· utilisé {0}×', uses.get(m.id)) : ''}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    )}
    </div>
  );
}
