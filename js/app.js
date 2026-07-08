/* ============================================
   AEL Ωmega Particles v4 — WebGPU Engine
   Author: Ayman Elmasry
   ============================================ */
'use strict';

// ─── WGSL Shaders ────────────────────────────

const COMPUTE_SHADER = `
struct Particle {
  pos: vec3f,
  vel: vec3f,
  color: vec4f,
  life: f32,
  maxLife: f32,
  size: f32,
};

struct Uniforms {
  viewProj: mat4x4f,
  time: f32,
  deltaTime: f32,
  cursorX: f32,
  cursorY: f32,
  cursorZ: f32,
  pad0: f32,
  gravityStrength: f32,
  vortexStrength: f32,
  turbulenceStrength: f32,
  particleSize: f32,
  speedScale: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uni: Uniforms;

fn hash(i: u32) -> vec3f {
  let a = f32(i % 97u) / 97.0;
  let b = f32((i * 13u) % 101u) / 101.0;
  let c = f32((i * 7u) % 89u) / 89.0;
  return vec3f(a, b, c);
}

fn spawnSphere(i: u32) -> vec3f {
  let r = hash(i);
  let theta = r.x * 6.28318;
  let phi = acos(2.0 * r.y - 1.0);
  let rad = 3.0 + r.z * 2.0;
  return vec3f(
    sin(phi) * cos(theta) * rad,
    sin(phi) * sin(theta) * rad,
    cos(phi) * rad
  );
}

fn spawnCube(i: u32) -> vec3f {
  let r = hash(i);
  return (r - 0.5) * 8.0;
}

fn spawnRing(i: u32) -> vec3f {
  let r = hash(i);
  let angle = r.x * 6.28318;
  let rad = 4.0 + (r.y - 0.5) * 1.0;
  return vec3f(cos(angle) * rad, (r.z - 0.5) * 2.0, sin(angle) * rad);
}

fn spawnGalaxy(i: u32) -> vec3f {
  let r = hash(i);
  let arm = floor(r.x * 3.0);
  let t = r.y * 6.28318 + arm * 2.094;
  let dist = (r.z + 0.5) * 5.0;
  let spread = (1.0 - dist / 5.0) * 1.5;
  return vec3f(
    cos(t) * dist + (hash(i * 3u).x - 0.5) * spread,
    (hash(i * 5u).y - 0.5) * spread * 0.3,
    sin(t) * dist + (hash(i * 7u).z - 0.5) * spread
  );
}

fn spawnVelocity(i: u32) -> vec3f {
  let r = hash(i * 11u);
  return (r - 0.5) * 1.5;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let spawnType = u32(uni.cursorZ);

  var p = particles[i];

  if (p.life <= 0.0) {
    var sp: vec3f;
    if (spawnType == 0u) { sp = spawnSphere(i); }
    else if (spawnType == 1u) { sp = spawnCube(i); }
    else if (spawnType == 2u) { sp = spawnRing(i); }
    else { sp = spawnGalaxy(i); }
    p.pos = sp;
    p.vel = spawnVelocity(i);
    p.color = vec4f(
      0.5 + (hash(i * 17u).x - 0.5) * 0.5,
      0.5 + (hash(i * 19u).y - 0.5) * 0.5,
      0.8 + (hash(i * 23u).z - 0.5) * 0.2,
      1.0
    );
    p.life = 2.0 + hash(i * 29u).x * 4.0;
    p.maxLife = p.life;
    p.size = 0.05 + hash(i * 31u).x * 0.2;
    particles[i] = p;
    return;
  }

  let dt = uni.deltaTime * uni.speedScale;
  let cursor = vec3f(uni.cursorX, uni.cursorY, 0.0);
  let dir = cursor - p.pos;
  let dist = length(dir);
  let invDist = 1.0 / max(dist, 0.1);

  let gravForce = dir * invDist * uni.gravityStrength * 0.5;
  p.vel += gravForce * dt;

  if (uni.vortexStrength > 0.001) {
    let vz = dir.x * uni.vortexStrength * 0.3;
    let vx = -dir.z * uni.vortexStrength * 0.3;
    p.vel.x += vx * dt;
    p.vel.z += vz * dt;
  }

  if (uni.turbulenceStrength > 0.001) {
    let turb = uni.turbulenceStrength * 2.0;
    p.vel.x += sin(p.pos.y * 2.0 + uni.time * 1.3) * turb * dt;
    p.vel.y += cos(p.pos.x * 1.7 + uni.time * 1.1) * turb * dt;
    p.vel.z += sin(p.pos.z * 2.3 + uni.time * 0.9) * turb * dt;
  }

  p.vel *= 0.995;
  p.pos += p.vel * dt;
  p.life -= dt * 0.3;

  particles[i] = p;
}
`;

