// The light on glass buttons follows the cursor: the position goes to CSS, which draws the reflection.
const GLASS = '.btn, .pc-btn';

export function followCursorOnGlass() {
  document.addEventListener(
    'pointermove',
    (e) => {
      const button = e.target.closest?.(GLASS);
      if (!button) return;
      const box = button.getBoundingClientRect();
      button.style.setProperty('--mx', `${e.clientX - box.left}px`);
      button.style.setProperty('--my', `${e.clientY - box.top}px`);
    },
    { passive: true },
  );
}
