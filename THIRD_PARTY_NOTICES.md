# Credits and third-party licenses

Cupkata is mostly written from scratch. The items below come from, or are inspired by, third-party projects.

## OpenCut — MIT License

- Source: https://github.com/OpenCut-app/opencut-classic
- Used for: the local transcription method with Whisper through Transformers.js
  (`electron/transcribe.cjs`) and splitting transcripts into captions (`src/captions.js`).
  The code was adapted to Cupkata's architecture (Electron main process, audio extraction with FFmpeg).

```
Copyright 2025-2026 OpenCut

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Models downloaded on demand

These models are not shipped with Cupkata: they are downloaded once from Hugging Face, on first use.

- **Whisper** (OpenAI, MIT License), `onnx-community/whisper-base_timestamped` and `whisper-small_timestamped`:
  word-level transcription for captions and text-based editing (`electron/transcribe.cjs`).
- **YOLOS tiny** (hustvl, Apache-2.0 License), `Xenova/yolos-tiny`: person detection for auto reframe
  (`electron/ai.cjs`).

## Published methods

- Beat tracking (`electron/beats.cjs`): code written for Cupkata after D. Ellis, *Beat Tracking by Dynamic Programming* (2007).
- Transitions: the formulas in `src/transitions.js` reproduce the output of FFmpeg's transitions (`xfade` filter), which is
  run as an external program during export.

## pixi-filters — MIT License

- Source: https://github.com/pixijs/filters
- Used for: the approach of several GPU effects in `src/gpu/shaders.js` (Twirl after TwistFilter,
  Shockwave after ShockwaveFilter, Old TV after CRTFilter). Cupkata's shaders are rewritten
  for its own WebGL engine (its own coordinates, parameters and animation).

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

## Main dependencies

| Component | License | Role |
|---|---|---|
| Lucide (`lucide-react`), https://lucide.dev | ISC | All interface icons |
| Transformers.js (`@huggingface/transformers`) | Apache-2.0 | Runs the speech recognition and music models |
| Whisper (OpenAI), ONNX versions from `onnx-community` | MIT | Speech recognition model, downloaded on first use |
| MusicGen small (Meta), ONNX version `Xenova/musicgen-small` | CC BY-NC 4.0 (model weights) | "AI Music": composes on the computer, downloaded on first use. Generated music is for **non-commercial** use only |
| MODNet, ONNX version `Xenova/modnet` | Apache-2.0 | "Remove background" (person cutout), downloaded on first use |
| Silero VAD, ONNX version `onnx-community/silero-vad` | MIT | "Cut silences" (speech detection), downloaded on first use |
| OPUS-MT (Helsinki-NLP), ONNX versions `Xenova/opus-mt-*` | Apache-2.0 | "Translate" texts and captions, one model per language pair, downloaded on first use |
| MMS-TTS (Meta), ONNX versions `Xenova/mms-tts-*` | CC BY-NC 4.0 (model weights) | "Voice" tab of texts (text to speech). Generated voices are for **non-commercial** use only |
| ONNX Runtime (`onnxruntime-node`) | MIT | Model runtime |
| FFmpeg (`ffmpeg-static`, `ffprobe-static`) | GPL (binaries) | Media analysis and video export |
| Electron | MIT | Desktop application |
| React | MIT | User interface |

The full license texts are in `node_modules/<package>/LICENSE`.

## FFmpeg — GPL v3 License

The installed app contains the FFmpeg and FFprobe executables provided by `ffmpeg-static` and `ffprobe-static`
(FFmpeg 6.1.1, "essentials" build from https://www.gyan.dev, built with `--enable-gpl --enable-version3`,
including x264, x265 and vidstab). These executables are licensed under the GNU GPL v3; Cupkata runs them as
separate programs, and its own code remains under the MIT License.

- FFmpeg source code: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93
- Build configuration and license text: `node_modules/ffmpeg-static/ffmpeg.exe.README`
  and `ffmpeg.exe.LICENSE` (in the installed app: `resources\app.asar.unpacked\node_modules\ffmpeg-static`).

FFmpeg is a trademark of Fabrice Bellard. The H.264, H.265 and AAC formats may be covered by patents
in some countries.

## Free music (Audio › Music tab)

Cupkata queries the public APIs of these libraries; no music is shipped with the app.
Each track keeps its own Creative Commons license, saved in a "… - licence.txt" file
next to the downloaded track (`Documents\Cupkata\Musiques`).

| Library | Use in Cupkata |
|---|---|
| Internet Archive ("netlabels" collection) — https://archive.org | Search and download |
| ccMixter — https://ccmixter.org | Search; downloading happens on their website (they refuse downloads from apps) |
| Openverse — https://openverse.org | Search and download, when their service responds |

## Sample photos (transition and filter previews)

`src/samples/day.jpg` and `src/samples/night.jpg` are cropped from "Spruit Sunrise" and "Shanghai Bund"
by Greg Zaal, published on Poly Haven (https://polyhaven.com) under the CC0 license.

## Sound effects (Audio › Sound effects tab)

The sounds in `shared/sounds` were generated with Stable Audio 3 Small SFX. The model is not shipped with Cupkata.

Powered by Stability AI.

This Stability AI Model is licensed under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights Reserved.

The license text is in `shared/sounds/LICENSE-Stability-AI.md`. Its T5Gemma text encoder falls under the
Gemma Terms of Use (`shared/sounds/LICENSE-Gemma.md`).