const RENDER_SHADER = `
struct Particle {
  pos: vec3f,
  vel: vec3f,
  color: vec4f,
  life: f32,
  maxLife: f32,
  size: f32,
};

struct Uniforms {
  viewProj: mat4x4f,
  time: f32,
  deltaTime: f32,
  cursorX: f32,
  cursorY: f32,
  cursorZ: f32,
  pad0: f32,
  gravityStrength: f32,
  vortexStrength: f32,
  turbulenceStrength: f32,
  particleSize: f32,
  speedScale: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uni: Uniforms;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vertex(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VOut {
  let quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );

  let p = particles[iid];
  let lifeRatio = p.life / max(p.maxLife, 0.001);

  if (lifeRatio <= 0.0) {
    var out: VOut;
    out.pos = vec4f(0.0, 0.0, 0.0, -1.0);
    out.color = vec4f(0.0);
    return out;
  }

  var clipPos = uni.viewProj * vec4f(p.pos, 1.0);
  let scale = p.size * uni.particleSize * 0.008;
  clipPos.xy += quad[vid] * scale * clipPos.w;

  let fadeIn = smoothstep(0.0, 0.2, lifeRatio);
  let fadeOut = smoothstep(1.0, 0.7, lifeRatio);
  let alpha = p.color.a * fadeIn * fadeOut;

  var out: VOut;
  out.pos = clipPos;
  out.color = vec4f(p.color.rgb, alpha);
  return out;
}

@fragment
fn fragment(in: VOut) -> @location(0) vec4f {
  if (in.color.a <= 0.001) { discard; }

  let coord = in.pos.xy;
  let center = vec2f(0.0, 0.0);
  let dist = length(coord - center);

  let core = exp(-dist * dist * 8.0);
  let glow = exp(-dist * dist * 2.0);
  let intensity = mix(glow, core, 0.6);

  return vec4f(in.color.rgb * intensity, in.color.a * intensity);
}
`;

// ─── Mat4 Helpers ────────────────────────────

const mat4 = {
  identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  perspective(fov, aspect, near, far) {
    const m = new Float32Array(16);
    const f = 1.0 / Math.tan(fov / 2);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  },

  lookAt(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    const zLen = Math.sqrt(zx * zx + zy * zy + zz * zz);
    zx /= zLen; zy /= zLen; zz /= zLen;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    const xLen = Math.sqrt(xx * xx + xy * xy + xz * xz);
    xx /= xLen; xy /= xLen; xz /= xLen;

    let yx = zy * xz - zz * xy;
    let yy = zz * xx - zx * xz;
    let yz = zx * xy - zy * xx;

    const m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
    m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
    m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  },

  multiply(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        out[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1]
                       + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
      }
    }
    return out;
  }
};

// ─── Orbit Camera ────────────────────────────

