# Cupkata

Éditeur vidéo de bureau pour Windows, construit avec Electron, React et FFmpeg.
L'interface est en anglais par défaut, en français au choix (Réglages).

![Cupkata](docs/capture.png)

## Principe

**L'aperçu est identique à l'export.** Chaque réglage visible dans la fenêtre est calculé par les mêmes formules
que l'export FFmpeg, ou par le même shader grâce au moteur WebGL partagé (`src/gpu`).
Quand un traitement ne peut pas être rejoué en direct (stabilisation, fond vert, nettoyage de voix, effets de voix),
Cupkata crée une copie traitée du fichier : l'aperçu lit alors exactement ce que l'export utilisera.

## Fonctions

- **Montage** : timeline à pistes (vidéo, incrustations, audio, texte, effets, filtres), découpe, marqueurs, chapitres,
  montage par le texte, rythme sur les temps de la musique, images clés avec courbes, rampes de vitesse.
- **Image** : 132 filtres de couleur (tables LUT) et calques de réglage, une quarantaine d'effets (dont des effets GPU),
  39 transitions, recadrage automatique, stabilisation, fond vert, formes, autocollants.
- **Texte** : titres animés, sous-titres automatiques par Whisper en local, mot par mot.
- **Son** : volume, fondus, ducking, formes d'onde, volume uniforme (loudnorm), nettoyage de voix, effets de voix,
  56 effets sonores générés avec Stable Audio 3 Small SFX.
- **Export** : H.264, H.265 et AV1, encodage NVENC avec repli sur le processeur, préréglages, format short, extrait.
- **Projets** : sauvegarde automatique, copies de secours, modèles, proxys pour les gros fichiers.
- **Pilotage par une IA** : API locale protégée par jeton, activée par le bouton **AI** (voir `ai/GUIDE.md`
  et le serveur MCP `ai/cupkata-mcp.cjs`).

## Installer

Téléchargez `Cupkata Setup` dans l'onglet **Releases** du dépôt. L'application n'est pas signée :
Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » ; cliquez sur **Informations
complémentaires** puis **Exécuter quand même**.

## Démarrer (depuis le code)

Prérequis : Windows, Node.js. FFmpeg et FFprobe sont fournis par `ffmpeg-static` et `ffprobe-static`.

```sh
npm install
npm start        # compile l'interface puis ouvre l'application
npm run dev      # mode développement avec rechargement (Vite + Electron)
npm test         # tests Vitest, dont de vrais exports FFmpeg
npm run dist     # installateur NSIS et version portable dans release/
```

`Lancer Cupkata.bat` ouvre l'application sans passer par un terminal.

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/` | Interface React : timeline, panneaux, aperçu, effets, filtres, transitions, traductions (`i18n.js`). |
| `src/gpu/` | Moteur WebGL partagé par l'aperçu et l'export. |
| `electron/` | Processus principal : export FFmpeg (`media.cjs`), encodeurs, proxys, transcription, sauvegardes, API IA. |
| `shared/` | Données communes aux deux côtés : effets, filtres, effets de voix, sons, dictionnaire anglais (`en.json`). |
| `ai/` | Guide et serveur MCP pour piloter Cupkata depuis une IA. |
| `tests/` | Tests Vitest. |
| `build/`, `public/` | Icônes et fichiers statiques. |

## Traductions

Tout texte visible passe par `T('texte français', ...valeurs)`. Le français sert de clé, la traduction anglaise
est dans `shared/en.json`, et `{0}`, `{1}`… marquent les valeurs. Un test vérifie que chaque texte a sa traduction.

## Code tiers et licences

Le code tiers est uniquement sous licence permissive (MIT, Apache, BSD, ISC) et crédité dans
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Les effets sonores relèvent de la licence
Stability AI Community (« Powered by Stability AI »). Les photos d'exemple viennent de Poly Haven (CC0).

FFmpeg, livré avec l'application, est sous licence GPL v3 : voir la section FFmpeg de `THIRD_PARTY_NOTICES.md`.

Cupkata est distribué sous licence MIT (voir [`LICENSE`](LICENSE)).
