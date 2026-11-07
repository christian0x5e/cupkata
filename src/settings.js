// The user's preferences, kept on this computer. They apply to what comes next and never change a project.
const STORAGE_KEY = 'cupkata.settings';

export const DEFAULT_SETTINGS = {
  exportCodec: 'h264',
  hardwareEncoding: true,
  imageDuration: 5,
  transitionDuration: 1,
  magnet: true,
  snap: true,
  link: true,
};

let current = { ...DEFAULT_SETTINGS };
if (typeof window !== 'undefined') {
  try {
    current = { ...DEFAULT_SETTINGS, ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    // Unreadable preferences: the defaults do the job.
  }
  window.cupkata?.setHardwareEncoding(current.hardwareEncoding);
}

export const getSetting = (name) => current[name];

export function setSetting(name, value) {
  current = { ...current, [name]: value };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Still applies until the app closes.
  }
  if (name === 'hardwareEncoding') window.cupkata?.setHardwareEncoding(value);
}
