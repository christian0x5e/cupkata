import { useState } from 'react';
import { SPEED_RAMPS, clipAudio, clipBackground, clipColor, clipSpeed, clipTransform, isOverlay, MAX_SPEED, MIN_SPEED, laneOf, maxDuration, MAX_VOLUME, OVERLAY_TRANSFORM, overlaps, TRANSITIONS } from '../project.js';
import VOICE_EFFECTS from '../../shared/voice-effects.json';
import { clearKeyframes, isAnimated, KEYFRAME_EASES, keyframeAt, removeKeyframe, setKeyframe, setKeyframeEase, transformPatch, valueAt } from '../keyframes.js';
import TextInspector from './TextInspector.jsx';
import RepeatTools from './RepeatTools.jsx';
import { clipEffect, DEFAULT_INTENSITY, EFFECTS } from '../effects.js';
import { DEFAULT_FILTER_AMOUNT, filterInfo } from '../filters.js';
import { ArrowRightLeft, AudioLines, Blend, Crosshair, Diamond, Drum, EffectIcon, Mic, Pipette, RotateCcw, Scissors, Snowflake, Video } from './icons.jsx';
import { DECIMAL, T } from '../i18n.js';

function EffectInspector({ clip, dispatch, Slider, onOpenEffects }) {
  const fx = clipEffect(clip);
  const info = fx && EFFECTS.find((e) => e.id === fx.type);
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });

  return (
    <>
      <h3>{T('Effet')}</h3>
      <div className="fx-current">
        <span>{info ? <><EffectIcon id={info.id} /> {info.label}</> : T('Aucun effet')}</span>
        <span className="fx-current-actions">
          <button className="btn small" onClick={onOpenEffects}>
            {info ? T('Changer') : T('Choisir')}
          </button>
          {info && (
            <button
              className="btn ghost small"
              onClick={() => {
                checkpoint();
                update({ effect: null });
              }}
            >
             {T('Retirer')}
            </button>
          )}
        </span>
      </div>
      {fx && (
        <Slider
          label={T('Intensité')}
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

const KIND = { video: T('Vidéo'), image: T('Photo'), audio: T('Audio') };

// ◆ at the playhead: click to remove that keyframe. ◇: click to add one with the value shown.
function KeyButton({ clip, prop, tau, value, dispatch }) {
  const inside = tau >= 0 && tau < clip.duration;
  const on = inside && !!keyframeAt(clip, prop, tau);
  const toggle = (e) => {
    e.preventDefault();
    dispatch({ type: 'CHECKPOINT' });
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: on ? removeKeyframe(clip, prop, tau) : setKeyframe(clip, prop, tau, value) });
  };
  const chooseEase = (e) => {
    dispatch({ type: 'CHECKPOINT' });
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: setKeyframeEase(clip, prop, tau, e.target.value) });
  };
  return (
    <>
    <button
      type="button"
      className={`key-btn ${on ? 'on' : isAnimated(clip, prop) ? 'animated' : ''}`}
      disabled={!inside}
      onClick={toggle}
      title={inside ? (on ? T('Retirer cette image clé') : T('Ajouter une image clé à la tête de lecture')) : T('Place la tête de lecture sur ce clip')}
      aria-label={on ? T('Retirer cette image clé') : T('Ajouter une image clé')}
    >
      {on ? <Diamond fill="currentColor" /> : <Diamond />}
    </button>
    {on && prop !== 'volume' && (
      <select className="key-ease" value={keyframeAt(clip, prop, tau).ease ?? 'linear'} onChange={chooseEase} title={T('Courbe jusqu’à l’image clé suivante')}>
        {KEYFRAME_EASES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    )}
    </>
  );
}

