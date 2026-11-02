// Small line icons for the tab bar (drawn for Cupkata, 24 × 24, using the current text colour).
const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconMedia = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M10 9.2v5.6l4.6-2.8z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconAudio = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10.5 15.5V8.5l4-1v6.2" />
    <circle cx="9.2" cy="15.6" r="1.4" fill="currentColor" />
    <circle cx="13.2" cy="13.8" r="1.4" fill="currentColor" />
  </Svg>
);
export const IconText = () => (
  <Svg>
    <path d="M5 6.5h10M10 6.5V18" />
    <path d="M14.5 11.5h5M17 11.5V18" />
  </Svg>
);
export const IconCaptions = () => (
  <Svg>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M16.8 10.2a2.2 2.2 0 1 0 0 3.6" />
  </Svg>
);
export const IconEffects = () => (
  <Svg>
    <path d="M12 3.5l2.1 5.2 5.4.4-4.1 3.5 1.3 5.3L12 15l-4.7 2.9 1.3-5.3-4.1-3.5 5.4-.4z" />
  </Svg>
);
export const IconTransitions = () => (
  <Svg>
    <path d="M4 5.5l8 6.5-8 6.5zM20 5.5l-8 6.5 8 6.5z" />
  </Svg>
);
export const IconFilters = () => (
  <Svg>
    <circle cx="9" cy="9.5" r="5" />
    <circle cx="15" cy="9.5" r="5" />
    <circle cx="12" cy="14.5" r="5" />
  </Svg>
);

// Preview control bar.
const Small = ({ children }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const IconPrevFrame = () => (
  <Small>
    <path d="M6 5v14" />
    <path d="M18 6l-9 6 9 6z" fill="currentColor" stroke="none" />
  </Small>
);
export const IconNextFrame = () => (
  <Small>
    <path d="M18 5v14" />
    <path d="M6 6l9 6-9 6z" fill="currentColor" stroke="none" />
  </Small>
);
export const IconLoop = () => (
  <Small>
    <path d="M4 12a7 7 0 0 1 12-4.9L18 9" />
    <path d="M18 4v5h-5" />
    <path d="M20 12a7 7 0 0 1-12 4.9L6 15" />
    <path d="M6 20v-5h5" />
  </Small>
);
export const IconCamera = () => (
  <Small>
    <path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" />
    <circle cx="12" cy="13.2" r="3.2" />
  </Small>
);
export const IconFullscreen = ({ exit }) => (
  <Small>
    {exit ? (
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    ) : (
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    )}
  </Small>
);
