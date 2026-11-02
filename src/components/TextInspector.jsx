import { useEffect, useRef, useState } from 'react';
import { BUBBLES, drawText, FONTS, TEXT_ANIMS_IN, TEXT_ANIMS_LOOP, TEXT_ANIMS_OUT, TEXT_EFFECTS, TEXT_PRESETS, textAnim, textStyle } from '../text.js';

// Where the "place" grid puts the text: 3 × 3 spots on the picture.
const SPOTS = [0.15, 0.5, 0.85];
const PW = 112;
const PH = 46;

// Small sample drawn with the same code as the preview and the export (a style preset, a bubble, an effect…).
export function SampleTile({ style, text = 'Texte', label, active, onApply, size = 320 }) {
  const ref = useRef(null);
  const key = JSON.stringify(style);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(0, 0, PW, PH);
    const g = ctx.createLinearGradient(0, 0, PW, PH);
    g.addColorStop(0, '#3a7bd5');
    g.addColorStop(1, '#f6b38a');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, PW, PH);
    ctx.globalAlpha = 1;
    drawText(ctx, { text, style: { ...style, size, x: 0.5, y: 0.5, rotation: 0, opacity: 1 } }, PW, PH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, text, size]);
  return (
    <button className={`text-preset ${active ? 'active' : ''}`} onClick={onApply} title={label}>
      <canvas ref={ref} width={PW} height={PH} />
      <span>{label}</span>
    </button>
  );
}