function Slider({ label, value, min, max, step, format, onStart, onChange, onReset, disabled }) {
  return (
    <label className={`field ${disabled ? 'disabled' : ''}`}>
      <span className="field-row">
        <span>{label}</span>
        <span className="field-value" onDoubleClick={onReset} title={T('Double-clic pour réinitialiser')}>
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

function TransitionInspector({ clip, clips, dispatch, onOpenTransitions }) {
  const tr = clip.transition;
  const before = clips.find((c) => c.id !== clip.id && c.track === 'video' && laneOf(c) === 0 && Math.abs(c.start + c.duration - clip.start) < 1e-3);
  const longest = Math.max(0.1, Math.floor(Math.min(clip.duration, before?.duration ?? clip.duration) * 10) / 10);
  const change = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { transition: { ...tr, ...patch } } });
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>{T('Propriétés')}</span>
        <span className="bin-kind static">{T('Transition')}</span>
      </div>
      <div className="inspector-body">
        <h3>{T('Transition')}</h3>
        <select
          value={tr.type}
          onChange={(e) => {
            checkpoint();
            change({ type: e.target.value });
          }}
        >
          {TRANSITIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <Slider
          label={T('Durée')}
          value={Math.min(tr.duration ?? 1, longest)}
          min={0.1}
          max={longest}
          step={0.1}
          format={(v) => `${v.toFixed(1).replace('.', DECIMAL)} s`}
          onStart={checkpoint}
          onChange={(v) => change({ duration: v })}
          onReset={() => {
            checkpoint();
            change({ duration: Math.min(1, longest) });
          }}
        />
        <button className="btn small" onClick={onOpenTransitions}>{T('Voir toutes les transitions')}</button>
        <button className="btn small" onClick={() => dispatch({ type: 'REMOVE_TRANSITION', ids: [clip.id] })}>{T('Retirer la transition')}</button>
      </div>
    </aside>
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
      <h3>{T('Couleur')}</h3>
      <Slider
        label={T('Luminosité')}
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
        label={T('Contraste')}
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
        label={T('Saturation')}
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
      <h3>{T("Transition d'entrée")}</h3>
      <select
        value={tr?.type || ''}
        onChange={(e) => commit({ transition: e.target.value ? { type: e.target.value, duration: tr?.duration ?? 1 } : null })}
      >
        <option value="">{T('Aucune')}</option>
        {TRANSITIONS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {tr?.type && (
        <Slider
          label={T('Durée')}
          value={Math.min(tr.duration ?? 1, maxTr)}
          min={0.1}
          max={maxTr}
          step={0.1}
          format={(v) => `${v.toFixed(1).replace('.', DECIMAL)} s`}
          onStart={checkpoint}
          onChange={(v) => update({ transition: { ...tr, duration: v } })}
          onReset={() => commit({ transition: { ...tr, duration: 1 } })}
        />
      )}
      {tr?.type && !hasPrev && (
        <p className="hint">{T('Colle ce clip juste après un autre clip vidéo pour voir la transition.')}</p>
      )}
      </>
      )}
    </>
  );
}

// Background where the picture doesn't fill the frame (e.g. a horizontal video in a 9:16 project).
const BG_MODES = [
  ['none', T('Noir')],
  ['blur', T('Flou')],
  ['fill', T('Remplir')],
  ['color', T('Couleur')],
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
      <h3>{T('Arrière-plan')}</h3>
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
        <Slider label={T('Flou')} value={Math.round(bg.blur * 100)} min={0} max={100} step={1} format={(v) => `${v} %`}
          onStart={checkpoint} onChange={(v) => set({ blur: v / 100 })} onReset={() => { checkpoint(); set({ blur: 0.5 }); }} />
      )}
      {bg.mode === 'color' && (
        <div className="field-row color-row">
          <span>{T('Couleur du fond')}</span>
          <input type="color" value={bg.color} onFocus={checkpoint} onChange={(e) => set({ color: e.target.value })} />
        </div>
      )}
      <p className="hint">
        {bg.mode === 'fill'
          ? T('L’image est agrandie pour remplir le cadre (les bords qui dépassent sont coupés).')
          : T('Remplit les bandes quand l’image n’a pas le format du projet (bouton Ratio, sous l’aperçu).')}
      </p>
      {main.length > 1 && (
        <button
          className="btn"
          onClick={() => {
            checkpoint();
            for (const c of main) dispatch({ type: 'UPDATE_CLIP', id: c.id, patch: { background: bg.mode === 'none' ? null : { ...bg } } });
          }}
        >
         {T('Appliquer à tous les clips')}
        </button>
      )}
    </>
  );
}

