// Picks the graphics card's encoder for a video format when it works, the processor's otherwise.
const { T } = require('./i18n.cjs');
const { spawn } = require('child_process');

const CODECS = {
  h264: { hardware: ['h264_nvenc', 'h264_amf', 'h264_qsv'], software: 'libx264' },
  hevc: { hardware: ['hevc_nvenc', 'hevc_amf', 'hevc_qsv'], software: 'libx265' },
  av1: { hardware: ['av1_nvenc', 'av1_amf', 'av1_qsv'], software: 'libaom-av1' },
};
const softwareOf = (encoder) => Object.values(CODECS).find((c) => c.hardware.includes(encoder) || c.software === encoder)?.software ?? 'libx264';

// Settings measured on a 4K source for the same SSIM as x264 at CRF 20.
const CONSTANT_QUALITY = {
  h264_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '22', '-b:v', '0', '-spatial-aq', '1', '-bf', '3'],
  h264_amf: ['-quality', 'quality', '-rc', 'qvbr', '-qvbr_quality_level', '22', '-b:v', '60M'],
  h264_qsv: ['-preset', 'medium', '-global_quality', '22'],
  libx264: ['-preset', 'veryfast', '-crf', '20'],
  // H.265 and AV1: same SSIM as h264_nvenc on a test picture for NVIDIA; the others are not measured.
  hevc_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '26', '-b:v', '0', '-spatial-aq', '1', '-bf', '3'],
  hevc_amf: ['-quality', 'quality', '-rc', 'qvbr', '-qvbr_quality_level', '26', '-b:v', '60M'],
  hevc_qsv: ['-preset', 'medium', '-global_quality', '26'],
  libx265: ['-preset', 'fast', '-crf', '24', '-x265-params', 'log-level=error'],
  av1_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '32', '-b:v', '0', '-spatial-aq', '1', '-bf', '3'],
  av1_amf: ['-quality', 'quality', '-rc', 'qvbr', '-qvbr_quality_level', '32', '-b:v', '60M'],
  av1_qsv: ['-preset', 'medium', '-global_quality', '32'],
  'libaom-av1': ['-crf', '30', '-b:v', '0', '-cpu-used', '6', '-row-mt', '1'],
};
const TARGET_RATE = {
  h264_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr'], h264_amf: ['-quality', 'quality', '-rc', 'vbr_peak'], h264_qsv: ['-preset', 'medium'], libx264: ['-preset', 'veryfast'],
  hevc_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr'], hevc_amf: ['-quality', 'quality', '-rc', 'vbr_peak'], hevc_qsv: ['-preset', 'medium'], libx265: ['-preset', 'fast', '-x265-params', 'log-level=error'],
  av1_nvenc: ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr'], av1_amf: ['-quality', 'quality', '-rc', 'vbr_peak'], av1_qsv: ['-preset', 'medium'], 'libaom-av1': ['-cpu-used', '6', '-row-mt', '1'],
};
// A nearly lossless step before the final encode.
const INTERMEDIATE = {
  h264_nvenc: ['-preset', 'p1', '-rc', 'constqp', '-qp', '14', '-bf', '0'],
  h264_amf: ['-quality', 'speed', '-rc', 'cqp', '-qp_i', '14', '-qp_p', '14'],
  h264_qsv: ['-preset', 'veryfast', '-global_quality', '14'],
  libx264: ['-preset', 'ultrafast', '-crf', '10'],
};
// The preview's light copy: quick to make, every half second can be reached at once.
const PROXY = {
  h264_nvenc: ['-preset', 'p3', '-rc', 'vbr', '-cq', '26', '-b:v', '0', '-bf', '0', '-g', '15'],
  h264_amf: ['-quality', 'speed', '-rc', 'qvbr', '-qvbr_quality_level', '26', '-b:v', '10M', '-g', '15'],
  h264_qsv: ['-preset', 'veryfast', '-global_quality', '26', '-g', '15'],
  libx264: ['-preset', 'ultrafast', '-crf', '24', '-bf', '0', '-g', '15'],
};

// Apple's players only open H.265 in an MP4 with this tag.
const formatTag = (encoder) => (softwareOf(encoder) === 'libx265' ? ['-tag:v', 'hvc1'] : []);
const finalArgs = (encoder, videoKbps = 0) => [
  ...(videoKbps
    ? [...TARGET_RATE[encoder], '-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.5)}k`, '-bufsize', `${videoKbps * 2}k`]
    : CONSTANT_QUALITY[encoder]),
  ...formatTag(encoder),
];
const intermediateArgs = (encoder) => INTERMEDIATE[encoder];
const proxyArgs = (encoder) => PROXY[encoder];

function works(ffmpegPath, encoder) {
  return new Promise((resolve) => {
    const proc = spawn(
      ffmpegPath,
      ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30:d=0.2', '-pix_fmt', 'yuv420p', '-c:v', encoder, ...CONSTANT_QUALITY[encoder], '-f', 'null', '-'],
      { windowsHide: true, stdio: 'ignore' },
    );
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

const found = new Map();
let hardwareAllowed = true;
const setHardwareEncoding = (allowed) => {
  hardwareAllowed = allowed !== false;
};

function detectEncoder(ffmpegPath, codec = 'h264') {
  const { hardware, software } = CODECS[codec] ?? CODECS.h264;
  if (!hardwareAllowed) return Promise.resolve(software);
  if (!found.has(software)) {
    found.set(software, (async () => {
      for (const encoder of hardware) if (await works(ffmpegPath, encoder)) return encoder;
      return software;
    })());
  }
  return found.get(software);
}

// The graphics card first; if it refuses this job (too big, driver…) the processor takes over.
async function withFallback(encoder, run, finalEncoder = encoder) {
  try {
    return await run(encoder, finalEncoder);
  } catch (err) {
    const bothSoftware = encoder === softwareOf(encoder) && finalEncoder === softwareOf(finalEncoder);
    if (bothSoftware || err.message === T('Export annulé')) throw err;
    return run(softwareOf(encoder), softwareOf(finalEncoder));
  }
}

module.exports = { detectEncoder, setHardwareEncoding, finalArgs, intermediateArgs, proxyArgs, withFallback };
