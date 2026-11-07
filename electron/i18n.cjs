// The main process's messages, in the language the interface tells it (see src/i18n.js).
const en = require('../shared/en.json');

let language = 'fr';

const setLanguage = (value) => {
  language = value === 'fr' ? 'fr' : 'en';
};

function T(text, ...args) {
  const out = language === 'fr' ? text : en[text] ?? text;
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '') : out;
}

module.exports = { T, setLanguage };
