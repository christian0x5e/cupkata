# Crédits et licences tierces

Cupkata est écrit pour l'essentiel de zéro. Les éléments ci-dessous viennent de projets tiers ou s'en inspirent.

## OpenCut — licence MIT

- Source : https://github.com/OpenCut-app/opencut-classic
- Utilisé pour : la méthode de transcription locale avec Whisper via Transformers.js
  (`electron/transcribe.cjs`) et le découpage des transcriptions en sous-titres (`src/captions.js`).
  Le code a été adapté à l'architecture de Cupkata (processus principal Electron, extraction audio par FFmpeg).

```
Copyright 2025-2026 OpenCut

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## pixi-filters — licence MIT

- Source : https://github.com/pixijs/filters
- Utilisé pour : l'approche de plusieurs effets GPU de `src/gpu/shaders.js` (Tourbillon d'après TwistFilter,
  Onde de choc d'après ShockwaveFilter, Vieille télé d'après CRTFilter). Les shaders de Cupkata sont réécrits
  pour son moteur WebGL (coordonnées, paramètres et animation propres).

```
The MIT License

Copyright (c) 2013-2025 Mathew Groves, Chad Engler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Dépendances principales

| Composant | Licence | Rôle |
|---|---|---|
| Transformers.js (`@huggingface/transformers`) | Apache-2.0 | Exécute les modèles de reconnaissance vocale et de musique |
| Whisper (OpenAI), versions ONNX de `onnx-community` | MIT | Modèle de reconnaissance vocale, téléchargé au premier usage |
| MusicGen small (Meta), version ONNX `Xenova/musicgen-small` | CC BY-NC 4.0 (poids du modèle) | « Musique IA » : compose sur l'ordinateur, téléchargé au premier usage. Usage **non commercial** des musiques créées |
| MODNet, version ONNX `Xenova/modnet` | Apache-2.0 | « Supprimer l'arrière-plan » (détourage des personnes), téléchargé au premier usage |
| Silero VAD, version ONNX `onnx-community/silero-vad` | MIT | « Couper les silences » (détection de la parole), téléchargé au premier usage |
| OPUS-MT (Helsinki-NLP), versions ONNX `Xenova/opus-mt-*` | Apache-2.0 | « Traduire » les textes et sous-titres, un modèle par paire de langues, téléchargé au premier usage |
| MMS-TTS (Meta), versions ONNX `Xenova/mms-tts-*` | CC BY-NC 4.0 (poids du modèle) | Onglet « Voix » des textes (synthèse vocale). Usage **non commercial** des voix créées |
| ONNX Runtime (`onnxruntime-node`) | MIT | Moteur d'exécution du modèle |
| FFmpeg (`ffmpeg-static`, `ffprobe-static`) | GPL (binaires) | Analyse des médias et export vidéo |
| Electron | MIT | Application de bureau |
| React | MIT | Interface |

Les textes complets de ces licences se trouvent dans `node_modules/<paquet>/LICENSE`.

## Musiques libres (onglet Audio › Musique)

Cupkata interroge les interfaces publiques de ces bibliothèques ; il n'y a aucune musique dans l'application.
Chaque morceau garde sa propre licence Creative Commons, enregistrée dans un fichier « … - licence.txt »
à côté du morceau téléchargé (`Documents\Cupkata\Musiques`).

| Bibliothèque | Utilisation dans Cupkata |
|---|---|
| Internet Archive (collection « netlabels ») — https://archive.org | Recherche et téléchargement |
| ccMixter — https://ccmixter.org | Recherche ; le téléchargement se fait sur leur site (ils refusent les téléchargements par les applications) |
| Openverse — https://openverse.org | Recherche et téléchargement, quand leur service répond |