class OrbitCamera {
  constructor() {
    this.theta = 0;
    this.phi = Math.PI / 3;
    this.radius = 12;
    this.target = [0, 0, 0];
    this.autoRotate = true;
    this.rotSpeed = 0.15;

    this._isDragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._thetaTarget = this.theta;
    this._phiTarget = this.phi;
    this._radiusTarget = this.radius;
  }

  attach(canvas) {
    const onDown = (x, y) => {
      this._isDragging = true;
      this._lastX = x;
      this._lastY = y;
    };

    const onMove = (x, y) => {
      if (!this._isDragging) return;
      const dx = x - this._lastX;
      const dy = y - this._lastY;
      this._lastX = x;
      this._lastY = y;
      if (this.autoRotate) this.autoRotate = false;
      this._thetaTarget += dx * 0.01;
      this._phiTarget = Math.max(0.05, Math.min(Math.PI - 0.05, this._phiTarget - dy * 0.01));
    };

    const onUp = () => { this._isDragging = false; };

    canvas.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onUp);

    canvas.addEventListener('touchstart', e => {
      const t = e.touches[0];
      onDown(t.clientX, t.clientY);
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: true });

    canvas.addEventListener('touchend', onUp, { passive: true });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this._radiusTarget = Math.max(3, Math.min(40, this._radiusTarget + e.deltaY * 0.02));
    }, { passive: false });
  }

  update(dt) {
    if (this.autoRotate) {
      this._thetaTarget += this.rotSpeed * dt;
    }
    this.theta += (this._thetaTarget - this.theta) * 0.12;
    this.phi += (this._phiTarget - this.phi) * 0.12;
    this.radius += (this._radiusTarget - this.radius) * 0.12;
  }

  getViewMatrix() {
    const eye = [
      this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * Math.sin(this.phi) * Math.cos(this.theta)
    ];
    return mat4.lookAt(eye, this.target, [0, 1, 0]);
  }

  getViewProj(aspect) {
    const proj = mat4.perspective(Math.PI / 4, aspect, 0.1, 100);
    const view = this.getViewMatrix();
    return mat4.multiply(proj, view);
  }
}

// ─── Audio Input ─────────────────────────────

class AudioInput {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.active = false;
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this.active = true;
    } catch {
      this.active = false;
    }
  }

  stop() {
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.analyser = null;
    this.active = false;
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
  }

  tick() {
    if (!this.active || !this.analyser) return;
    this.analyser.getByteFrequencyData(this.data);
    const len = this.data.length;
    let b = 0, m = 0, t = 0;
    const third = Math.floor(len / 3);
    for (let i = 0; i < len; i++) {
      const v = this.data[i] / 255;
      if (i < third) b += v;
      else if (i < third * 2) m += v;
      else t += v;
    }
    const inv = 1 / third;
    this.bass = b * inv;
    this.mid = m * inv;
    this.treble = t * inv;
  }
}

// ─── Color Themes ────────────────────────────

const COLOR_THEMES = {
  neon:    { r: [0.0, 0.0], g: [0.46, 0.9], b: [1.0, 1.0] },
  fire:    { r: [1.0, 1.0], g: [0.27, 0.84], b: [0.0, 0.0] },
  aurora:  { r: [0.0, 0.48], g: [1.0, 0.41], b: [0.53, 0.93] },
  sunset:  { r: [1.0, 1.0], g: [0.08, 0.55], b: [0.57, 0.0] },
  ice:     { r: [0.88, 0.25], g: [1.0, 0.41], b: [1.0, 0.88] },
  lava:    { r: [1.0, 1.0], g: [0.0, 0.65], b: [0.0, 0.0] },
};

// ─── Main Engine ─────────────────────────────

