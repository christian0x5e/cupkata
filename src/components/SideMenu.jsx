import { useState } from 'react';

// Column of categories on the left of a tab (like "Importer / Tes médias / Musique…").
// items: [{ id, label, count?, onClick?, children?: [{ id, label, count? }] }]. An item with
// `onClick` is an action (e.g. Importer); one with children opens to show them.
export default function SideMenu({ items, value, onChange }) {
  const [open, setOpen] = useState(() => new Set(items.filter((i) => i.children?.some((c) => c.id === value)).map((i) => i.id)));
  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <nav className="side-menu">
      {items.map((item) => {
        if (item.children) {
          const expanded = open.has(item.id);
          const inside = item.children.some((c) => c.id === value);
          return (
            <div key={item.id} className="side-group">
              <button className={`side-item ${inside ? 'active' : ''}`} onClick={() => toggle(item.id)} aria-expanded={expanded}>
                <span>{item.label}</span>
                <span className="side-caret">{expanded ? '▴' : '▾'}</span>
              </button>
              {expanded &&
                item.children.map((c) => (
                  <button key={c.id} className={`side-sub ${value === c.id ? 'active' : ''}`} onClick={() => onChange(c.id)}>
                    <span>{c.label}</span>
                    {c.count != null && <span className="side-count">{c.count}</span>}
                  </button>
                ))}
            </div>
          );
        }
        return (
          <button
            key={item.id}
            className={`side-item ${item.onClick ? 'action' : ''} ${value === item.id ? 'active' : ''}`}
            onClick={() => (item.onClick ? item.onClick() : onChange(item.id))}
            title={item.title}
          >
            <span>{item.label}</span>
            {item.count != null && <span className="side-count">{item.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
