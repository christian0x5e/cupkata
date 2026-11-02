import { useState } from 'react';
import { BUBBLES, TEXT_EFFECTS, TEXT_PRESETS } from '../text.js';
import SideMenu from './SideMenu.jsx';
import { SampleTile } from './TextInspector.jsx';

// "Texte" tab: a click adds a text at the playhead, already dressed in the chosen style, bubble or effect.
const GROUPS = {
  basic: [{ id: 'default', name: 'Texte par défaut', style: {} }, ...TEXT_PRESETS],
  bubble: BUBBLES.filter(([id]) => id !== 'none').map(([id, name]) => ({ id, name, style: { bubble: id, color: '#111111', outline: false } })),
  effects: TEXT_EFFECTS.filter(([id]) => id !== 'none').map(([id, name]) => ({ id, name, style: { effect: id, outline: id !== 'neon' } })),
};

export default function TextPanel({ time, dispatch, onNotice }) {
  const [group, setGroup] = useState('basic');
  const add = (item) => {
    dispatch({ type: 'ADD_TEXT', start: time, style: item.style });
    onNotice({ kind: 'ok', text: `Texte « ${item.name} » ajouté à la tête de lecture : écris ton texte dans Propriétés.` });
  };
  return (
    <div className="lp-split">
      <SideMenu
        items={[
          { id: 'basic', label: 'Basique', count: GROUPS.basic.length },
          { id: 'bubble', label: 'Bulles', count: GROUPS.bubble.length },
          { id: 'effects', label: 'Effets', count: GROUPS.effects.length },
        ]}
        value={group}
        onChange={setGroup}
      />
      <div className="fx-panel">
        <div className="fx-target">
          <span className="muted">Clique pour ajouter un texte à la tête de lecture.</span>
        </div>
        <div className="fx-grid text-grid">
          {GROUPS[group].map((item) => (
            <SampleTile
              key={item.id}
              style={item.style}
              text={group === 'bubble' ? 'Salut !' : 'Texte'}
              size={group === 'bubble' ? 250 : 320}
              label={item.name}
              onApply={() => add(item)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
