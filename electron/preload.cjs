const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Dropped files are read here, in the preload's own world: passing File objects through the
// contextBridge hung or crashed the renderer. Only the probe results cross over to the page.
let dropListener = null;
window.addEventListener(
  'drop',
  (e) => {
    const zone = e.target instanceof Element ? e.target.closest('[data-file-drop]') : null;
    const files = e.dataTransfer?.files;
    if (!zone || !files?.length || !dropListener) return;
    const paths = Array.from(files, (f) => {
      try {
        return webUtils.getPathForFile(f);
      } catch {
        return '';
      }
    }).filter(Boolean);
    if (!paths.length) return;
    dropListener.start();
    ipcRenderer.invoke('media:probe', paths).then(
      (results) => dropListener?.done(results),
      (err) => dropListener?.done([{ path: '', name: 'Fichiers déposés', error: String(err?.message || err) }]),
    );
  },
  true,
);

contextBridge.exposeInMainWorld('cupkata', {
  importMedia: () => ipcRenderer.invoke('media:import'),
  onFilesDropped: (start, done) => {
    dropListener = { start, done };
    return () => {
      dropListener = null;
    };
  },
  chooseExportPath: () => ipcRenderer.invoke('export:choose'),
  runExport: (project, outPath, token) => ipcRenderer.invoke('export:run', project, outPath, token),
  prepareExport: () => ipcRenderer.invoke('export:prepare'),
  exportFrame: (token, seq, frame, bytes) => ipcRenderer.invoke('export:frame', token, seq, frame, bytes),
  discardExport: (token) => ipcRenderer.invoke('export:discard', token),
  gpuPlan: (project, token) => ipcRenderer.invoke('gpu:plan', project, token),
  exportBase: (project, token) => ipcRenderer.invoke('export:base', project, token),
  exportLuts: (token, luts) => ipcRenderer.invoke('export:luts', token, luts),
  importFilter: () => ipcRenderer.invoke('filters:import'),
  fxPlan: (token, items, format) => ipcRenderer.invoke('fx:plan', token, items, format),
  gpuStart: (jobId) => ipcRenderer.invoke('gpu:start', jobId),
  gpuRead: (jobId) => ipcRenderer.invoke('gpu:read', jobId),
  gpuWrite: (jobId, bytes) => ipcRenderer.invoke('gpu:write', jobId, bytes),
  gpuFinish: (jobId) => ipcRenderer.invoke('gpu:finish', jobId),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  showInFolder: (p) => ipcRenderer.invoke('shell:show', p),
  saveProject: (data, filePath) => ipcRenderer.invoke('project:save', data, filePath),
  openProject: () => ipcRenderer.invoke('project:open'),
  autosave: (payload) => ipcRenderer.invoke('project:autosave', payload),
  recoverAutosave: () => ipcRenderer.invoke('project:recover'),
  setDirty: (dirty) => ipcRenderer.invoke('project:dirty', !!dirty),
  confirm: (message) => ipcRenderer.invoke('dialog:confirm', message),
  relinkMedia: () => ipcRenderer.invoke('media:relink'),
  getPeaks: (filePath) => ipcRenderer.invoke('media:peaks', filePath),
  saveVoice: (bytes) => ipcRenderer.invoke('voice:save', bytes),
  searchMusic: (request) => ipcRenderer.invoke('music:search', request),
  downloadMusic: (id) => ipcRenderer.invoke('music:download', id),
  openMusicPage: (id) => ipcRenderer.invoke('music:page', id),
  scanLibrary: (pick) => ipcRenderer.invoke('library:scan', !!pick),
  importLibrary: (paths) => ipcRenderer.invoke('library:import', paths),
  generateMusic: (request) => ipcRenderer.invoke('music:generate', request),
  cancelMusic: () => ipcRenderer.invoke('music:cancel'),
  onMusicProgress: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('music:progress', handler);
    return () => ipcRenderer.removeListener('music:progress', handler);
  },
  aiCutout: (request) => ipcRenderer.invoke('ai:cutout', request),
  aiSilences: (request) => ipcRenderer.invoke('ai:silences', request),
  aiTranslate: (request) => ipcRenderer.invoke('ai:translate', request),
  aiSpeak: (request) => ipcRenderer.invoke('ai:speak', request),
  aiCancel: () => ipcRenderer.invoke('ai:cancel'),
  onAiProgress: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('ai:progress', handler);
    return () => ipcRenderer.removeListener('ai:progress', handler);
  },
  saveSnapshot: (bytes) => ipcRenderer.invoke('snapshot:save', bytes),
  freezeFrame: (filePath, time) => ipcRenderer.invoke('media:freeze', filePath, time),
  reverseMedia: (filePath, start, span) => ipcRenderer.invoke('media:reverse', filePath, start, span),
  transcribe: (request) => ipcRenderer.invoke('subtitles:run', request),
  cancelTranscription: () => ipcRenderer.invoke('subtitles:cancel'),
  onTranscriptionProgress: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('subtitles:progress', handler);
    return () => ipcRenderer.removeListener('subtitles:progress', handler);
  },
  onExportProgress: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },
  mediaUrl: (p) => 'cupkata-media://file/' + encodeURIComponent(p),
  probeMedia: (paths) => ipcRenderer.invoke('media:probe', paths),
  controlStatus: () => ipcRenderer.invoke('control:status'),
  controlSet: (on) => ipcRenderer.invoke('control:set', !!on),
  controlOpenProject: (filePath) => ipcRenderer.invoke('control:open-project', filePath),
  controlCheckTarget: (filePath, extension, overwrite) => ipcRenderer.invoke('control:check-target', filePath, extension, !!overwrite),
  controlRespond: (response) => ipcRenderer.send('control:response', response),
  onControlRequest: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('control:request', handler);
    return () => ipcRenderer.removeListener('control:request', handler);
  },
  onControlStatus: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('control:status', handler);
    return () => ipcRenderer.removeListener('control:status', handler);
  },
});
