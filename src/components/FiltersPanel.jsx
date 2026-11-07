import { useEffect, useRef, useState } from 'react';
import { adjustmentFilter, DEFAULT_FILTER_AMOUNT, FILTER_CATEGORIES, filterInfo, PRESETS } from '../filters.js';
import { gpuEngine } from '../gpu/engine.js';
import { playComparison, previewFiles, TILE_H as TH, TILE_W as TW, usePreviewPictures, useSeen } from '../previewPictures.js';
import SideMenu from './SideMenu.jsx';
import { T } from '../i18n.js';

export const FILTER_MIME = 'application/x-cupkata-filter';

// The picture with the filter at the strength it gets when applied; hovering compares it with the original.
function FilterTile({ id, name, custom, picture, active, onApply }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  const seen = useSeen(ref);
  useEffect(() => {
    if (!seen || !picture) return undefined;
    const info = filterInfo(id, custom);
    const ctx = ref.current.getContext('2d');
    if (!info) return undefined;
    ctx.drawImage(gpuEngine(TW, TH, 'lut-tiles').renderLut(picture, info.id, info.data, info.size, DEFAULT_FILTER_AMOUNT), 0, 0);
    return hover ? playComparison(ctx, picture) : undefined;
  }, [id, custom, picture, hover, seen]);
  return (
    <button
      className={`fx-tile ${active ? 'active' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(FILTER_MIME, id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onApply(id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={T("{0} — clique pour l'appliquer au clip sélectionné, ou glisse-le sur un clip", name)}
    >
      <canvas ref={ref} width={TW} height={TH} />
      <span>{name}</span>
    </button>
  );
}

const ADJUSTMENTS = [
  { key: 'exposure', label: T('Exposition'), min: -1, max: 1 },
  { key: 'contrast', label: T('Contraste'), min: -0.5, max: 0.5 },
  { key: 'saturation', label: T('Saturation'), min: -1, max: 1 },
  { key: 'temperature', label: T('Température'), min: -1, max: 1 },
];
const NO_ADJUSTMENT = { exposure: 0, contrast: 0, saturation: 0, temperature: 0 };

// A correction for everything below it, on the Filters track, for the whole montage.
function AdjustmentLayer({ custom, total, dispatch, onNotice }) {
  const [values, setValues] = useState(NO_ADJUSTMENT);
  const unchanged = ADJUSTMENTS.every(({ key }) => values[key] === 0);
  const add = () => {
    const filter = adjustmentFilter(values, T('Réglage {0}', custom.length + 1));
    dispatch({ type: 'ADD_FILTER', filter });
    dispatch({ type: 'ADD_FILTER_ITEM', filterId: filter.id, start: 0, amount: 1, duration: total > 0 ? total : undefined, fade: 0 });
    setValues(NO_ADJUSTMENT);
    onNotice({ kind: 'ok', text: T('Calque de réglage ajouté sur la piste Filtres : tu peux le déplacer et le raccourcir.') });
  };
  return (
    <details className="adjust-layer">
      <summary>{T('Calque de réglage')}</summary>
      {ADJUSTMENTS.map(({ key, label, min, max }) => (
        <label className="field" key={key}>
          {label}
          <input type="range" min={min} max={max} step={0.05} value={values[key]} onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })} />
        </label>
      ))}
      <button className="btn small primary" disabled={unchanged} onClick={add}>
       {T('Ajouter le calque')}
      </button>
    </details>
  );
}

export default function FiltersPanel({ clip, media, clips, library, custom, time, total = 0, dispatch, onNotice }) {
  const [cat, setCat] = useState(T('Tous'));
  const onClip = clip?.track === 'video';
  const onItem = clip?.track === 'filter';
  const current = onClip || onItem ? clip.filter : null;
  const files = previewFiles(clips, library, [onClip ? clip.mediaId : undefined]);
  const picture = usePreviewPictures(files, 1)?.[0];

  // Clip selected: filter on that clip. Filter-track item selected: change it. Nothing: new item at the playhead.
  const apply = (id) => {
    if (!onClip && !onItem) {
      if (!id) return;
      dispatch({ type: 'ADD_FILTER_ITEM', filterId: id, start: time });
      onNotice({ kind: 'ok', text: T('Filtre posé sur la piste Filtres : règle sa durée et ses fondus dans Propriétés.') });
      return;
    }
    if (onItem && !id) {
      dispatch({ type: 'DELETE', id: clip.id });
      return;
    }
    dispatch({ type: 'CHECKPOINT' });
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { filter: id ? { id, amount: current?.amount ?? DEFAULT_FILTER_AMOUNT } : null } });
  };

  async function importCube() {
    const results = await window.cupkata.importFilter();
    const ok = results.filter((r) => !r.error);
    for (const f of ok) dispatch({ type: 'ADD_FILTER', filter: f });
    const bad = results.filter((r) => r.error);
    if (bad.length) onNotice({ kind: 'error', text: bad.map((b) => `${b.name} : ${b.error}`).join(' — ') });
    else if (ok.length) {
      setCat(T('Importés'));
      onNotice({ kind: 'ok', text: T('{0} filtre{1} importé{2}', ok.length, ok.length > 1 ? 's' : '', ok.length > 1 ? 's' : '') });
    }
  }

  const cats = [T('Tous'), ...FILTER_CATEGORIES, ...(custom.length ? [T('Importés')] : [])];
  const presets = cat === T('Tous') ? PRESETS : PRESETS.filter((p) => p.cat === cat);
  const imported = cat === T('Tous') || cat === T('Importés') ? custom : [];

  return (
    <div className="lp-split">
      <SideMenu
        items={[
          ...cats.map((c) => ({
            id: c,
            label: c,
            count: c === T('Tous') ? PRESETS.length + custom.length : c === T('Importés') ? custom.length : PRESETS.filter((p) => p.cat === c).length,
          })),
          { id: 'import', label: T('+ Importer .cube'), onClick: importCube, title: T('Ajouter tes propres filtres au format .cube (LUT 3D)') },
        ]}
        value={cat}
        onChange={setCat}
      />
    <div className="fx-panel">
      <AdjustmentLayer custom={custom} total={total} dispatch={dispatch} onNotice={onNotice} />
      <div className="fx-target">
        {onClip && (
          <>
            <span className="muted">{T('Clip :')}</span> {media?.name || T('clip')}
            {current && (
              <button className="btn ghost small" onClick={() => apply(null)}>
               {T('Retirer le filtre')}
              </button>
            )}
          </>
        )}
        {onItem && (
          <>
            <span className="muted">{T('Piste Filtres :')}</span> {T('clique un filtre pour le remplacer')}
            <button className="btn ghost small" onClick={() => apply(null)}>
             {T('Supprimer')}
            </button>
          </>
        )}
        {!onClip && !onItem && <span className="muted">{T('Clique un filtre pour le poser sur la piste Filtres, ou glisse-le sur un clip.')}</span>}
        <span className="muted fx-source">{files.length ? T('Aperçu avec tes médias. Survole une vignette pour comparer avant et après.') : T("Aperçu avec une photo d'exemple. Survole une vignette pour comparer avant et après.")}</span>
      </div>
      <div className="fx-grid">
        {presets.map((p) => (
          <FilterTile key={p.id} id={p.id} name={p.name} custom={custom} picture={picture} active={current?.id === p.id} onApply={apply} />
        ))}
        {imported.map((f) => (
          <FilterTile key={f.id} id={f.id} name={f.name} custom={custom} picture={picture} active={current?.id === f.id} onApply={apply} />
        ))}
      </div>
    </div>
    </div>
  );
}
