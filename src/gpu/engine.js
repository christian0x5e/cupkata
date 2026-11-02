import { HEADER, SHADERS } from './shaders.js';

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
uniform float uFlip;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos.x, aPos.y * uFlip, 0.0, 1.0);
}`;

export const GPU_EFFECTS = new Set(Object.keys(SHADERS));

// Colour filter: look the colour up in a 3D table (trilinear, like FFmpeg's lut3d) and blend by amount.
const LUT_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform sampler3D uLut;
uniform float uSize;
uniform float uAmount;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  vec3 coord = c * (uSize - 1.0) / uSize + 0.5 / uSize;
  vec3 g = texture(uLut, coord).rgb;
  outColor = vec4(mix(c, g, uAmount), 1.0);
}`;

// One WebGL2 context per output size. It takes a picture (a canvas, or raw RGBA bytes for the
// export), runs an effect shader over it, and returns the result as a canvas or as RGBA bytes.
class GpuEngine {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 indisponible : les effets GPU ne peuvent pas fonctionner sur cet ordinateur.');
    this.gl = gl;
    this.programs = new Map();
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  program(effect) {
    if (this.programs.has(effect)) return this.programs.get(effect);
    const gl = this.gl;
    const compile = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Effet ${effect} : ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, effect === '__lut' ? LUT_FRAGMENT : HEADER + SHADERS[effect]));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Effet ${effect} : ${gl.getProgramInfoLog(p)}`);
    const u = (name) => gl.getUniformLocation(p, name);
    const entry = {
      p, uTex: u('uTex'), uRes: u('uRes'), uTime: u('uTime'), uAmount: u('uAmount'), uFlip: u('uFlip'),
      uLut: u('uLut'), uSize: u('uSize'),
    };
    this.programs.set(effect, entry);
    return entry;
  }

  // flip = true renders upside down so readPixels() returns rows top-first, like the decoded frames.
  draw(effect, source, time, amount, flip) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (source instanceof Uint8Array) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    const prog = this.program(effect);
    gl.viewport(0, 0, width, height);
    gl.useProgram(prog.p);
    gl.uniform1i(prog.uTex, 0);
    gl.uniform2f(prog.uRes, width, height);
    gl.uniform1f(prog.uTime, time);
    gl.uniform1f(prog.uAmount, amount);
    gl.uniform1f(prog.uFlip, flip ? -1 : 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  lutTexture(key, data, size) {
    this.luts ??= new Map();
    if (this.luts.has(key)) return this.luts.get(key);
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, size, size, size, 0, gl.RGB, gl.FLOAT, data instanceof Float32Array ? data : new Float32Array(data));
    gl.activeTexture(gl.TEXTURE0);
    this.luts.set(key, tex);
    return tex;
  }

  // Applies a colour filter (3D LUT) to a canvas and returns this engine's canvas.
  renderLut(source, key, data, size, amount) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    const lut = this.lutTexture(key, data, size);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lut);
    const prog = this.program('__lut');
    gl.viewport(0, 0, width, height);
    gl.useProgram(prog.p);
    gl.uniform1i(prog.uTex, 0);
    gl.uniform1i(prog.uLut, 1);
    gl.uniform1f(prog.uSize, size);
    gl.uniform1f(prog.uAmount, amount);
    gl.uniform1f(prog.uFlip, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    return this.canvas;
  }

  renderCanvas(effect, source, time, amount) {
    this.draw(effect, source, time, amount, false);
    return this.canvas;
  }

  renderBytes(effect, bytes, time, amount) {
    this.draw(effect, bytes, time, amount, true);
    const out = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    this.gl.readPixels(0, 0, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out);
    return out;
  }
}

const engines = new Map();
export function gpuEngine(width, height, purpose = 'preview') {
  const key = `${purpose}:${width}x${height}`;
  if (!engines.has(key)) engines.set(key, new GpuEngine(width, height));
  return engines.get(key);
}
