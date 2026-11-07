import { useState } from 'react';
import { BUBBLES, TEXT_EFFECTS, TEXT_PRESETS } from '../text.js';
import { EMOJIS, SHAPES } from '../stickers.js';
import SideMenu from './SideMenu.jsx';
import { SampleTile } from './TextInspector.jsx';
import { T } from '../i18n.js';

// "Texte" tab: a click adds a text at the playhead, already dressed in the chosen style, bubble or effect.
const GROUPS = {
  basic: [{ id: 'default', name: T('Texte par défaut'), style: {} }, ...TEXT_PRESETS],
  bubble: BUBBLES.filter(([id]) => id !== 'none').map(([id, name]) => ({ id, name, style: { bubble: id, color: '#111111', outline: false } })),
  effects: TEXT_EFFECTS.filter(([id]) => id !== 'none').map(([id, name]) => ({ id, name, style: { effect: id, outline: id !== 'neon' } })),
  shapes: SHAPES.map(({ id, name }) => ({
    id, name, sticker: id, text: name,
    style: id === 'progress' ? { color: '#ff4fa3', size: 120, y: 0.96, outline: false } : { color: '#ffe000', size: 160, y: 0.5, outline: false },
  })),
  emojis: EMOJIS.map((emoji) => ({ id: emoji, name: emoji, text: emoji, style: { font: 'Segoe UI Emoji', bold: false, size: 180, y: 0.5, outline: false } })),
};

export default function TextPanel({ time, total = 0, dispatch, onNotice }) {
  const [group, setGroup] = useState('basic');
  const add = (item) => {
    // A progress bar spans the whole video from the start.
    const whole = item.sticker === 'progress' && total > 0;
    dispatch({ type: 'ADD_TEXT', start: whole ? 0 : time, style: item.style, text: item.text, sticker: item.sticker, ...(whole ? { duration: total } : {}) });
    onNotice({ kind: 'ok', text: item.text ? T('« {0} » ajouté : déplace-le et redimensionne-le dans l’aperçu.', item.name) : T('Texte « {0} » ajouté à la tête de lecture : écris ton texte dans Propriétés.', item.name) });
  };
  return (
    <div className="lp-split">
      <SideMenu
        items={[
          { id: 'basic', label: T('Basique'), count: GROUPS.basic.length },
          { id: 'bubble', label: T('Bulles'), count: GROUPS.bubble.length },
          { id: 'effects', label: T('Effets'), count: GROUPS.effects.length },
          { id: 'shapes', label: T('Formes'), count: GROUPS.shapes.length },
          { id: 'emojis', label: T('Émojis'), count: GROUPS.emojis.length },
        ]}
        value={group}
        onChange={setGroup}
      />
      <div className="fx-panel">
        <div className="fx-target">
          <span className="muted">{T('Clique pour ajouter un texte à la tête de lecture.')}</span>
        </div>
        <div className="fx-grid text-grid">
          {GROUPS[group].map((item) => (
            <SampleTile
              key={item.id}
              style={item.style}
              text={item.text ?? (group === 'bubble' ? T('Salut !') : T('Texte'))}
              sticker={item.sticker}
              size={group === 'bubble' ? 250 : group === 'shapes' ? 400 : group === 'emojis' ? 700 : 320}
              label={item.name}
              onApply={() => add(item)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
