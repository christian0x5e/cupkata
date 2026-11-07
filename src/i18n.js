// Interface language. The French text is the key: it stays readable in the code and shows if a translation
// is missing. Modules read their labels once when they load, so changing language reloads the window.
import en from '../shared/en.json';

const STORAGE_KEY = 'cupkata.language';

function storedLanguage() {
  if (typeof window === 'undefined') return 'fr'; // Tests, and code without an interface.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'fr' ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export const LANGUAGE = storedLanguage();
export const DECIMAL = LANGUAGE === 'fr' ? ',' : '.';
export const LOCALE = LANGUAGE === 'fr' ? 'fr-FR' : 'en-US';

export function T(text, ...args) {
  const out = LANGUAGE === 'fr' ? text : en[text] ?? text;
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '') : out;
}

export function setLanguage(language) {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    return;
  }
  window.cupkata.restartInterface();
}

if (typeof window !== 'undefined') {
  document.documentElement.lang = LANGUAGE;
  window.cupkata?.setLanguage(LANGUAGE);
}
