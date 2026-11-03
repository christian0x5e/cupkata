import { useEffect, useRef, useState } from 'react';
import { adjustmentFilter, DEFAULT_FILTER_AMOUNT, FILTER_CATEGORIES, filterInfo, PRESETS } from '../filters.js';
import { gpuEngine } from '../gpu/engine.js';
import { sampleScene } from './EffectsPanel.jsx';
import SideMenu from './SideMenu.jsx';

export const FILTER_MIME = 'application/x-cupkata-filter';
const TW = 160;
const TH = 90;

function FilterTile({ id, name, custom, active, onApply }) {
  const ref = useRef(null);
  useEffect(() => {
    const info = filterInfo(id, custom);
    const ctx = ref.current.getContext('2d');
    if (!info) return;
    ctx.drawImage(gpuEngine(TW, TH, 'lut-tiles').renderLut(sampleScene(), info.id, info.data, info.size, 1), 0, 0);
  }, [id, custom]);
  return (
    <button
      className={`fx-tile ${active ? 'active' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(FILTER_MIME, id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onApply(id)}
      title={`${name} — clique pour l'appliquer au clip sélectionné, ou glisse-le sur un clip`}
    >
      <canvas ref={ref} width={TW} height={TH} />
      <span>{name}</span>
    </button>
  );
}

const ADJUSTMENTS = [
  { key: 'exposure', label: 'Exposition', min: -1, max: 1 },
  { key: 'contrast', label: 'Contraste', min: -0.5, max: 0.5 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1 },
  { key: 'temperature', label: 'Température', min: -1, max: 1 },
];
const NO_ADJUSTMENT = { exposure: 0, contrast: 0, saturation: 0, temperature: 0 };

// A correction for everything below it, on the Filters track, for the whole montage.
function AdjustmentLayer({ custom, total, dispatch, onNotice }) {
  const [values, setValues] = useState(NO_ADJUSTMENT);
  const unchanged = ADJUSTMENTS.every(({ key }) => values[key] === 0);
  const add = () => {
    const filter = adjustmentFilter(values, `Réglage ${custom.length + 1}`);
    dispatch({ type: 'ADD_FILTER', filter });
    dispatch({ type: 'ADD_FILTER_ITEM', filterId: filter.id, start: 0, amount: 1, duration: total > 0 ? total : undefined, fade: 0 });
    setValues(NO_ADJUSTMENT);
    onNotice({ kind: 'ok', text: 'Calque de réglage ajouté sur la piste Filtres : tu peux le déplacer et le raccourcir.' });
  };
  return (
    <details className="adjust-layer">
      <summary>Calque de réglage</summary>
      {ADJUSTMENTS.map(({ key, label, min, max }) => (
        <label className="field" key={key}>
          {label}
          <input type="range" min={min} max={max} step={0.05} value={values[key]} onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })} />
        </label>
      ))}
      <button className="btn small primary" disabled={unchanged} onClick={add}>
        Ajouter le calque
      </button>
    </details>
  );
}

export default function FiltersPanel({ clip, media, custom, time, total = 0, dispatch, onNotice }) {
  const [cat, setCat] = useState('Tous');
  const onClip = clip?.track === 'video';
  const onItem = clip?.track === 'filter';
  const current = onClip || onItem ? clip.filter : null;

  // Clip selected: filter on that clip. Filter-track item selected: change it. Nothing: new item at the playhead.
  const apply = (id) => {
    if (!onClip && !onItem) {
      if (!id) return;
      dispatch({ type: 'ADD_FILTER_ITEM', filterId: id, start: time });
      onNotice({ kind: 'ok', text: 'Filtre posé sur la piste Filtres : règle sa durée et ses fondus dans Propriétés.' });
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
      setCat('Importés');
      onNotice({ kind: 'ok', text: `${ok.length} filtre${ok.length > 1 ? 's' : ''} importé${ok.length > 1 ? 's' : ''}` });
    }
  }

  const cats = ['Tous', ...FILTER_CATEGORIES, ...(custom.length ? ['Importés'] : [])];
  const presets = cat === 'Tous' ? PRESETS : PRESETS.filter((p) => p.cat === cat);
  const imported = cat === 'Tous' || cat === 'Importés' ? custom : [];

  return (
    <div className="lp-split">
      <SideMenu
        items={[
          ...cats.map((c) => ({
            id: c,
            label: c,
            count: c === 'Tous' ? PRESETS.length + custom.length : c === 'Importés' ? custom.length : PRESETS.filter((p) => p.cat === c).length,
          })),
          { id: 'import', label: '+ Importer .cube', onClick: importCube, title: 'Ajouter tes propres filtres au format .cube (LUT 3D)' },
        ]}
        value={cat}
        onChange={setCat}
      />
    <div className="fx-panel">
      <AdjustmentLayer custom={custom} total={total} dispatch={dispatch} onNotice={onNotice} />
      <div className="fx-target">
        {onClip && (
          <>
            <span className="muted">Clip :</span> {media?.name || 'clip'}
            {current && (
              <button className="btn ghost small" onClick={() => apply(null)}>
                Retirer le filtre
              </button>
            )}
          </>
        )}
        {onItem && (
          <>
            <span className="muted">Piste Filtres :</span> clique un filtre pour le remplacer
            <button className="btn ghost small" onClick={() => apply(null)}>
              Supprimer
            </button>
          </>
        )}
        {!onClip && !onItem && <span className="muted">Clique un filtre pour le poser sur la piste Filtres, ou glisse-le sur un clip.</span>}
      </div>
      <div className="fx-grid">
        {presets.map((p) => (
          <FilterTile key={p.id} id={p.id} name={p.name} custom={custom} active={current?.id === p.id} onApply={apply} />
        ))}
        {imported.map((f) => (
          <FilterTile key={f.id} id={f.id} name={f.name} custom={custom} active={current?.id === f.id} onApply={apply} />
        ))}
      </div>
    </div>
    </div>
  );
}