class OmegaParticleEngine {
  constructor() {
    this.canvas = document.getElementById('particleCanvas');
    this.ctx = null;
    this.device = null;
    this.format = 'bgra8unorm';

    this.particleCount = 50000;
    this.maxParticles = 100000;
    this.particleData = null;
    this.vertexBuffer = null;
    this.uniformBuffer = null;
    this.uniformData = new Float32Array(32);

    this.bindGroupCompute = null;
    this.bindGroupRender = null;
    this.computePipeline = null;
    this.renderPipeline = null;
    this.computeBindLayout = null;
    this.renderBindLayout = null;

    this.camera = new OrbitCamera();
    this.audio = new AudioInput();
    this.theme = 'neon';
    this.spawnShape = 0;

    this.frameTime = 0;
    this.deltaTime = 0;
    this.lastFrame = 0;
    this.fps = 0;
    this.fpsAccum = 0;
    this.fpsCount = 0;

    this.cursorX = 0;
    this.cursorY = 0;

    this.running = false;
  }

  async init() {
    const loadingEl = document.getElementById('loadingOverlay');
    const fallbackEl = document.getElementById('fallbackMessage');

    if (!navigator.gpu) {
      loadingEl.hidden = true;
      fallbackEl.hidden = false;
      return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      loadingEl.hidden = true;
      fallbackEl.hidden = false;
      return;
    }

    this.device = await adapter.requestDevice();
    this.ctx = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;

    this.ctx.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    this.camera.attach(this.canvas);

    this.canvas.addEventListener('mousemove', e => {
      this.cursorX = (e.clientX / this.canvas.clientWidth) * 2 - 1;
      this.cursorY = -(e.clientY / this.canvas.clientHeight) * 2 + 1;
    });

    this.canvas.addEventListener('touchmove', e => {
      const t = e.touches[0];
      this.cursorX = (t.clientX / this.canvas.clientWidth) * 2 - 1;
      this.cursorY = -(t.clientY / this.canvas.clientHeight) * 2 + 1;
    }, { passive: true });

    await this.initShaders();
    this.initBuffers();
    this.initBindGroups();

    loadingEl.classList.add('hidden');
    setTimeout(() => { loadingEl.hidden = true; }, 600);

    this.running = true;
    this.lastFrame = performance.now();
    this.frame();
  }