function Tabs({ tabs, value, onChange, small }) {
  return (
    <div className={`insp-tabs ${small ? 'small' : ''}`}>
      {tabs.map(([id, label]) => (
        <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// The panel remembers the last tabs used, from one text to the next.
let lastTabs = { main: 'text', text: 'basic', anim: 'in' };

function ColorToggle({ label, on, color, onToggle, onColor, onStart }) {
  return (
    <div className="text-toggle-row">
      <label className="toggle">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {label}
      </label>
      {on && <input type="color" value={color} onFocus={onStart} onChange={(e) => onColor(e.target.value)} />}
    </div>
  );
}

const ANIM_LISTS = { in: TEXT_ANIMS_IN, out: TEXT_ANIMS_OUT, loop: TEXT_ANIMS_LOOP };

const VOICES = [
  ['fr', 'Français'],
  ['en', 'Anglais'],
  ['es', 'Espagnol'],
  ['de', 'Allemand'],
  ['pt', 'Portugais'],
];
let lastVoice = { lang: 'fr', rate: 1 };

export default function TextInspector({ clip, dispatch, Slider, onSpeak, aiBusy }) {
  const [voice, setVoiceState] = useState(lastVoice);
  const setVoice = (patch) => {
    lastVoice = { ...lastVoice, ...patch };
    setVoiceState(lastVoice);
  };
  const s = textStyle(clip);
  const a = textAnim(clip);
  const [tabs, setTabsState] = useState(lastTabs);
  const setTab = (key, value) => {
    lastTabs = { ...lastTabs, [key]: value };
    setTabsState(lastTabs);
  };
  const checkpoint = () => dispatch({ type: 'CHECKPOINT' });
  const update = (patch) => dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch });
  const setStyle = (patch) => update({ style: { ...clip.style, ...patch } });
  const commitStyle = (patch) => {
    checkpoint();
    setStyle(patch);
  };
  const commitAnim = (patch) => {
    checkpoint();
    update({ anim: { ...a, ...patch } });
  };
  const pct = (v) => `${v} %`;
  const active = TEXT_PRESETS.find((p) => Object.entries(p.style).every(([k, v]) => s[k] === v));
  // Samples keep the text's own look and change only what the tile shows.
  const base = { ...s, bubble: 'none', effect: 'none' };

  const basic = (
    <>
      <label className="field">
        <span>Texte</span>
        <textarea
          rows={3}
          value={clip.text}
          maxLength={500}
          placeholder="Écris ton texte ici"
          onFocus={checkpoint}
          onChange={(e) => update({ text: e.target.value })}
        />
      </label>
      <p className="hint">Dans l'aperçu : glisse le texte pour le placer où tu veux, tire un coin pour sa taille, le point du haut pour le tourner.</p>

      <h3>Styles</h3>
      <div className="text-presets">
        {TEXT_PRESETS.map((p) => (
          <SampleTile
            key={p.id}
            style={p.style}
            label={p.name}
            active={active?.id === p.id}
            onApply={() => {
              // A preset replaces the look; the place, size, rotation, bubble and effect stay.
              const { x, y, size, rotation, opacity, bubble, bubbleColor, bubbleBorder, tail, effect } = s;
              checkpoint();
              update({ style: { ...p.style, x, y, size, rotation, opacity, bubble, bubbleColor, bubbleBorder, tail, effect } });
            }}
          />
        ))}
      </div>

      <h3>Police</h3>
      <select value={s.font} onChange={(e) => commitStyle({ font: e.target.value })} style={{ fontFamily: s.font }}>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
      <Slider label="Taille" value={s.size} min={20} max={400} step={1} format={(v) => `${v} px`}
        onStart={checkpoint} onChange={(v) => setStyle({ size: v })} onReset={() => commitStyle({ size: 72 })} />
      <div className="text-format">
        <button className={`btn ${s.bold ? 'active' : ''}`} onClick={() => commitStyle({ bold: !s.bold })} title="Gras"><b>G</b></button>
        <button className={`btn ${s.italic ? 'active' : ''}`} onClick={() => commitStyle({ italic: !s.italic })} title="Italique"><i>I</i></button>
        <button className={`btn ${s.upper ? 'active' : ''}`} onClick={() => commitStyle({ upper: !s.upper })} title="Tout en majuscules">AA</button>
        <span className="text-format-sep" />
        {[['left', '⇤'], ['center', '↔'], ['right', '⇥']].map(([v, icon]) => (
          <button key={v} className={`btn ${s.align === v ? 'active' : ''}`} onClick={() => commitStyle({ align: v })} title={`Aligner ${{ left: 'à gauche', center: 'au centre', right: 'à droite' }[v]}`}>
            {icon}
          </button>
        ))}
      </div>
      <Slider label="Espacement des lettres" value={Math.round(s.spacing * 100)} min={-5} max={50} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => setStyle({ spacing: v / 100 })} onReset={() => commitStyle({ spacing: 0 })} />

      <h3>Couleurs</h3>
      <div className="field-row color-row">
        <span>Couleur du texte</span>
        <input type="color" value={s.color} onFocus={checkpoint} onChange={(e) => setStyle({ color: e.target.value })} />
      </div>
      <ColorToggle label="Dégradé" on={!!s.gradient} color={s.gradient || '#ff3d77'} onStart={checkpoint}
        onToggle={(on) => commitStyle({ gradient: on ? '#ff3d77' : null })} onColor={(c) => setStyle({ gradient: c })} />
      <ColorToggle label="Contour" on={s.outline} color={s.outlineColor} onStart={checkpoint}
        onToggle={(on) => commitStyle({ outline: on })} onColor={(c) => setStyle({ outlineColor: c })} />
      {s.outline && (
        <Slider label="Épaisseur du contour" value={Math.round(s.outlineWidth * 100)} min={2} max={30} step={1} format={pct}
          onStart={checkpoint} onChange={(v) => setStyle({ outlineWidth: v / 100 })} onReset={() => commitStyle({ outlineWidth: 0.12 })} />
      )}
      <ColorToggle label="Fond" on={s.box} color={s.boxColor} onStart={checkpoint}
        onToggle={(on) => commitStyle({ box: on })} onColor={(c) => setStyle({ boxColor: c })} />
      {s.box && (
        <Slider label="Opacité du fond" value={Math.round(s.boxOpacity * 100)} min={10} max={100} step={1} format={pct}
          onStart={checkpoint} onChange={(v) => setStyle({ boxOpacity: v / 100 })} onReset={() => commitStyle({ boxOpacity: 0.6 })} />
      )}
      <ColorToggle label="Ombre" on={s.shadow} color={s.shadowColor} onStart={checkpoint}
        onToggle={(on) => commitStyle({ shadow: on })} onColor={(c) => setStyle({ shadowColor: c })} />
      <ColorToggle label="Lueur (néon)" on={s.glow} color={s.glowColor} onStart={checkpoint}
        onToggle={(on) => commitStyle({ glow: on })} onColor={(c) => setStyle({ glowColor: c })} />

      <h3>Position</h3>
      <div className="text-spots" title="Placer le texte">
        {SPOTS.map((y) =>
          SPOTS.map((x) => (
            <button
              key={`${x}-${y}`}
              className={`text-spot ${Math.abs(s.x - x) < 0.01 && Math.abs(s.y - y) < 0.01 ? 'active' : ''}`}
              onClick={() => commitStyle({ x, y })}
            />
          )),
        )}
      </div>
      <Slider label="Horizontale" value={Math.round(s.x * 100)} min={0} max={100} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => setStyle({ x: v / 100 })} onReset={() => commitStyle({ x: 0.5 })} />
      <Slider label="Verticale" value={Math.round(s.y * 100)} min={0} max={100} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => setStyle({ y: v / 100 })} onReset={() => commitStyle({ y: 0.85 })} />
      <Slider label="Rotation" value={Math.round(s.rotation)} min={-180} max={180} step={1} format={(v) => `${v}°`}
        onStart={checkpoint} onChange={(v) => setStyle({ rotation: v })} onReset={() => commitStyle({ rotation: 0 })} />
      <Slider label="Opacité" value={Math.round(s.opacity * 100)} min={0} max={100} step={1} format={pct}
        onStart={checkpoint} onChange={(v) => setStyle({ opacity: v / 100 })} onReset={() => commitStyle({ opacity: 1 })} />
    </>
  );

  // In a light bubble, white text would vanish: it turns dark when the first bubble is chosen.
  const chooseBubble = (id) => {
    if (id === 'none') return commitStyle({ bubble: 'none' });
    const darken = s.bubble === 'none' && s.color.toLowerCase() === '#ffffff' && s.bubbleColor.toLowerCase() === '#ffffff';
    return commitStyle({ bubble: id, box: false, ...(darken ? { color: '#111111', outline: false } : {}) });
  };
  const bubbleSampleText = s.bubble === 'none' && s.color.toLowerCase() === '#ffffff' ? '#111111' : s.color;
  const bubbles = (
    <>
      <div className="text-presets">
        {BUBBLES.map(([id, label]) => (
          <SampleTile
            key={id}
            style={id === 'none' ? base : { ...base, bubble: id, box: false, outline: false, color: bubbleSampleText }}
            text="Salut !"
            size={250}
            label={label}
            active={s.bubble === id}
            onApply={() => chooseBubble(id)}
          />
        ))}
      </div>
      {s.bubble !== 'none' && (
        <>
          <div className="field-row color-row">
            <span>Couleur de la bulle</span>
            <input type="color" value={s.bubbleColor} onFocus={checkpoint} onChange={(e) => setStyle({ bubbleColor: e.target.value })} />
          </div>
          <div className="field-row color-row">
            <span>Bordure</span>
            <input type="color" value={s.bubbleBorder} onFocus={checkpoint} onChange={(e) => setStyle({ bubbleBorder: e.target.value })} />
          </div>
          {(s.bubble === 'speech' || s.bubble === 'thought') && (
            <div className="field">
              <span>Pointe</span>
              <div className="segmented">
                {[['left', '↙ À gauche'], ['right', 'À droite ↘']].map(([v, l]) => (
                  <button key={v} className={`btn ${s.tail === v ? 'active' : ''}`} onClick={() => commitStyle({ tail: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <p className="hint">La bulle suit le texte : déplace-le, tourne-le ou anime-le, elle vient avec.</p>
    </>
  );

  const effects = (
    <>
      <div className="text-presets">
        {TEXT_EFFECTS.map(([id, label]) => (
          <SampleTile key={id} style={{ ...base, effect: id }} label={label} active={s.effect === id} onApply={() => commitStyle({ effect: id })} />
        ))}
      </div>
      <p className="hint">L'effet s'ajoute au style : change la couleur du texte dans « Basique » pour varier Néon, 3D ou Écho.</p>
    </>
  );

  const animation = (
    <>
      <Tabs tabs={[['in', 'Entrée'], ['out', 'Sortie'], ['loop', 'En boucle']]} value={tabs.anim} onChange={(v) => setTab('anim', v)} small />
      <div className="anim-grid">
        {ANIM_LISTS[tabs.anim].map(([id, label]) => (
          <button key={id} className={`btn ${a[tabs.anim] === id ? 'active' : ''}`} onClick={() => commitAnim({ [tabs.anim]: id })}>
            {label}
          </button>
        ))}
      </div>
      {tabs.anim !== 'loop' && (a.in !== 'none' || a.out !== 'none') && (
        <Slider label="Durée d'entrée / sortie" value={a.duration} min={0.1} max={2} step={0.1}
          format={(v) => `${v.toFixed(1).replace('.', ',')} s`}
          onStart={checkpoint} onChange={(v) => update({ anim: { ...a, duration: v } })} onReset={() => commitAnim({ duration: 0.5 })} />
      )}
      <p className="hint">Lance la lecture pour voir l'animation ; elle est rendue telle quelle à l'export.</p>
    </>
  );

  const speech = (
    <>
      <p className="hint">Une voix lit ce texte ; elle est posée sur la piste Audio au début du texte.</p>
      <label className="field">
        <span>Langue de la voix</span>
        <select value={voice.lang} onChange={(e) => setVoice({ lang: e.target.value })}>
          {VOICES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Slider label="Vitesse de lecture" value={voice.rate} min={0.6} max={1.6} step={0.05}
        format={(v) => `${v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}×`}
        onStart={() => {}} onChange={(v) => setVoice({ rate: v })} onReset={() => setVoice({ rate: 1 })} />
      <button className="btn primary" disabled={aiBusy || !onSpeak || !(clip.text || '').trim()} onClick={() => onSpeak(clip, voice.lang, voice.rate)}>
        🔊 Créer la voix
      </button>
      <p className="hint">Voix MMS-TTS (Meta), créée sur ton ordinateur. Licence CC BY-NC 4.0 : pour un usage non commercial.</p>
    </>
  );

  return (
    <>
      <Tabs tabs={[['text', 'Texte'], ['anim', 'Animation'], ['voice', 'Voix']]} value={tabs.main} onChange={(v) => setTab('main', v)} />
      {tabs.main === 'text' && (
        <>
          <Tabs tabs={[['basic', 'Basique'], ['bubble', 'Bulle'], ['effects', 'Effets']]} value={tabs.text} onChange={(v) => setTab('text', v)} small />
          {tabs.text === 'basic' && basic}
          {tabs.text === 'bubble' && bubbles}
          {tabs.text === 'effects' && effects}
        </>
      )}
      {tabs.main === 'anim' && animation}
      {tabs.main === 'voice' && speech}
    </>
  );
}
