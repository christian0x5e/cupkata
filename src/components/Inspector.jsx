import { useState } from 'react';
import { clipAudio, clipBackground, clipColor, clipSpeed, clipTransform, isOverlay, MAX_SPEED, MIN_SPEED, laneOf, maxDuration, MAX_VOLUME, OVERLAY_TRANSFORM, overlaps, TRANSITIONS } from '../project.js';
import { formatTime } from '../format.js';
import TextInspector from './TextInspector.jsx';
import RepeatTools from './RepeatTools.jsx';
import { clipEffect, DEFAULT_INTENSITY, EFFECTS } from '../effects.js';
import { DEFAULT_FILTER_AMOUNT, filterInfo } from '../filters.js';

function EffectInspector({ clip, dispatch, Slider, onOpenEffects }) {
  const fx = clipEffect(clip);
  const info = fx && EFFECTS.find((e) => e.id === fx.type);
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });

  return (
    <>
      <h3>Effet</h3>
      <div className="fx-current">
        <span>{info ? `${info.icon} ${info.label}` : 'Aucun effet'}</span>
        <span className="fx-current-actions">
          <button className="btn small" onClick={onOpenEffects}>
            {info ? 'Changer' : 'Choisir'}
          </button>
          {info && (
            <button
              className="btn ghost small"
              onClick={() => {
                checkpoint();
                update({ effect: null });
              }}
            >
              Retirer
            </button>
          )}
        </span>
      </div>
      {fx && (
        <Slider
          label="Intensité"
          value={Math.round(fx.intensity * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v} %`}
          onStart={checkpoint}
          onChange={(v) => update({ effect: { type: fx.type, intensity: v / 100 } })}
          onReset={() => {
            checkpoint();
            update({ effect: { type: fx.type, intensity: DEFAULT_INTENSITY } });
          }}
        />
      )}
    </>
  );
}

const KIND = { video: 'Vidéo', image: 'Photo', audio: 'Audio' };

function Slider({ label, value, min, max, step, format, onStart, onChange, onReset, disabled }) {
  return (
    <label className={`field ${disabled ? 'disabled' : ''}`}>
      <span className="field-row">
        <span>{label}</span>
        <span className="field-value" onDoubleClick={onReset} title="Double-clic pour réinitialiser">
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={onStart}
        onKeyDown={onStart}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function VisualInspector({ clip, hasPrev, dispatch }) {
  const color = clipColor(clip);
  const tr = clip.transition;
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  const setColor = (patch) => update({ color: { ...clip.color, ...patch } });
  const commit = (patch) => {
    checkpoint();
    update(patch);
  };
  const pct = (v) => `${v} %`;
  const maxTr = Math.max(0.1, Math.min(3, Math.floor(clip.duration * 10) / 10));

  return (
    <>
      <h3>Couleur</h3>
      <Slider
        label="Luminosité"
        value={Math.round(color.brightness * 100)}
        min={50}
        max={150}
        step={1}
        format={pct}
        onStart={checkpoint}
        onChange={(v) => setColor({ brightness: v / 100 })}
        onReset={() => commit({ color: { ...clip.color, brightness: 1 } })}
      />
      <Slider
        label="Contraste"
        value={Math.round(color.contrast * 100)}
        min={50}
        max={150}
        step={1}
        format={pct}
        onStart={checkpoint}
        onChange={(v) => setColor({ contrast: v / 100 })}
        onReset={() => commit({ color: { ...clip.color, contrast: 1 } })}
      />
      <Slider
        label="Saturation"
        value={Math.round(color.saturation * 100)}
        min={0}
        max={200}
        step={1}
        format={pct}
        onStart={checkpoint}
        onChange={(v) => setColor({ saturation: v / 100 })}
        onReset={() => commit({ color: { ...clip.color, saturation: 1 } })}
      />

      {!isOverlay(clip) && (
      <>
      <h3>Transition d'entrée</h3>
      <select
        value={tr?.type || ''}
        onChange={(e) => commit({ transition: e.target.value ? { type: e.target.value, duration: tr?.duration ?? 1 } : null })}
      >
        <option value="">Aucune</option>
        {TRANSITIONS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {tr?.type && (
        <Slider
          label="Durée"
          value={Math.min(tr.duration ?? 1, maxTr)}
          min={0.1}
          max={maxTr}
          step={0.1}
          format={(v) => `${v.toFixed(1).replace('.', ',')} s`}
          onStart={checkpoint}
          onChange={(v) => update({ transition: { ...tr, duration: v } })}
          onReset={() => commit({ transition: { ...tr, duration: 1 } })}
        />
      )}
      {tr?.type && !hasPrev && (
        <p className="hint">Colle ce clip juste après un autre clip vidéo pour voir la transition.</p>
      )}
      </>
      )}
    </>
  );
}

// Background where the picture doesn't fill the frame (e.g. a horizontal video in a 9:16 project).
const BG_MODES = [
  ['none', 'Noir'],
  ['blur', 'Flou'],
  ['fill', 'Remplir'],
  ['color', 'Couleur'],
];
function BackgroundInspector({ clip, clips, dispatch }) {
  const bg = clipBackground(clip);
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const set = (patch) => {
    const next = { ...bg, ...patch };
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { background: next.mode === 'none' ? null : next } });
  };
  const main = clips.filter((c) => c.track === 'video' && !isOverlay(c));
  return (
    <>
      <h3>Arrière-plan</h3>
      <div className="segmented">
        {BG_MODES.map(([id, label]) => (
          <button
            key={id}
            className={`btn ${bg.mode === id ? 'active' : ''}`}
            onClick={() => {
              checkpoint();
              set({ mode: id });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {bg.mode === 'blur' && (
        <Slider label="Flou" value={Math.round(bg.blur * 100)} min={0} max={100} step={1} format={(v) => `${v} %`}
          onStart={checkpoint} onChange={(v) => set({ blur: v / 100 })} onReset={() => { checkpoint(); set({ blur: 0.5 }); }} />
      )}
      {bg.mode === 'color' && (
        <div className="field-row color-row">
          <span>Couleur du fond</span>
          <input type="color" value={bg.color} onFocus={checkpoint} onChange={(e) => set({ color: e.target.value })} />
        </div>
      )}
      <p className="hint">
        {bg.mode === 'fill'
          ? 'L’image est agrandie pour remplir le cadre (les bords qui dépassent sont coupés).'
          : 'Remplit les bandes quand l’image n’a pas le format du projet (bouton Ratio, sous l’aperçu).'}
      </p>
      {main.length > 1 && (
        <button
          className="btn"
          onClick={() => {
            checkpoint();
            for (const c of main) dispatch({ type: 'UPDATE_CLIP', id: c.id, patch: { background: bg.mode === 'none' ? null : { ...bg } } });
          }}
        >
          Appliquer à tous les clips
        </button>
      )}
    </>
  );
}

// Open-source AI tools that run on this computer.
function AiTools({ clip, media, ai }) {
  const [minSilence, setMinSilence] = useState(0.5);
  const picture = clip.track === 'video' && (media.type === 'video' || media.type === 'image');
  const sound = media.hasAudio && media.type !== 'image';
  if (!picture && !sound) return null;
  return (
    <>
      <h3>Outils IA</h3>
      {picture && (
        <button className={`btn ai-btn ${clip.cutout ? 'active' : ''}`} disabled={ai.busy} onClick={() => ai.cutout(clip)}
          title="Supprime l'arrière-plan derrière les personnes (modèle MODNet, sur ton ordinateur)">
          {clip.cutout ? '↺ Remettre l’arrière-plan' : '✂ Supprimer l’arrière-plan'}
        </button>
      )}
      {sound && (
        <div className="ai-row">
          <button className="btn ai-btn" disabled={ai.busy} onClick={() => ai.silences(clip, minSilence)}
            title="Retire les passages sans parole (modèle Silero VAD, sur ton ordinateur)">
            🤫 Couper les silences
          </button>
          <select value={minSilence} onChange={(e) => setMinSilence(Number(e.target.value))} title="Silence le plus court qui sera coupé">
            <option value={0.3}>dès 0,3 s</option>
            <option value={0.5}>dès 0,5 s</option>
            <option value={1}>dès 1 s</option>
            <option value={2}>dès 2 s</option>
          </select>
        </div>
      )}
      <p className="hint">
        {picture && 'Le détourage marche le mieux avec des personnes ; compte environ 15 s de calcul par seconde de vidéo. '}
        {sound && 'Les silences sont repérés par l’IA dans la voix ; Ctrl+Z annule.'}
      </p>
    </>
  );
}

const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3];
const speedLabel = (v) => `${v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}×`;

// Speed (video and sound clips), plus the reverse and freeze-frame actions for videos.
function SpeedInspector({ clip, media, dispatch, busy, onReverse, onFreeze, canFreeze }) {
  const speed = clipSpeed(clip);
  return (
    <>
      <h3>Vitesse</h3>
      <Slider
        label="Vitesse"
        value={speed}
        min={MIN_SPEED}
        max={MAX_SPEED}
        step={0.05}
        format={speedLabel}
        onStart={() => dispatch({ type: 'CHECKPOINT' })}
        onChange={(v) => dispatch({ type: 'SET_SPEED', id: clip.id, speed: v, live: true })}
        onReset={() => dispatch({ type: 'SET_SPEED', id: clip.id, speed: 1 })}
      />
      <div className="speed-presets">
        {SPEED_PRESETS.map((v) => (
          <button key={v} className={`btn ${Math.abs(speed - v) < 1e-6 ? 'active' : ''}`} onClick={() => dispatch({ type: 'SET_SPEED', id: clip.id, speed: v })}>
            {speedLabel(v)}
          </button>
        ))}
      </div>
      <p className="hint">La durée du clip s'adapte ; la voix garde sa hauteur.</p>
      {media.type === 'video' && (
        <div className="speed-actions">
          <button className={`btn ${clip.reversed ? 'active' : ''}`} disabled={!!busy} onClick={() => onReverse(clip)} title="Lire ce clip à l'envers (image et son)">
            {busy === 'reverse' ? 'Inversion…' : clip.reversed ? '⇆ Remettre à l’endroit' : '⇆ Inverser'}
          </button>
          <button className="btn" disabled={!!busy || !canFreeze} onClick={() => onFreeze(clip)} title="Insérer une image fixe de 3 s à la tête de lecture">
            {busy === 'freeze' ? 'Figer…' : '❄ Figer l’image'}
          </button>
        </div>
      )}
    </>
  );
}

// Overlay clips (video lanes above the main track): where they sit in the picture.
function OverlayInspector({ clip, dispatch }) {
  const tf = clipTransform(clip);
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const set = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { transform: { ...tf, ...patch } } });
  const reset = (patch) => {
    checkpoint();
    set(patch);
  };
  const pct = (v) => `${v} %`;
  return (
    <>
      <h3>Incrustation</h3>
      <p className="hint">Dans l'aperçu : glisse l'image pour la déplacer, tire un coin pour la taille, le point du haut pour la tourner.</p>
      <Slider label="Taille" value={Math.round(tf.scale * 100)} min={5} max={400} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ scale: v / 100 })} onReset={() => reset({ scale: 1 })} />
      <Slider label="Position horizontale" value={Math.round(tf.x * 100)} min={-50} max={150} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ x: v / 100 })} onReset={() => reset({ x: 0.5 })} />
      <Slider label="Position verticale" value={Math.round(tf.y * 100)} min={-50} max={150} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ y: v / 100 })} onReset={() => reset({ y: 0.5 })} />
      <Slider label="Rotation" value={Math.round(tf.rotation)} min={-180} max={180} step={1} format={(v) => `${v}°`}
        onStart={checkpoint} onChange={(v) => set({ rotation: v })} onReset={() => reset({ rotation: 0 })} />
      <Slider label="Opacité" value={Math.round(tf.opacity * 100)} min={0} max={100} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ opacity: v / 100 })} onReset={() => reset({ opacity: 1 })} />
      <div className="timing">
        <button className="btn" onClick={() => reset({ x: 0.5, y: 0.5 })} title="Remettre au centre de l'image">Centrer</button>
        <button className="btn" onClick={() => reset({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })} title="Prendre toute l'image">Plein cadre</button>
        <button className="btn" onClick={() => reset({ ...OVERLAY_TRANSFORM })} title="Taille et position de départ">Réinit.</button>
      </div>
    </>
  );
}

function FxItemInspector({ clip, clips, dispatch, onOpenEffects }) {
  const fx = clipEffect(clip);
  const info = fx && EFFECTS.find((e) => e.id === fx.type);
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  const maxFade = Math.max(0.1, Math.floor((clip.duration / 2) * 10) / 10);
  const seconds = (v) => `${v.toFixed(1).replace('.', ',')} s`;
  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>Propriétés</span>
        <span className="bin-kind static fx">Piste Effets</span>
      </div>
      <div className="inspector-body">
        <TimingFields clip={clip} clips={clips} dispatch={dispatch} />
        <h3>Effet</h3>
        <div className="fx-current">
          <span>{info ? `${info.icon} ${info.label}` : 'Effet'}</span>
          <button className="btn small" onClick={onOpenEffects}>
            Changer
          </button>
        </div>
        <Slider
          label="Intensité"
          value={Math.round((fx?.intensity ?? 0.7) * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v} %`}
          onStart={checkpoint}
          onChange={(v) => update({ effect: { type: fx.type, intensity: v / 100 } })}
          onReset={() => {
            checkpoint();
            update({ effect: { type: fx.type, intensity: DEFAULT_INTENSITY } });
          }}
        />
        <h3>Transition de l'effet</h3>
        <Slider
          label="Apparition"
          value={Math.min(clip.fadeIn ?? 0, maxFade)}
          min={0}
          max={maxFade}
          step={0.1}
          format={seconds}
          onStart={checkpoint}
          onChange={(v) => update({ fadeIn: v })}
          onReset={() => {
            checkpoint();
            update({ fadeIn: 0.5 });
          }}
        />
        <Slider
          label="Disparition"
          value={Math.min(clip.fadeOut ?? 0, maxFade)}
          min={0}
          max={maxFade}
          step={0.1}
          format={seconds}
          onStart={checkpoint}
          onChange={(v) => update({ fadeOut: v })}
          onReset={() => {
            checkpoint();
            update({ fadeOut: 0.5 });
          }}
        />
        <p className="hint">
          L'effet s'applique à toute l'image pendant sa durée. Ses fondus le font apparaître et disparaître en douceur : place
          deux effets côte à côte pour passer de l'un à l'autre.
        </p>
      </div>
    </aside>
  );
}

function FilterInspector({ clip, custom, dispatch, onOpenFilters }) {
  const info = clip.filter?.id ? filterInfo(clip.filter.id, custom) : null;
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  return (
    <>
      <h3>Filtre</h3>
      <div className="fx-current">
        <span>{info ? `◐ ${info.name}` : 'Aucun filtre'}</span>
        <span className="fx-current-actions">
          <button className="btn small" onClick={onOpenFilters}>
            {info ? 'Changer' : 'Choisir'}
          </button>
          {info && (
            <button
              className="btn ghost small"
              onClick={() => {
                checkpoint();
                update({ filter: null });
              }}
            >
              Retirer
            </button>
          )}
        </span>
      </div>
      {info && (
        <Slider
          label="Intensité du filtre"
          value={Math.round((clip.filter.amount ?? DEFAULT_FILTER_AMOUNT) * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v} %`}
          onStart={checkpoint}
          onChange={(v) => update({ filter: { id: clip.filter.id, amount: v / 100 } })}
          onReset={() => {
            checkpoint();
            update({ filter: { id: clip.filter.id, amount: DEFAULT_FILTER_AMOUNT } });
          }}
        />
      )}
    </>
  );
}

// Accepts "1:23.5", "83.5", "0:30", "30", "1:02:03" (h:m:s); returns seconds or NaN.
function parseTime(text) {
  const parts = String(text).trim().replace(',', '.').split(':');
  if (!parts.length || parts.length > 3 || parts.some((p) => p === '' || isNaN(Number(p)))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

function editTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0').replace('.', ',')}`;
}

function TimeField({ label, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const [bad, setBad] = useState(false);
  const commitDraft = () => {
    if (draft === null) return;
    const t = parseTime(draft);
    setDraft(null);
    if (!Number.isFinite(t) || t < 0 || !onCommit(t)) {
      setBad(true);
      setTimeout(() => setBad(false), 900);
    }
  };
  return (
    <label className={`time-field ${bad ? 'bad' : ''}`}>
      <span>{label}</span>
      <input
        value={draft ?? editTime(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        title="Exemples : 0:30 ou 30 (secondes), 1:05,5 (1 min 5,5 s)"
      />
    </label>
  );
}

// Start / duration / end typed directly: the fast way to trim a long clip.
function TimingFields({ clip, clips, media, dispatch }) {
  const trim = (side, time) => {
    dispatch({ type: 'TRIM_TO', id: clip.id, side, time });
    return true;
  };
  const max = maxDuration(clip, clips, media);
  return (
    <div className="timing">
      <TimeField
        label="Début"
        value={clip.start}
        onCommit={(t) => {
          if (overlaps(clips, clip.track, t, clip.duration, clip.id, laneOf(clip))) return false;
          dispatch({ type: 'CHECKPOINT' });
          dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { start: t } });
          return true;
        }}
      />
      <TimeField label="Durée" value={clip.duration} onCommit={(d) => d >= 0.05 && trim('end', clip.start + Math.min(d, max))} />
      <TimeField label="Fin" value={clip.start + clip.duration} onCommit={(t) => t > clip.start && trim('end', Math.min(t, clip.start + max))} />
      {Number.isFinite(max) && max < 1e6 && <p className="hint">Durée maximale ici : {editTime(max)}</p>}
    </div>
  );
}

function FilterItemInspector({ clip, clips, custom, dispatch, onOpenFilters }) {
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  const maxFade = Math.max(0.1, Math.floor((clip.duration / 2) * 10) / 10);
  const seconds = (v) => `${v.toFixed(1).replace('.', ',')} s`;
  const info = filterInfo(clip.filter?.id, custom);
  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>Propriétés</span>
        <span className="bin-kind static filteritem">Piste Filtres</span>
      </div>
      <div className="inspector-body">
        <TimingFields clip={clip} clips={clips} dispatch={dispatch} />
        <h3>Filtre</h3>
        <div className="fx-current">
          <span>◐ {info?.name || 'Filtre'}</span>
          <button className="btn small" onClick={onOpenFilters}>
            Changer
          </button>
        </div>
        <Slider
          label="Intensité du filtre"
          value={Math.round((clip.filter?.amount ?? DEFAULT_FILTER_AMOUNT) * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v} %`}
          onStart={checkpoint}
          onChange={(v) => update({ filter: { id: clip.filter.id, amount: v / 100 } })}
          onReset={() => {
            checkpoint();
            update({ filter: { id: clip.filter.id, amount: DEFAULT_FILTER_AMOUNT } });
          }}
        />
        <h3>Transition du filtre</h3>
        <Slider
          label="Apparition"
          value={Math.min(clip.fadeIn ?? 0, maxFade)}
          min={0}
          max={maxFade}
          step={0.1}
          format={seconds}
          onStart={checkpoint}
          onChange={(v) => update({ fadeIn: v })}
          onReset={() => {
            checkpoint();
            update({ fadeIn: 0.5 });
          }}
        />
        <Slider
          label="Disparition"
          value={Math.min(clip.fadeOut ?? 0, maxFade)}
          min={0}
          max={maxFade}
          step={0.1}
          format={seconds}
          onStart={checkpoint}
          onChange={(v) => update({ fadeOut: v })}
          onReset={() => {
            checkpoint();
            update({ fadeOut: 0.5 });
          }}
        />
        <p className="hint">Le filtre colore toute l'image pendant sa durée. Place deux filtres côte à côte pour passer de l'un à l'autre.</p>
      </div>
    </aside>
  );
}

export default function Inspector({
  clip, clips = [], media, hasPrev, dispatch, onOpenEffects, onOpenFilters, customFilters = [], time = 0, busy = null, onReverse, onFreeze, ai,
}) {
  if (clip?.track === 'fx') return <FxItemInspector clip={clip} clips={clips} dispatch={dispatch} onOpenEffects={onOpenEffects} />;
  if (clip?.track === 'filter') {
    return <FilterItemInspector clip={clip} clips={clips} custom={customFilters} dispatch={dispatch} onOpenFilters={onOpenFilters} />;
  }
  if (clip?.track === 'text') {
    return (
      <aside className="panel inspector">
        <div className="panel-head">
          <span>Propriétés</span>
          <span className="bin-kind static text">Texte</span>
        </div>
        <div className="inspector-body">
          <TextInspector clip={clip} dispatch={dispatch} Slider={Slider} onSpeak={ai?.speak} aiBusy={ai?.busy} />
          <h3>Durée</h3>
          <TimingFields clip={clip} clips={clips} dispatch={dispatch} />
        </div>
      </aside>
    );
  }

  if (!clip || !media) {
    return (
      <aside className="panel inspector">
        <div className="panel-head">
          <span>Propriétés</span>
        </div>
        <div className="inspector-empty">Sélectionne un clip dans la timeline pour régler son son ou son texte.</div>
      </aside>
    );
  }

  const audio = clipAudio(clip);
  const maxFade = Math.max(0.1, Math.min(10, Math.floor(clip.duration * 10) / 10));
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  const commit = (patch) => {
    checkpoint();
    update(patch);
  };
  const seconds = (v) => `${v.toFixed(1).replace('.', ',')} s`;

  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>Propriétés</span>
        <span className={`bin-kind static ${media.type}`}>{KIND[media.type]}</span>
      </div>
      <div className="inspector-body">
        <div className="inspector-name" title={media.name}>
          {media.name}
        </div>
        <TimingFields clip={clip} clips={clips} media={media} dispatch={dispatch} />
        {media.type !== 'image' && (
          <SpeedInspector
            clip={clip}
            media={media}
            dispatch={dispatch}
            busy={busy}
            onReverse={onReverse}
            onFreeze={onFreeze}
            canFreeze={time > clip.start + 0.05 && time < clip.start + clip.duration - 0.05}
          />
        )}
        <RepeatTools clips={clips} ids={[clip.id]} dispatch={dispatch} />
        {ai && <AiTools clip={clip} media={media} ai={ai} />}

        <h3>Son</h3>
        {media.hasAudio ? (
          <>
            <label className="toggle">
              <input type="checkbox" checked={audio.muted} onChange={(e) => commit({ muted: e.target.checked })} />
              Couper le son
            </label>
            <Slider
              label="Volume"
              value={Math.round(audio.volume * 100)}
              min={0}
              max={MAX_VOLUME * 100}
              step={1}
              format={(v) => `${v} %`}
              disabled={audio.muted}
              onStart={checkpoint}
              onChange={(v) => update({ volume: v / 100 })}
              onReset={() => commit({ volume: 1 })}
            />
            <Slider
              label="Fondu d'entrée"
              value={Math.min(audio.fadeIn, maxFade)}
              min={0}
              max={maxFade}
              step={0.1}
              format={seconds}
              disabled={audio.muted}
              onStart={checkpoint}
              onChange={(v) => update({ fadeIn: v })}
              onReset={() => commit({ fadeIn: 0 })}
            />
            <Slider
              label="Fondu de sortie"
              value={Math.min(audio.fadeOut, maxFade)}
              min={0}
              max={maxFade}
              step={0.1}
              format={seconds}
              disabled={audio.muted}
              onStart={checkpoint}
              onChange={(v) => update({ fadeOut: v })}
              onReset={() => commit({ fadeOut: 0 })}
            />
            {audio.volume > 1 && !audio.muted && <p className="hint">Au-delà de 100 %, le son peut saturer.</p>}
            {clip.track === 'audio' && (
              <>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={!!clip.duck}
                    disabled={audio.muted}
                    onChange={(e) => commit({ duck: e.target.checked ? { level: 0.25 } : null })}
                  />
                  Baisser sous les voix
                </label>
                {clip.duck && (
                  <>
                    <Slider
                      label="Niveau pendant la voix"
                      value={Math.round((clip.duck.level ?? 0.25) * 100)}
                      min={5}
                      max={80}
                      step={1}
                      format={(v) => `${v} %`}
                      disabled={audio.muted}
                      onStart={checkpoint}
                      onChange={(v) => update({ duck: { level: v / 100 } })}
                      onReset={() => commit({ duck: { level: 0.25 } })}
                    />
                    <p className="hint">La musique baisse automatiquement quand une voix est détectée dans le son des clips vidéo.</p>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <p className="hint">Ce média n'a pas de son.</p>
        )}
        {isOverlay(clip) && <OverlayInspector clip={clip} dispatch={dispatch} />}
        {clip.track === 'video' && !isOverlay(clip) && <BackgroundInspector clip={clip} clips={clips} dispatch={dispatch} />}
        {clip.track === 'video' && <FilterInspector clip={clip} custom={customFilters} dispatch={dispatch} onOpenFilters={onOpenFilters} />}
        {clip.track === 'video' && !isOverlay(clip) && <EffectInspector clip={clip} dispatch={dispatch} Slider={Slider} onOpenEffects={onOpenEffects} />}
        {clip.track === 'video' && <VisualInspector clip={clip} hasPrev={hasPrev} dispatch={dispatch} />}
      </div>
    </aside>
  );
}