// Open-source AI tools that run on this computer.
function AiTools({ clip, media, ai }) {
  const [tolerance, setTolerance] = useState(0.15);
  const [minSilence, setMinSilence] = useState(0.5);
  const [every, setEvery] = useState(1);
  const followable = clip.track === 'video' && laneOf(clip) === 0 && media.type === 'video' && media.alpha !== true;
  const picture = clip.track === 'video' && (media.type === 'video' || media.type === 'image');
  const sound = media.hasAudio && media.type !== 'image';
  if (!picture && !sound) return null;
  return (
    <>
      <h3>{T('Outils IA')}</h3>
      {picture && (
        <button className={`btn ai-btn ${clip.cutout ? 'active' : ''}`} disabled={ai.busy} onClick={() => ai.cutout(clip)}
          title={T("Supprime l'arrière-plan derrière les personnes (modèle MODNet, sur ton ordinateur)")}>
          {clip.cutout ? <><RotateCcw /> {T('Remettre l’arrière-plan')}</> : <><Scissors /> {T('Supprimer l’arrière-plan')}</>}
        </button>
      )}
      {picture && !clip.cutout && (
        <div className="ai-row">
          <button className="btn ai-btn" disabled={ai.busy} onClick={() => ai.chroma(clip, { tolerance })}
            title={T('Retire un fond vert ou bleu uni. Sa couleur est lue dans les coins hauts de l’image. Une copie est créée : ton original ne change pas.')}>
            {ai.working === 'chroma' ? T('Retrait du fond…') : <><Pipette /> {T('Fond vert')}</>}
          </button>
          <input type="range" min={0.05} max={0.4} step={0.01} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} title={T('Tolérance : monte-la s’il reste du vert, baisse-la si le sujet disparaît')} />
        </div>
      )}
      {clip.track === 'video' && media.type === 'video' && (
        <button className={`btn ai-btn ${clip.stable ? 'active' : ''}`} disabled={ai.busy || (!clip.stable && !!(clip.cleaned || clip.voiced || clip.cutout || clip.reversed))} onClick={() => ai.stabilize(clip)}
          title={T('Corrige les tremblements de la caméra. Une copie est créée : ton original ne change pas. Peut prendre du temps sur une longue vidéo.')}>
          {ai.working === 'stable' ? T('Stabilisation…') : clip.stable ? <><RotateCcw /> {T('Remettre la vidéo d’origine')}</> : <><Video /> {T('Stabiliser la vidéo')}</>}
        </button>
      )}
      {sound && (
        <div className="ai-row">
          <button className="btn ai-btn" disabled={ai.busy} onClick={() => ai.silences(clip, minSilence)}
            title={T('Retire les passages sans parole (modèle Silero VAD, sur ton ordinateur)')}>
            <AudioLines /> {T('Couper les silences')}
          </button>
          <select value={minSilence} onChange={(e) => setMinSilence(Number(e.target.value))} title={T('Silence le plus court qui sera coupé')}>
            <option value={0.3}>{T('dès 0,3 s')}</option>
            <option value={0.5}>{T('dès 0,5 s')}</option>
            <option value={1}>{T('dès 1 s')}</option>
            <option value={2}>{T('dès 2 s')}</option>
          </select>
        </div>
      )}
      {followable && (
        <div className="ai-row">
          <button className={`btn ai-btn ${clip.reframe?.length ? 'active' : ''}`} disabled={ai.busy} onClick={() => ai.reframe(clip)}
            title={T("L'image remplit le format et suit la personne à l'écran, par exemple pour passer du 16:9 au 9:16 (modèle YOLOS, sur ton ordinateur)")}>
            {clip.reframe?.length ? <><RotateCcw /> {T('Retirer le recadrage')}</> : <><Crosshair /> {T('Recadrer sur le sujet')}</>}
          </button>
          <button className="btn" disabled={ai.busy} onClick={ai.reframeAll} title={T('Recadrer tous les clips vidéo de la piste principale')}>
           {T('Tous')}
          </button>
        </div>
      )}
      {sound && (
        <button className={`btn ai-btn ${clip.cleaned ? 'active' : ''}`} disabled={ai.busy || !!clip.stable || !!clip.voiced} onClick={() => ai.clean(clip)}
          title={T('Réduit le bruit de fond et égalise la voix. Une copie du fichier est créée : ton original ne change pas.')}>
          {ai.working === 'clean' ? T('Nettoyage…') : clip.cleaned ? <><RotateCcw /> {T('Remettre le son d’origine')}</> : <><Mic /> {T('Nettoyer la voix')}</>}
        </button>
      )}
      {sound && (
        <label className="field" title={T('Une copie du fichier est créée : ton original ne change pas.')}>
          <span>{ai.working === 'voice' ? T('Effet de voix…') : T('Effet de voix')}</span>
          <select value={clip.voiced?.effect ?? ''} disabled={ai.busy || !!(clip.cleaned || clip.stable || clip.cutout || clip.reversed)} onChange={(e) => ai.voice(clip, e.target.value || null)}>
            <option value="">{T('Aucun')}</option>
            {VOICE_EFFECTS.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}
      {clip.track === 'audio' && sound && (
        <>
          <h3>{T('Rythme')}</h3>
          <label className="field">
            <span>{T('Utiliser')}</span>
            <select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
              <option value={1}>{T('Chaque temps')}</option>
              <option value={2}>{T('Un temps sur 2')}</option>
              <option value={4}>{T('Un temps sur 4')}</option>
              <option value={8}>{T('Un temps sur 8')}</option>
            </select>
          </label>
          <button className="btn ai-btn" disabled={ai.busy} onClick={() => ai.beats(clip, 'fit', every)}
            title={T('Chaque clip de la piste principale se termine sur un temps fort de ce son')}>
            {ai.working === 'beats' ? T('Écoute du rythme…') : <><Drum /> {T('Caler les clips sur le rythme')}</>}
          </button>
          <button className="btn" disabled={ai.busy} onClick={() => ai.beats(clip, 'split', every)} title={T('Coupe les clips de la piste principale sur les temps forts')}>
           {T('Couper la vidéo sur les temps')}
          </button>
          <button className="btn" disabled={ai.busy} onClick={() => ai.beats(clip, 'markers', every)} title={T('Pose un marqueur sur chaque temps fort')}>
           {T('Marquer les temps')}
          </button>
          {ai.hasBeatMarkers && (
            <button className="btn ghost" onClick={ai.clearBeats}>
             {T('Retirer les marqueurs de rythme')}
            </button>
          )}
        </>
      )}
      <p className="hint">
        {picture && T('Le détourage marche le mieux avec des personnes ; compte environ 15 s de calcul par seconde de vidéo.')}
        {sound && T('Les silences sont repérés par l’IA dans la voix ; Ctrl+Z annule.')}
      </p>
    </>
  );
}

const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3];
const speedLabel = (v) => `${v.toFixed(2).replace(/\.?0+$/, '').replace('.', DECIMAL)}×`;

