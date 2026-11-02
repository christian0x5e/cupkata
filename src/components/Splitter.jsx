// A bar between two panels: drag it to resize them, double-click it to go back to the default size.
// `axis` is 'x' (a vertical bar between columns) or 'y' (a horizontal bar between rows);
// `sign` is +1 when moving the mouse right / down makes the panel bigger, -1 when it makes it smaller.
export default function Splitter({ axis, sign = 1, value, min, max, onChange, onReset, title }) {
  function start(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const bar = e.currentTarget;
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      // Without capture the drag still works while the pointer stays over the window.
    }
    bar.classList.add('dragging');
    const p0 = axis === 'x' ? e.clientX : e.clientY;
    const v0 = value;
    const move = (ev) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - p0;
      onChange(Math.round(Math.min(max(), Math.max(min, v0 + sign * d))));
    };
    const up = () => {
      bar.classList.remove('dragging');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  }

  return <div className={`splitter ${axis}`} onPointerDown={start} onDoubleClick={onReset} title={title} />;
}