  async initShaders() {
    const computeModule = this.device.createShaderModule({ code: COMPUTE_SHADER });
    const renderModule = this.device.createShaderModule({ code: RENDER_SHADER });

    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'main' },
    });

    const vertexState = {
      module: renderModule,
      entryPoint: 'vertex',
    };

    const fragmentState = {
      module: renderModule,
      entryPoint: 'fragment',
      targets: [{ format: this.format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      }}],
    };

    this.renderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: vertexState,
      fragment: fragmentState,
      primitive: { topology: 'triangle-list' },
    });

    this.computeBindLayout = this.computePipeline.getBindGroupLayout(0);
    this.renderBindLayout = this.renderPipeline.getBindGroupLayout(0);
  }

  initBuffers() {
    this.createParticleBuffer(this.particleCount);
    this.createUniformBuffer();
  }

  createParticleBuffer(count) {
    const floatsPerParticle = 16;
    const totalFloats = this.maxParticles * floatsPerParticle;
    const data = new Float32Array(totalFloats);

    for (let i = 0; i < this.maxParticles; i++) {
      const base = i * floatsPerParticle;
      const h1 = (i * 7) % 97, h2 = (i * 13) % 101, h3 = (i * 17) % 89;
      const r1 = h1 / 97, r2 = h2 / 101, r3 = h3 / 89;

      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);
      const rad = 3 + r3 * 2;

      data[base] = Math.sin(phi) * Math.cos(theta) * rad;
      data[base + 1] = Math.sin(phi) * Math.sin(theta) * rad;
      data[base + 2] = Math.cos(phi) * rad;
      data[base + 4] = (r1 - 0.5) * 1.5;
      data[base + 5] = (r2 - 0.5) * 1.5;
      data[base + 6] = (r3 - 0.5) * 1.5;
      data[base + 8] = 0.5 + (r1 - 0.5) * 0.5;
      data[base + 9] = 0.5 + (r2 - 0.5) * 0.5;
      data[base + 10] = 0.8 + (r3 - 0.5) * 0.2;
      data[base + 11] = 1.0;
      data[base + 12] = 2 + r1 * 4;
      data[base + 13] = data[base + 12];
      data[base + 14] = 0.05 + r2 * 0.2;
    }

    this.particleData = data;

    if (this.particleBuffer) this.particleBuffer.destroy();
    this.particleBuffer = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(this.particleBuffer, 0, data);
  }

  createUniformBuffer() {
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    this.uniformBuffer = this.device.createBuffer({
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  initBindGroups() {
    this.bindGroupCompute = this.device.createBindGroup({
      layout: this.computeBindLayout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.uniformBuffer } },
      ],
    });

    this.bindGroupRender = this.device.createBindGroup({
      layout: this.renderBindLayout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  updateUniforms() {
    const aspect = this.canvas.width / this.canvas.height || 1;
    const vp = this.camera.getViewProj(aspect);

    const u = this.uniformData;
    u.set(vp, 0);
    u[16] = this.frameTime;
    u[17] = Math.min(this.deltaTime, 0.05);
    u[18] = this.cursorX;
    u[19] = this.cursorY;
    u[20] = this.spawnShape;
    u[22] = this.params.gravity;
    u[23] = this.params.vortex;
    u[24] = this.params.turbulence;
    u[25] = this.params.particleSize;
    u[26] = this.params.speed;

    this.device.queue.writeBuffer(this.uniformBuffer, 0, u);
  }

  resize() {
    const w = this.canvas.clientWidth * devicePixelRatio;
    const h = this.canvas.clientHeight * devicePixelRatio;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'premultiplied',
      });
    }
  }

  frame() {
    if (!this.running) return;

    const now = performance.now();
    this.deltaTime = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.frameTime += this.deltaTime;

    this.fpsAccum += this.deltaTime;
    this.fpsCount++;
    if (this.fpsAccum >= 1) {
      this.fps = Math.round(this.fpsCount / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsCount = 0;
    }

    this.resize();
    this.camera.update(this.deltaTime);

    if (this.audio.active) {
      this.audio.tick();
      this.params.particleSize = this.params._baseParticleSize + this.audio.bass * 8;
      this.params.speed = this.params._baseSpeed + this.audio.mid * 0.8;
    }

    this.updateUniforms();
    this.render();
    requestAnimationFrame(() => this.frame());
  }

  render() {
    const commandEncoder = this.device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.bindGroupCompute);
    computePass.dispatchWorkgroups(Math.ceil(this.maxParticles / 64));
    computePass.end();

    const texture = this.ctx.getCurrentTexture();
    const view = texture.createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: [0.012, 0.02, 0.04, 1],
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.bindGroupRender);
    renderPass.draw(6, this.particleCount, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    document.getElementById('statCount').textContent =
      (this.particleCount >= 1000 ? (this.particleCount / 1000).toFixed(1) + 'K' : this.particleCount);
    document.getElementById('statFps').textContent = this.fps + ' FPS';
  }

  setParticleCount(n) {
    this.particleCount = Math.min(n, this.maxParticles);
  }

  setTheme(name) {
    this.theme = name;
  }

  setSpawnShape(idx) {
    this.spawnShape = idx;
  }

  destroy() {
    this.running = false;
    this.audio.stop();
    if (this.particleBuffer) this.particleBuffer.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    if (this.device) this.device.destroy();
  }
}

// ─── Panel Controller ────────────────────────

class PanelController {
  constructor(engine) {
    this.engine = engine;
    this.panel = document.getElementById('controlPanel');
    this.toggle = document.getElementById('controlsToggle');
    this.close = document.getElementById('panelClose');

    engine.params = {
      gravity: 0.2,
      vortex: 0,
      turbulence: 0.15,
      particleSize: 1.0,
      speed: 1.0,
      _baseParticleSize: 1.0,
      _baseSpeed: 1.0,
    };

    this.bind();
  }