// Speed (video and sound clips), plus the reverse and freeze-frame actions for videos.
function SpeedInspector({ clip, media, dispatch, busy, onReverse, onFreeze, canFreeze }) {
  const speed = clipSpeed(clip);
  return (
    <>
      <h3>{T('Vitesse')}</h3>
      <Slider
        label={T('Vitesse')}
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
      <p className="hint">{T("La durée du clip s'adapte ; la voix garde sa hauteur.")}</p>
      {media?.type !== 'image' && (
        <div className="ramp-presets">
          {SPEED_RAMPS.map((r) => (
            <button key={r.id} className="btn small" title={T('Coupe le clip en morceaux à vitesses progressives')} onClick={() => dispatch({ type: 'SPEED_RAMP', id: clip.id, speeds: r.speeds })}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {media.type === 'video' && (
        <div className="speed-actions">
          <button className={`btn ${clip.reversed ? 'active' : ''}`} disabled={!!busy} onClick={() => onReverse(clip)} title={T("Lire ce clip à l'envers (image et son)")}>
            {busy === 'reverse' ? T('Inversion…') : clip.reversed ? <><ArrowRightLeft /> {T('Remettre à l’endroit')}</> : <><ArrowRightLeft /> {T('Inverser')}</>}
          </button>
          <button className="btn" disabled={!!busy || !canFreeze} onClick={() => onFreeze(clip)} title={T('Insérer une image fixe de 3 s à la tête de lecture')}>
            {busy === 'freeze' ? T('Figer…') : <><Snowflake /> {T('Figer l’image')}</>}
          </button>
        </div>
      )}
    </>
  );
}

// Overlay clips (video lanes above the main track): where they sit in the picture.
function OverlayInspector({ clip, dispatch, tau, main = false }) {
  const tf = clipTransform(clip, tau);
  const animated = ['scale', 'x', 'y', 'rotation', 'opacity'].filter((p) => isAnimated(clip, p));
  const key = (prop) => <KeyButton clip={clip} prop={prop} tau={tau} value={tf[prop]} dispatch={dispatch} />;
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const set = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: transformPatch(clip, tau, patch) });
  const reset = (patch) => {
    checkpoint();
    set(patch);
  };
  const pct = (v) => `${v} %`;
  return (
    <>
      <h3>{main ? T('Mouvement') : T('Incrustation')}</h3>
      <p className="hint">{main ? T('Zoome ou déplace l’image dans le temps :') : T('Dans l’aperçu : glisse l’image pour la déplacer, tire un coin pour la taille, le point du haut pour la tourner. Pour l’animer :')}{T('place la tête de lecture, clique sur')} <Diamond />{T(', puis recommence à un autre moment avec une autre valeur.')}</p>
      <Slider label={<>{key('scale')} {T('Taille')}</>} value={Math.round(tf.scale * 100)} min={5} max={400} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ scale: v / 100 })} onReset={() => reset({ scale: 1 })} />
      <Slider label={<>{key('x')} {T('Position horizontale')}</>} value={Math.round(tf.x * 100)} min={-50} max={150} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ x: v / 100 })} onReset={() => reset({ x: 0.5 })} />
      <Slider label={<>{key('y')} {T('Position verticale')}</>} value={Math.round(tf.y * 100)} min={-50} max={150} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ y: v / 100 })} onReset={() => reset({ y: 0.5 })} />
      <Slider label={<>{key('rotation')} {T('Rotation')}</>} value={Math.round(tf.rotation)} min={-180} max={180} step={1} format={(v) => `${v}°`}
        onStart={checkpoint} onChange={(v) => set({ rotation: v })} onReset={() => reset({ rotation: 0 })} />
      <Slider label={<>{key('opacity')} {T('Opacité')}</>} value={Math.round(tf.opacity * 100)} min={0} max={100} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => set({ opacity: v / 100 })} onReset={() => reset({ opacity: 1 })} />
      {animated.length > 0 && (
        <button
          className="btn"
          onClick={() => {
            checkpoint();
            let next = clip;
            for (const prop of animated) next = { ...next, ...clearKeyframes(next, prop) };
            dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { keyframes: next.keyframes } });
          }}
        >
         {T('Retirer les images clés')}
        </button>
      )}
      {!main && <div className="timing">
        <button className="btn" onClick={() => reset({ x: 0.5, y: 0.5 })} title={T("Remettre au centre de l'image")}>{T('Centrer')}</button>
        <button className="btn" onClick={() => reset({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })} title={T("Prendre toute l'image")}>{T('Plein cadre')}</button>
        <button className="btn" onClick={() => reset({ ...OVERLAY_TRANSFORM })} title={T('Taille et position de départ')}>{T('Réinit.')}</button>
      </div>}
    </>
  );
}

