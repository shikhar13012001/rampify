// ─── Message types ────────────────────────────────────────────────────────────

interface BlurMessage {
  type: 'blur';
  frames: ImageBitmap[];
  transitionSpeed: number;
  intensity: number;
}

type OutboundMsg =
  | { type: 'done'; result: ImageBitmap }
  | { type: 'error'; message: string };

// ─── Shader sources ───────────────────────────────────────────────────────────

const VERT_SRC = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTexCoord;
void main() {
  vTexCoord = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Texture unit dispatch via if-chain so sampler arrays can be indexed with
// non-constant (uniform-based) expressions across all WebGL2 implementations.
const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uFrames[8];
uniform int       uFrameCount;
uniform float     uWeights[8];
uniform float     uThreshold;

in  vec2 vTexCoord;
out vec4 fragColor;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 sampleFrame(int idx, vec2 uv) {
  if (idx == 0) return texture(uFrames[0], uv);
  if (idx == 1) return texture(uFrames[1], uv);
  if (idx == 2) return texture(uFrames[2], uv);
  if (idx == 3) return texture(uFrames[3], uv);
  if (idx == 4) return texture(uFrames[4], uv);
  if (idx == 5) return texture(uFrames[5], uv);
  if (idx == 6) return texture(uFrames[6], uv);
  return texture(uFrames[7], uv);
}

void main() {
  vec4 first = sampleFrame(0, vTexCoord);
  vec4 last  = sampleFrame(uFrameCount - 1, vTexCoord);

  // Skip blur on static backgrounds where luminance barely changes.
  float lumDelta = abs(luminance(first.rgb) - luminance(last.rgb));
  if (lumDelta < uThreshold) {
    fragColor = first;
    return;
  }

  vec4 blended = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uFrameCount) break;
    blended += uWeights[i] * sampleFrame(i, vTexCoord);
  }
  fragColor = blended;
}`;

// ─── WebGL helpers ────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('gl.createShader returned null');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram();
  if (!prog) throw new Error('gl.createProgram returned null');
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) ?? 'unknown';
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  return prog;
}

// ─── GL state (lazy init, reused across messages) ─────────────────────────────

interface GLState {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  frameLocs: (WebGLUniformLocation | null)[];
  frameCountLoc: WebGLUniformLocation | null;
  weightsLoc: WebGLUniformLocation | null;
  thresholdLoc: WebGLUniformLocation | null;
  textures: WebGLTexture[];
}

let state: GLState | null = null;

function getOrCreateState(frameWidth: number, frameHeight: number): GLState {
  const canvasW = frameWidth * 2;
  const canvasH = frameHeight * 2;

  if (state && state.canvas.width === canvasW && state.canvas.height === canvasH) {
    return state;
  }

  // Release old textures if canvas size changed.
  if (state) {
    state.textures.forEach(t => state!.gl.deleteTexture(t));
  }

  const canvas = new OffscreenCanvas(canvasW, canvasH);

  // Feature-detect WebGL2 — required for this worker.
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error(
      'WebGL2 is not available in this worker environment. ' +
      'Motion blur requires a browser that supports WebGL2 in OffscreenCanvas.',
    );
  }

  const program = createProgram(gl);
  gl.useProgram(program);

  // Full-screen quad (two triangles).
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
    gl.STATIC_DRAW,
  );
  const posLoc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Uniform locations.
  const frameLocs: (WebGLUniformLocation | null)[] = [];
  for (let i = 0; i < 8; i++) {
    frameLocs.push(gl.getUniformLocation(program, `uFrames[${i}]`));
  }
  // Bind each sampler uniform to its texture unit once — these never change.
  for (let i = 0; i < 8; i++) {
    gl.uniform1i(frameLocs[i], i);
  }

  const frameCountLoc = gl.getUniformLocation(program, 'uFrameCount');
  const weightsLoc    = gl.getUniformLocation(program, 'uWeights[0]');
  const thresholdLoc  = gl.getUniformLocation(program, 'uThreshold');

  // Pre-allocate 8 texture objects (one per possible frame slot).
  const textures: WebGLTexture[] = [];
  for (let i = 0; i < 8; i++) {
    const tex = gl.createTexture();
    if (!tex) throw new Error(`Failed to create texture slot ${i}`);
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textures.push(tex);
  }

  gl.viewport(0, 0, canvasW, canvasH);

  state = { canvas, gl, program, frameLocs, frameCountLoc, weightsLoc, thresholdLoc, textures };
  return state;
}

// ─── Weight computation ───────────────────────────────────────────────────────

/** Exponentially decreasing weights w[i] = exp(−i × 1.5), normalised to sum = 1. */
function computeWeights(n: number): Float32Array {
  const w = new Float32Array(8); // shader always reads 8 elements
  let sum = 0;
  for (let i = 0; i < n; i++) {
    w[i] = Math.exp(-i * 1.5);
    sum += w[i];
  }
  for (let i = 0; i < n; i++) {
    w[i] /= sum;
  }
  return w;
}

// ─── Core blur routine ────────────────────────────────────────────────────────

function applyMotionBlur(msg: BlurMessage): ImageBitmap {
  const { frames, intensity } = msg;
  const n = frames.length;

  if (n === 0) throw new Error('motionBlurWorker: no frames provided');
  if (n > 8)   throw new Error('motionBlurWorker: maximum 8 frames supported');

  const { width, height } = frames[0];
  const s = getOrCreateState(width, height);
  const { gl, program, frameCountLoc, weightsLoc, thresholdLoc, textures, canvas } = s;

  gl.useProgram(program);

  // Upload each frame to its texture unit and immediately close the bitmap.
  for (let i = 0; i < n; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, textures[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frames[i]);
    frames[i].close(); // free GPU-backed memory — caller must not use after this point
  }

  // Luminance threshold: higher intensity → lower threshold → more pixels blurred.
  const threshold = Math.max(0.02, 0.1 - intensity * 0.08);

  gl.uniform1i(frameCountLoc, n);
  gl.uniform1fv(weightsLoc, computeWeights(n));
  gl.uniform1f(thresholdLoc, threshold);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // transferToImageBitmap snapshots the current framebuffer contents.
  return canvas.transferToImageBitmap();
}

// ─── Worker message handler ───────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<BlurMessage>) => {
  if (e.data.type !== 'blur') return;

  try {
    const result = applyMotionBlur(e.data);
    // Transfer the bitmap so the main thread takes ownership without a copy.
    (self.postMessage as (msg: OutboundMsg, transfer: Transferable[]) => void)(
      { type: 'done', result },
      [result],
    );
  } catch (err) {
    (self.postMessage as (msg: OutboundMsg) => void)({ type: 'error', message: String(err) });
  }
};