  bind() {
    this.toggle.addEventListener('click', () => this.togglePanel());
    this.close.addEventListener('click', () => this.closePanel());

    this.bindSlider('particleCount', v => {
      const n = Math.round(v * 1000);
      this.engine.setParticleCount(n);
      document.getElementById('particleCountVal').textContent =
        (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n);
    }, 50);

    this.bindSlider('speedScale', v => {
      const val = v / 100;
      this.engine.params.speed = val;
      this.engine.params._baseSpeed = val;
      document.getElementById('speedScaleVal').textContent = val.toFixed(1) + 'x';
    }, 100);

    this.bindSlider('particleSize', v => {
      const val = Math.max(0.1, v / 8);
      this.engine.params.particleSize = val;
      this.engine.params._baseParticleSize = val;
      document.getElementById('particleSizeVal').textContent = v;
    }, 8);

    this.bindSlider('gravityStrength', v => {
      const val = v / 100;
      this.engine.params.gravity = val;
      document.getElementById('gravityStrengthVal').textContent = val.toFixed(2);
    }, 20);

    this.bindSlider('vortexStrength', v => {
      const val = v / 100;
      this.engine.params.vortex = val;
      document.getElementById('vortexStrengthVal').textContent = val.toFixed(2);
    }, 0);

    this.bindSlider('turbulenceStrength', v => {
      const val = v / 100;
      this.engine.params.turbulence = val;
      document.getElementById('turbulenceStrengthVal').textContent = val.toFixed(2);
    }, 15);

    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.engine.setTheme(btn.dataset.theme);
      });
    });

    document.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const shapes = { sphere: 0, cube: 1, ring: 2, galaxy: 3 };
        this.engine.setSpawnShape(shapes[btn.dataset.shape]);
      });
    });

    const audioToggle = document.getElementById('audioToggle');
    audioToggle.addEventListener('click', async () => {
      const active = audioToggle.dataset.active === 'true';
      if (active) {
        this.engine.audio.stop();
        audioToggle.dataset.active = 'false';
        audioToggle.classList.remove('active');
        audioToggle.querySelector('.toggle-label').textContent = 'Off';
      } else {
        await this.engine.audio.start();
        audioToggle.dataset.active = this.engine.audio.active ? 'true' : 'false';
        if (this.engine.audio.active) {
          audioToggle.classList.add('active');
          audioToggle.querySelector('.toggle-label').textContent = 'On';
        }
      }
    });

    const autoRotateToggle = document.getElementById('autoRotateToggle');
    autoRotateToggle.addEventListener('click', () => {
      const active = autoRotateToggle.dataset.active === 'true';
      this.engine.camera.autoRotate = !active;
      autoRotateToggle.dataset.active = String(!active);
      autoRotateToggle.classList.toggle('active');
      autoRotateToggle.querySelector('.toggle-label').textContent = active ? 'Off' : 'On';
    });

    document.getElementById('exportBtn').addEventListener('click', () => this.exportFrame());
  }

  bindSlider(id, onChange, defaultValue) {
    const input = document.getElementById(id);
    input.addEventListener('input', () => onChange(parseFloat(input.value)));
    onChange(defaultValue);
  }

  togglePanel() {
    this.panel.classList.toggle('open');
    this.toggle.classList.toggle('panel-open');
  }

  closePanel() {
    this.panel.classList.remove('open');
    this.toggle.classList.remove('panel-open');
  }

  exportFrame() {
    const canvas = this.engine.canvas;
    const link = document.createElement('a');
    link.download = `omega-particles-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}

// ─── Init ────────────────────────────────────

async function main() {
  const engine = new OmegaParticleEngine();
  await engine.init();
  if (engine.device) {
    new PanelController(engine);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