function FxItemInspector({ clip, clips, dispatch, onOpenEffects }) {
  const fx = clipEffect(clip);
  const info = fx && EFFECTS.find((e) => e.id === fx.type);
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  const maxFade = Math.max(0.1, Math.floor((clip.duration / 2) * 10) / 10);
  const seconds = (v) => `${v.toFixed(1).replace('.', DECIMAL)} s`;
  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>{T('Propriétés')}</span>
        <span className="bin-kind static fx">{T('Piste Effets')}</span>
      </div>
      <div className="inspector-body">
        <TimingFields clip={clip} clips={clips} dispatch={dispatch} />
        <h3>{T('Effet')}</h3>
        <div className="fx-current">
          <span>{info ? <><EffectIcon id={info.id} /> {info.label}</> : T('Effet')}</span>
          <button className="btn small" onClick={onOpenEffects}>
           {T('Changer')}
          </button>
        </div>
        <Slider
          label={T('Intensité')}
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
        <h3>{T("Transition de l'effet")}</h3>
        <Slider
          label={T('Apparition')}
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
          label={T('Disparition')}
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
         {T("L'effet s'applique à toute l'image pendant sa durée. Ses fondus le font apparaître et disparaître en douceur : place deux effets côte à côte pour passer de l'un à l'autre.")}
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
      <h3>{T('Filtre')}</h3>
      <div className="fx-current">
        <span>{info ? <><Blend /> {info.name}</> : T('Aucun filtre')}</span>
        <span className="fx-current-actions">
          <button className="btn small" onClick={onOpenFilters}>
            {info ? T('Changer') : T('Choisir')}
          </button>
          {info && (
            <button
              className="btn ghost small"
              onClick={() => {
                checkpoint();
                update({ filter: null });
              }}
            >
             {T('Retirer')}
            </button>
          )}
        </span>
      </div>
      {info && (
        <Slider
          label={T('Intensité du filtre')}
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
  return `${m}:${s.toFixed(2).padStart(5, '0').replace('.', DECIMAL)}`;
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
        title={T('Exemples : 0:30 ou 30 (secondes), 1:05,5 (1 min 5,5 s)')}
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
        label={T('Début')}
        value={clip.start}
        onCommit={(t) => {
          if (overlaps(clips, clip.track, t, clip.duration, clip.id, laneOf(clip))) return false;
          dispatch({ type: 'CHECKPOINT' });
          dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch: { start: t } });
          return true;
        }}
      />
      <TimeField label={T('Durée')} value={clip.duration} onCommit={(d) => d >= 0.05 && trim('end', clip.start + Math.min(d, max))} />
      <TimeField label={T('Fin')} value={clip.start + clip.duration} onCommit={(t) => t > clip.start && trim('end', Math.min(t, clip.start + max))} />
      {Number.isFinite(max) && max < 1e6 && <p className="hint">{T('Durée maximale ici :')} {editTime(max)}</p>}
    </div>
  );
}

