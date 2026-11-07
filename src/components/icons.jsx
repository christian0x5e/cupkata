// Every icon of the interface, from Lucide (ISC licence, see THIRD_PARTY_NOTICES.md): one family, one
// line weight, and the current text colour. Their size is set in styles.css (svg.lucide).
import {
  Activity, Aperture, ArrowRightLeft, Blend, Bug, Camera, Captions, CircleDot, Clapperboard, CloudRain, Coffee, Contrast, Disc3, Droplet, Eclipse, Film, Flame, Flashlight, FlipHorizontal, Flower, Focus, Grid3x3, Grip, Heart, Hexagon, Layers, Maximize, Mountain, Music, Palette, PartyPopper, Pause, Play, Radio, Rainbow, RectangleHorizontal, Repeat, RotateCw, Search, Snowflake, Sparkle, Sparkles, Stars, StepBack, StepForward, Sun, SunDim, Thermometer, Timer, Tornado, TriangleAlert, Tv, Type, Vibrate, Video, Waves, Zap, ZoomIn,
} from 'lucide-react';

export {
  Settings, AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowDownLeft, ArrowDownRight, ArrowDownToLine, ArrowLeftToLine, ArrowRight, ArrowRightLeft, ArrowRightToLine, ArrowUpDown, AudioLines, Blend, Captions, Check, ChevronDown, ChevronUp, Circle, Copy, ClipboardPaste, Crosshair, Diamond, Download, Drum, ExternalLink, Flag, Link, ListOrdered, Magnet, Maximize2, Merge, Mic, MoveHorizontal, Music, Pause, Pipette, Play, Redo2, RefreshCw, RotateCcw, Scissors, Shuffle, Snowflake, Sparkles, Square, Trash2, Type, Undo2, Upload, Video, Volume2, VolumeX, X,
} from 'lucide-react';

export {
  Clapperboard as IconMedia, Music as IconAudio, Type as IconText, Captions as IconCaptions, Sparkles as IconEffects,
  ArrowRightLeft as IconTransitions, Blend as IconFilters, StepBack as IconPrevFrame, StepForward as IconNextFrame,
  Repeat as IconLoop, Camera as IconCamera, Maximize as IconFullscreen, Play as IconPlay, Pause as IconPause,
};

const EFFECT_ICONS = {
  blur: Droplet, bw: Contrast, sepia: Coffee, invert: Eclipse, pop: Palette, vignette: CircleDot,
  theend: Clapperboard, opening: Clapperboard, irisout: Aperture, irisin: Aperture, countdown: Timer, filmburn: Flame,
  filmstrip: Film, rec: Video, spotlight: Flashlight, glow: SunDim, dream: Stars, lightleak: Sun,
  sparkblur: Sparkles, flash: Zap, shake: Vibrate, pulse: Activity, wave: Waves, zoomslow: ZoomIn,
  sway: RotateCw, rgb: Layers, rainbow: Rainbow, mirror: FlipHorizontal, pixel: Grid3x3, cinema: RectangleHorizontal,
  vhs: Disc3, oldfilm: Film, sparkle: Sparkle, snow: Snowflake, confetti: PartyPopper, hearts: Heart,
  rain: CloudRain, bokeh: CircleDot, fireflies: Bug, swirl: Tornado, bulge: Search, zoomblur: Focus,
  crt: Tv, glitch: TriangleAlert, shockwave: Radio, emboss: Mountain, halftone: Grip, tiltshift: Camera,
  bloom: Flower, kaleido: Hexagon, heat: Thermometer,
};

export const EffectIcon = ({ id }) => {
  const Icon = EFFECT_ICONS[id] ?? Sparkles;
  return <Icon />;
};