function FilterItemInspector({ clip, clips, custom, dispatch, onOpenFilters }) {
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  const maxFade = Math.max(0.1, Math.floor((clip.duration / 2) * 10) / 10);
  const seconds = (v) => `${v.toFixed(1).replace('.', DECIMAL)} s`;
  const info = filterInfo(clip.filter?.id, custom);
  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>{T('Propriétés')}</span>
        <span className="bin-kind static filteritem">{T('Piste Filtres')}</span>
      </div>
      <div className="inspector-body">
        <TimingFields clip={clip} clips={clips} dispatch={dispatch} />
        <h3>{T('Filtre')}</h3>
        <div className="fx-current">
          <span><Blend /> {info?.name || T('Filtre')}</span>
          <button className="btn small" onClick={onOpenFilters}>
           {T('Changer')}
          </button>
        </div>
        <Slider
          label={T('Intensité du filtre')}
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
        <h3>{T('Transition du filtre')}</h3>
        <Slider
          label={T('Apparition')}
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
          label={T('Disparition')}
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
        <p className="hint">{T("Le filtre colore toute l'image pendant sa durée. Place deux filtres côte à côte pour passer de l'un à l'autre.")}</p>
      </div>
    </aside>
  );
}

export default function Inspector({
  transitionClip, onOpenTransitions, clip, clips = [], media, hasPrev, dispatch, onOpenEffects, onOpenFilters, customFilters = [], time = 0, busy = null, onReverse, onFreeze, ai,
}) {
  if (transitionClip?.transition?.type) return <TransitionInspector clip={transitionClip} clips={clips} dispatch={dispatch} onOpenTransitions={onOpenTransitions} />;
  if (clip?.track === 'fx') return <FxItemInspector clip={clip} clips={clips} dispatch={dispatch} onOpenEffects={onOpenEffects} />;
  if (clip?.track === 'filter') {
    return <FilterItemInspector clip={clip} clips={clips} custom={customFilters} dispatch={dispatch} onOpenFilters={onOpenFilters} />;
  }
  if (clip?.track === 'text') {
    return (
      <aside className="panel inspector">
        <div className="panel-head">
          <span>{T('Propriétés')}</span>
          <span className="bin-kind static text">{T('Texte')}</span>
        </div>
        <div className="inspector-body">
          <TextInspector clip={clip} dispatch={dispatch} Slider={Slider} onSpeak={ai?.speak} aiBusy={ai?.busy} />
          <h3>{T('Durée')}</h3>
          <TimingFields clip={clip} clips={clips} dispatch={dispatch} />
        </div>
      </aside>
    );
  }

  if (!clip || !media) {
    return (
      <aside className="panel inspector">
        <div className="panel-head">
          <span>{T('Propriétés')}</span>
        </div>
        <div className="inspector-empty">{T('Sélectionne un clip dans la timeline pour régler son son ou son texte.')}</div>
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
  const seconds = (v) => `${v.toFixed(1).replace('.', DECIMAL)} s`;

  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <span>{T('Propriétés')}</span>
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

        <h3>{T('Son')}</h3>
        {media.hasAudio ? (
          <>
            <label className="toggle">
              <input type="checkbox" checked={audio.muted} onChange={(e) => commit({ muted: e.target.checked })} />
             {T('Couper le son')}
            </label>
            <Slider
              label={<><KeyButton clip={clip} prop="volume" tau={time - clip.start} value={valueAt(clip, 'volume', time - clip.start, audio.volume)} dispatch={dispatch} /> {T('Volume')}</>}
              value={Math.round(valueAt(clip, 'volume', time - clip.start, audio.volume) * 100)}
              min={0}
              max={MAX_VOLUME * 100}
              step={1}
              format={(v) => `${v} %`}
              disabled={audio.muted}
              onStart={checkpoint}
              onChange={(v) => update(isAnimated(clip, 'volume') ? setKeyframe(clip, 'volume', time - clip.start, v / 100) : { volume: v / 100 })}
              onReset={() => commit({ volume: 1 })}
            />
            <Slider
              label={T("Fondu d'entrée")}
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
              label={T('Fondu de sortie')}
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
            {audio.volume > 1 && !audio.muted && <p className="hint">{T('Au-delà de 100 %, le son peut saturer.')}</p>}
            {clip.track === 'audio' && (
              <>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={!!clip.duck}
                    disabled={audio.muted}
                    onChange={(e) => commit({ duck: e.target.checked ? { level: 0.25 } : null })}
                  />
                 {T('Baisser sous les voix')}
                </label>
                {clip.duck && (
                  <>
                    <Slider
                      label={T('Niveau pendant la voix')}
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
                    <p className="hint">{T('La musique baisse automatiquement quand une voix est détectée dans le son des clips vidéo.')}</p>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <p className="hint">{T("Ce média n'a pas de son.")}</p>
        )}
        {isOverlay(clip) && <OverlayInspector clip={clip} dispatch={dispatch} tau={time - clip.start} />}
        {clip.track === 'video' && !isOverlay(clip) && <OverlayInspector clip={clip} dispatch={dispatch} tau={time - clip.start} main />}
        {clip.track === 'video' && !isOverlay(clip) && <BackgroundInspector clip={clip} clips={clips} dispatch={dispatch} />}
        {clip.track === 'video' && <FilterInspector clip={clip} custom={customFilters} dispatch={dispatch} onOpenFilters={onOpenFilters} />}
        {clip.track === 'video' && !isOverlay(clip) && <EffectInspector clip={clip} dispatch={dispatch} Slider={Slider} onOpenEffects={onOpenEffects} />}
        {clip.track === 'video' && <VisualInspector clip={clip} hasPrev={hasPrev} dispatch={dispatch} />}
      </div>
    </aside>
  );
}
