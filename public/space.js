// Living orbital field: glowing lines, star nodes, cursor lensing and the transition warp.
// Canvas 2D with a gaussian glow pass; one render() per frame, driven by app.js.

const TAU = Math.PI * 2;
const CHUNKS = 18; // brightness samples per curve: gradient stops and node search

// One galaxy per screen. x/y are viewport fractions, orbit radii are in units of (W + H) / 2.
// o: [cx, cy, rx, ry, rotation]   f: control points of a flowing strand   w: brightness
// stars ride along curves: [curve, u, speed, size]   glow: fixed hot spots [x, y, size]
const GALAXIES = [
  {
    curves: [
      { f: [[-0.12, 0.98], [0.22, 0.82], [0.5, 0.64], [0.69, 0.55], [0.86, 0.4], [1.12, 0.16]], w: 1 },
      { f: [[0.18, 1.12], [0.4, 0.84], [0.6, 0.62], [0.69, 0.55], [0.82, 0.53], [1.12, 0.47]], w: 0.7 },
      { f: [[0.44, -0.12], [0.52, 0.2], [0.61, 0.44], [0.69, 0.55], [0.88, 0.64], [1.12, 0.74]], w: 0.55 },
      { f: [[-0.12, 0.62], [0.24, 0.63], [0.5, 0.59], [0.69, 0.55], [0.87, 0.33], [1.06, 0.02]], w: 0.75 },
      { f: [[0.3, -0.12], [0.42, 0.24], [0.57, 0.48], [0.7, 0.56], [0.78, 0.76], [0.86, 1.12]], w: 0.42 },
      { f: [[1.12, 0.34], [0.9, 0.47], [0.76, 0.53], [0.68, 0.56], [0.46, 0.73], [0.08, 1.12]], w: 0.5 },
      { f: [[-0.12, 0.28], [0.2, 0.4], [0.46, 0.51], [0.69, 0.55], [0.82, 0.6], [1.12, 0.86]], w: 0.32 },
      { f: [[0.56, -0.12], [0.62, 0.14], [0.73, 0.34], [0.95, 0.41], [1.12, 0.44]], w: 0.26 },
      { o: [0.78, 0.52, 0.5, 0.17, -0.38], w: 0.2 },
      { o: [0.2, 0.15, 0.45, 0.12, 0.25], w: 0.14 },
    ],
    stars: [[0, 0.3, 0.011, 1.1], [1, 0.75, 0.009, 0.8], [3, 0.15, 0.013, 0.9], [5, 0.8, 0.01, 0.7], [8, 0.2, 0.006, 1.1]],
    glow: [[0.69, 0.55, 1.6]],
  },
  {
    curves: [
      { o: [0.55, 0.57, 0.62, 0.19, -0.16], w: 0.95 },
      { o: [0.6, 0.4, 0.66, 0.27, -0.3], w: 0.5 },
      { o: [0.62, 0.3, 0.38, 0.14, 0.22], w: 0.35 },
      { f: [[0.22, -0.12], [0.33, 0.16], [0.5, 0.22], [0.75, 0.17], [1.12, 0.3]], w: 0.45 },
      { f: [[-0.12, 0.86], [0.25, 0.9], [0.6, 0.95], [1.12, 0.82]], w: 0.3 },
      { o: [0.36, 0.62, 0.3, 0.1, 0.12], w: 0.22 },
    ],
    stars: [[0, 0.1, 0.008, 1.2], [0, 0.45, 0.008, 0.9], [0, 0.7, 0.008, 1], [1, 0.3, 0.006, 1.1], [1, 0.62, 0.006, 0.8], [3, 0.4, 0.01, 0.9]],
    glow: [],
  },
  {
    curves: [
      { o: [0.64, 0.36, 0.72, 0.33, -0.34], w: 0.95 },
      { f: [[-0.12, 0.54], [0.12, 0.64], [0.31, 0.77], [0.55, 0.9], [0.78, 1.12]], w: 0.75 },
      { o: [0.78, 0.1, 0.55, 0.2, -0.18], w: 0.6 },
      { o: [0.26, 0.3, 0.34, 0.24, 0.42], w: 0.3 },
      { f: [[0.58, 1.12], [0.74, 0.8], [0.93, 0.52], [1.12, 0.42]], w: 0.45 },
      { f: [[0.08, -0.12], [0.25, 0.1], [0.45, 0.2], [0.8, 0.12], [1.12, -0.02]], w: 0.38 },
      { o: [0.5, 0.78, 0.6, 0.12, 0.05], w: 0.25 },
    ],
    stars: [[0, 0.12, 0.007, 1.2], [0, 0.5, 0.007, 1], [1, 0.4, 0.01, 1.1], [2, 0.3, 0.008, 0.9], [4, 0.6, 0.012, 0.8], [5, 0.5, 0.01, 0.9], [6, 0.2, 0.006, 0.8]],
    glow: [],
  },
  {
    curves: [
      { f: [[-0.12, 0.58], [0.13, 0.69], [0.36, 0.81], [0.6, 0.86], [0.82, 0.83], [1.12, 0.68]], w: 1 },
      { f: [[1.12, 0.04], [0.88, 0.19], [0.7, 0.3], [0.5, 0.46], [0.32, 0.68], [0.2, 1.12]], w: 0.5 },
      { f: [[0.27, -0.12], [0.32, 0.12], [0.46, 0.25], [0.7, 0.3], [0.9, 0.42], [1.12, 0.46]], w: 0.34 },
      { o: [0.56, 0.42, 0.62, 0.25, -0.12], w: 0.3 },
      { f: [[0.52, 1.12], [0.7, 0.93], [0.86, 0.8], [1.12, 0.62]], w: 0.5 },
      { o: [0.3, 0.14, 0.3, 0.11, 0.28], w: 0.24 },
      { f: [[-0.12, 0.4], [0.2, 0.48], [0.5, 0.6], [0.8, 0.7], [1.12, 0.72]], w: 0.25 },
    ],
    stars: [[0, 0.2, 0.009, 1.2], [0, 0.45, 0.009, 1], [0, 0.72, 0.009, 1.1], [1, 0.3, 0.008, 0.9], [3, 0.6, 0.005, 0.9], [4, 0.5, 0.012, 0.8], [2, 0.55, 0.01, 0.8]],
    glow: [],
  },
];

const catmull = (a, b, c, d, t) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

const GREY = Array.from({ length: 256 }, (_, v) => `rgb(${v},${v},${v})`);

function starSprite(size) {
  const c = layer(size, size), g = c.getContext('2d'), m = size / 2;
  const rg = g.createRadialGradient(m, m, 0, m, m, m);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.05, 'rgba(255,255,255,.95)');
  rg.addColorStop(0.14, 'rgba(255,255,255,.32)');
  rg.addColorStop(0.36, 'rgba(255,255,255,.07)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (const [len, thick, a, vertical] of [[1, 0.016, 0.6, false], [0.5, 0.012, 0.3, true]]) {
    const L = size * len, T = size * thick;
    const lg = vertical ? g.createLinearGradient(0, m - L / 2, 0, m + L / 2) : g.createLinearGradient(m - L / 2, 0, m + L / 2, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, `rgba(255,255,255,${a})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    vertical ? g.fillRect(m - T / 2, m - L / 2, T, L) : g.fillRect(m - L / 2, m - T / 2, L, T);
  }
  return c;
}

export class Space {
  constructor(canvas, reduce) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduce = reduce;
    // warp: lens strength (<0 pinches), cx/cy: lens centre offset (viewport fractions), radius: lens
    // radius (device px), mode/wave/phase: distortion field + amplitude (px) + phase,
    // split/splitA: colour split px + angle, glitch/glitchKind: tearing strength + 'h' | 'v' | 'blocks',
    // ox/oy: shake
    this.fx = { warp: 0, cx: 0, cy: 0, radius: 1, mode: 'ripple', wave: 0, phase: 0, zoom: 1, gain: 1, split: 0, splitA: 0, glitch: 0, glitchKind: 'h', ox: 0, oy: 0 };
    this.mix = 1; // galaxy crossfade progress, driven by the transition
    this.zoomOld = this.zoomNew = 1; // per-galaxy scale during the explosion
    this.fx.blastR = this.fx.blastA = 0; // explosion shockwave: front radius and push, device px
    this.calm = [];
    this.lit = this.lit1 = 1;
    this.layer = { alpha: 1, zoom: 1 };
    this.star = starSprite(128);
    this.time = 0;
    this.last = performance.now();
    this.P = [0, 0];
    this.hits = new Float32Array(48 * 3);
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0 };

    addEventListener('pointermove', (e) => {
      const m = this.mouse;
      m.tx = e.clientX * this.dpr;
      m.ty = e.clientY * this.dpr;
      m.target = 1;
      if (e.pointerType !== 'mouse') {
        clearTimeout(this.touchTimer);
        this.touchTimer = setTimeout(() => (m.target = 0), 700);
      }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => (this.mouse.target = 0));
    addEventListener('resize', () => this.resize());
    this.resize();
    this.mouse.x = this.mouse.tx = this.W / 2;
    this.mouse.y = this.mouse.ty = this.H / 2;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    // full device resolution up to 2x, 3x on phones (small screens, sharp lines matter most there);
    // only giant 4K+ backing stores get trimmed
    const small = w < 760;
    this.dpr = Math.min(devicePixelRatio || 1, small ? 3 : 2, this.cap || 3, Math.sqrt(8.3e6 / (w * h)));
    const W = (this.W = Math.round(w * this.dpr)), H = (this.H = Math.round(h * this.dpr));
    this.S = (W + H) / 2;
    this.c.width = W;
    this.c.height = H;
    // glow buffers at 1/2, 1/8 and 1/16 css resolution: [downscale, halo width in buffer px, weight]:
    // a tight halo plus a long soft tail. The lines are stroked straight into them (see strokes), so
    // the halo is rasterised soft at low resolution instead of blurring or shrinking the frame: no
    // ctx.filter, no aliasing of thin lines, and every engine, WebKit included, draws the same glow.
    // Phones get a brighter halo, and the buffers at 2x resolution with the halo width doubled to keep
    // its size: a 3x screen otherwise stretches them 6x and up, and their pixels show. A device that
    // proves too slow (this.cap) goes back to 1x.
    const spec = small ? [[2, 1.5, 0.45], [8, 1.7, 0.22], [16, 1.7, 0.12]] : [[2, 1.5, 0.3], [8, 1.7, 0.14], [16, 1.7, 0.09]];
    const r = small && !this.cap ? 2 : 1;
    this.glow = spec.map(([k, width, weight]) => {
      k /= r;
      width *= r;
      const c = layer(Math.ceil(w / k), Math.ceil(h / k));
      return { c, g: c.getContext('2d'), s: 1 / (k * this.dpr), sw: w / k, sh: h / k, width, weight };
    });
    this.scratch = layer(W, H); // frame snapshot for the colour split and glitch tearing
    this.sctx = this.scratch.getContext('2d');
    // background stars: mostly faint, a few with a soft glow
    this.dust = Array.from({ length: Math.round((w * h) / 2600) }, () => [Math.random(), Math.random(), 0.2 + Math.random() * 1.2, Math.random() * TAU, Math.random() ** 2.4]);
    if (this.index !== undefined) {
      this.prev = null;
      this.setGalaxy(this.index);
    }
  }

  // fade: keep the previous galaxy for the crossfade (progress comes from this.mix)
  setGalaxy(index, fade = false) {
    if (fade && this.set) this.prev = this.set;
    const g = GALAXIES[index];
    this.index = index;
    const curves = g.curves.map((s, k) => {
      const n = s.o ? 300 : 230;
      return {
        ...s, n,
        xs: new Float32Array(n), ys: new Float32Array(n),
        px: s.f && new Float32Array(s.f.length), py: s.f && new Float32Array(s.f.length),
        a: new Float32Array(CHUNKS), box: new Float32Array(CHUNKS * 4),
        seed: k * 2.37 + index * 5.1,
        z: 0.45 + ((k * 0.618 + index * 0.31) % 1),
        waves: 0.8 + (k % 3) * 0.45,
        vel: 0.016 + (k % 4) * 0.006,
        phase: k * 1.7 + index,
      };
    });
    // brighter lines paint over dimmer ones
    this.set = { g, curves, order: [...curves].sort((a, b) => a.w - b.w) };
  }

  // shake, distortion field, shockwave, lens and zoom; every term is smooth, so lines bend without kinks
  lens(x, y) {
    const fx = this.fx, W = this.W, H = this.H, cx = W / 2, cy = H / 2, zoom = fx.zoom * this.layer.zoom;
    x += fx.ox;
    y += fx.oy;
    const lx = cx + fx.cx * W, ly = cy + fx.cy * H, A = fx.wave, ph = fx.phase;
    if (A) {
      const u = x / W, v = y / H;
      if (fx.mode === 'ripple') {
        // shockwave: radial rings travelling outward
        const dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy) || 1, r = d / fx.radius;
        if (r < 1) {
          const off = A * Math.sin(r * TAU * 3.5 - ph * 2) * (1 - r) ** 0.6;
          x += (dx / d) * off;
          y += (dy / d) * off;
        }
      } else if (fx.mode === 'shear') {
        x += A * (0.7 * Math.sin(TAU * 3 * v + ph) + 0.3 * Math.sin(TAU * 8.5 * v - ph * 1.7));
      } else {
        y += A * (0.7 * Math.sin(TAU * 4 * u + ph) + 0.3 * Math.sin(TAU * 9.5 * u + ph * 1.3));
      }
    }
    if (fx.blastA) {
      // shockwave: a soft band of outward push riding the expanding front
      const dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy) || 1, w = fx.radius * 0.14 + 30 * this.dpr, b = (d - fx.blastR) / w;
      if (b > -3 && b < 3) {
        const push = fx.blastA * Math.exp(-b * b);
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    if (fx.warp) {
      const dx = x - lx, dy = y - ly, r2 = (dx * dx + dy * dy) / (fx.radius * fx.radius);
      if (r2 < 1) {
        const q = 1 - r2, g = 1 + fx.warp * q * q;
        x = lx + dx * g;
        y = ly + dy * g;
      }
    }
    if (zoom !== 1) {
      x = cx + (x - cx) * zoom;
      y = cy + (y - cy) * zoom;
    }
    this.P[0] = x;
    this.P[1] = y;
  }

  project(x, y, z) {
    const m = this.mouse;
    this.lens(x + (m.x - this.W / 2) * -0.028 * z, y + (m.y - this.H / 2) * -0.028 * z);
    return this.P;
  }

  calmAt(x, y) {
    let k = 1;
    for (const [x0, y0, x1, y1, s] of this.calm) {
      const d = Math.max(x0 - x, x - x1, y0 - y, y - y1);
      k = Math.min(k, s + (1 - s) * smooth(0, 0.1, d));
    }
    return k;
  }

  sample(c, t) {
    const { W, H, S } = this, n = c.n, xs = c.xs, ys = c.ys, s = c.seed;
    if (c.o) {
      let [cx, cy, rx, ry, rot] = c.o;
      cx = (cx + Math.sin(t * 0.05 + s) * 0.014) * W;
      cy = (cy + Math.cos(t * 0.043 + s * 1.3) * 0.014) * H;
      rot += Math.sin(t * 0.031 + s * 0.7) * 0.07;
      const breathe = 1 + Math.sin(t * 0.06 + s) * 0.035;
      rx *= breathe * S;
      ry *= (2 - breathe) * S;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1)) * TAU, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
        xs[i] = cx + ex * cr - ey * sr;
        ys[i] = cy + ex * sr + ey * cr;
      }
      return;
    }
    const p = c.f, k = p.length, px = c.px, py = c.py;
    for (let j = 0; j < k; j++) {
      px[j] = (p[j][0] + Math.sin(t * 0.13 + j * 1.9 + s) * 0.014 + Math.sin(t * 0.071 + j * 0.7 + s * 2) * 0.008) * W;
      py[j] = (p[j][1] + Math.cos(t * 0.11 + j * 1.3 + s) * 0.016 + Math.sin(t * 0.083 + j + s) * 0.008) * H;
    }
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * (k - 1), j = Math.min(k - 2, u | 0), f = u - j;
      const j0 = Math.max(0, j - 1), j3 = Math.min(k - 1, j + 2);
      xs[i] = catmull(px[j0], px[j], px[j + 1], px[j3], f);
      ys[i] = catmull(py[j0], py[j], py[j + 1], py[j3], f);
    }
  }

  // parallax, then a gaussian push away from the cursor: zero at its centre, no kinks, no folds
  deform(c) {
    const { W, H, mouse: m, P } = this, xs = c.xs, ys = c.ys;
    const ox = (m.x - W / 2) * -0.028 * c.z, oy = (m.y - H / 2) * -0.028 * c.z;
    const sigma = this.S * 0.085, s2 = 2 * sigma * sigma, A = ((28 * this.dpr * 1.65) / sigma) * m.on;
    for (let i = 0; i < c.n; i++) {
      let x = xs[i] + ox, y = ys[i] + oy;
      if (A > 0.002) {
        const dx = x - m.x, dy = y - m.y, d2 = dx * dx + dy * dy;
        if (d2 < s2 * 4.5) {
          const k = A * Math.exp(-d2 / s2);
          x += dx * k;
          y += dy * k;
        }
      }
      this.lens(x, y);
      xs[i] = P[0];
      ys[i] = P[1];
    }
  }

  // per-chunk brightness (light drifting along the line) and bounding boxes for node search
  shade(c, t) {
    const { W, H } = this, per = (c.n - 1) / CHUNKS, gain = this.lit * this.layer.alpha;
    for (let q = 0; q < CHUNKS; q++) {
      const i0 = Math.round(q * per), i1 = Math.round((q + 1) * per);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = i0; i <= i1; i++) {
        const x = c.xs[i], y = c.ys[i];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      c.box.set([x0, y0, x1, y1], q * 4);
      const wv = 0.5 + 0.5 * Math.sin(TAU * (((q + 0.5) / CHUNKS) * c.waves - t * c.vel) + c.phase);
      c.a[q] = Math.min(1, Math.min(1, c.w * 1.25) * (0.34 + 0.66 * wv * wv) * gain * this.calmAt((x0 + x1) / 2 / W, (y0 + y1) / 2 / H));
    }
  }

  // brightness at s ∈ [0, 1], linearly interpolated between chunk samples (wraps on orbits)
  alphaAt(c, s) {
    let f = s * CHUNKS - 0.5;
    if (c.o) f = ((f % CHUNKS) + CHUNKS) % CHUNKS;
    else f = Math.min(CHUNKS - 1, Math.max(0, f));
    const q = Math.floor(f), q2 = c.o ? (q + 1) % CHUNKS : Math.min(CHUNKS - 1, q + 1);
    return c.a[q] + (c.a[q2] - c.a[q]) * (f - q);
  }

  // A smooth midpoint-quadratic spline, stroked in short runs: small bounds keep Chrome's stroke
  // rasterizer fast. Runs are opaque greys (brightness = colour, not alpha), so their round caps
  // overlap without beading and the line reads as one continuous filament. Each run also goes into
  // the glow buffers, wider and at half brightness; they add up, so there the caps are butt and the
  // joints (smooth, the spline is C1) neither overlap nor gap. The wide tail buffers take two runs per
  // stroke at their mean brightness: half the calls, and at that blur the step doesn't show.
  strokes(width) {
    const ctx = this.ctx, [near, ...tail] = this.glow, STEP = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of this.cur.order) {
      const xs = c.xs, ys = c.ys, n = c.n, last = n - 2;
      let pair = null, sum = 0, runs = 0;
      const flush = () => {
        if (pair) for (const L of tail) {
          L.g.strokeStyle = GREY[Math.round((sum / runs) * 127)];
          L.g.stroke(pair);
        }
        pair = null;
        sum = runs = 0;
      };
      ctx.lineWidth = width(c) * this.dpr;
      for (const L of this.glow) L.g.lineWidth = (L.width * (0.6 + 0.5 * c.w)) / L.s;
      for (let i0 = 0; i0 < last; i0 += STEP) {
        const i1 = Math.min(last, i0 + STEP), a = Math.min(1, this.alphaAt(c, (i0 + i1 + 1) / 2 / (n - 1)));
        if (a < 0.012) {
          flush();
          continue;
        }
        const p = new Path2D();
        p.moveTo((xs[i0] + xs[i0 + 1]) / 2, (ys[i0] + ys[i0 + 1]) / 2);
        for (let i = i0 + 1; i <= i1; i++) p.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
        if (c.o && i1 === last) p.quadraticCurveTo(xs[n - 1], ys[n - 1], (xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2);
        ctx.strokeStyle = GREY[Math.round(a * 255)];
        ctx.stroke(p);
        near.g.strokeStyle = GREY[Math.round(a * 127)];
        near.g.stroke(p);
        if (!pair) pair = new Path2D();
        pair.addPath(p);
        sum += a;
        if (++runs === 2) flush();
      }
      flush();
    }
  }

  // line crossings between bright chunks become star nodes
  nodes() {
    const cs = this.cur.curves, hits = this.hits, max = hits.length / 3;
    let n = 0;
    for (let ia = 0; ia < cs.length; ia++) {
      const A = cs[ia];
      if (A.w < 0.3) continue;
      const pa = (A.n - 1) / CHUNKS;
      for (let ib = ia + 1; ib < cs.length; ib++) {
        const B = cs[ib];
        if (B.w < 0.3) continue;
        const pb = (B.n - 1) / CHUNKS;
        for (let qa = 0; qa < CHUNKS; qa++) {
          const aa = A.a[qa];
          if (aa < 0.1) continue;
          const ba = qa * 4;
          for (let qb = 0; qb < CHUNKS; qb++) {
            const ab = B.a[qb], bb = qb * 4;
            if (ab < 0.1 || A.box[ba] > B.box[bb + 2] || B.box[bb] > A.box[ba + 2] || A.box[ba + 1] > B.box[bb + 3] || B.box[bb + 1] > A.box[ba + 3]) continue;
            const a0 = Math.round(qa * pa), a1 = Math.round((qa + 1) * pa), b0 = Math.round(qb * pb), b1 = Math.round((qb + 1) * pb);
            for (let i = a0; i < a1; i++) {
              const x1 = A.xs[i], y1 = A.ys[i], dx1 = A.xs[i + 1] - x1, dy1 = A.ys[i + 1] - y1;
              for (let j = b0; j < b1; j++) {
                const x3 = B.xs[j], y3 = B.ys[j], dx2 = B.xs[j + 1] - x3, dy2 = B.ys[j + 1] - y3;
                const d = dx1 * dy2 - dy1 * dx2;
                if (!d) continue;
                const ua = ((x3 - x1) * dy2 - (y3 - y1) * dx2) / d, ub = ((x3 - x1) * dy1 - (y3 - y1) * dx1) / d;
                if (ua < 0 || ua > 1 || ub < 0 || ub > 1) continue;
                hits[n * 3] = x1 + dx1 * ua;
                hits[n * 3 + 1] = y1 + dy1 * ua;
                hits[n * 3 + 2] = Math.sqrt(aa * ab);
                if (++n === max) return n;
              }
            }
          }
        }
      }
    }
    return n;
  }

  // bloom: also a 2x copy into the 1/8 glow buffer, so bright points flare along with the lines
  sprite(x, y, size, alpha, bloom = false) {
    this.ctx.globalAlpha = Math.min(1, alpha);
    this.ctx.drawImage(this.star, x - size / 2, y - size / 2, size, size);
    if (!bloom) return;
    const g = this.glow[1].g;
    g.globalAlpha = Math.min(1, alpha);
    g.drawImage(this.star, x - size, y - size, size * 2, size * 2);
    g.globalAlpha = 1;
  }

  render(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // a device that can't keep up (a good share of frames slower than ~38fps outside transitions)
    // steps the canvas resolution down, 3x to 2x to 1.5x, instead of stuttering; never back up
    if (!this.prev) this.slow = Math.max(0, (this.slow || 0) + (dt > 0.026 ? 1 : -0.5));
    if (this.slow > 60 && this.dpr > 1.5) {
      this.slow = 0;
      this.cap = this.dpr > 2 ? 2 : 1.5;
      this.resize();
    }
    const still = this.reduce.matches;
    const t = (this.time += dt * (still ? 0.25 : 1));
    const { ctx, W, H, dpr, fx, mouse: m } = this;
    const base = 30 * dpr;

    const ease = 1 - Math.exp(-dt * 6);
    m.x += (m.tx - m.x) * ease;
    m.y += (m.ty - m.y) * ease;
    m.on += ((still ? 0 : m.target) - m.on) * (1 - Math.exp(-dt * 3));
    // the transition's over-brightness through two low-pass stages: a quick swell, then a long
    // fade that starts at rest and eases out, so the lines never visibly snap back
    const stage = (from, to) => (to - from) * (1 - Math.exp(-dt / (to > from ? 0.06 : 0.34)));
    this.lit1 += stage(this.lit1, fx.gain);
    this.lit += stage(this.lit, this.lit1);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#fff';
    for (const [dx, dy, z, ph, b] of this.dust) {
      const [x, y] = this.project(dx * W, dy * H, z * 0.4);
      const a = (0.05 + 0.55 * b) * (0.65 + 0.35 * Math.sin(t * (0.4 + z * 0.6) + ph)) * Math.min(1, this.lit);
      if (b > 0.82) this.sprite(x, y, base * (0.25 + 0.3 * b), a);
      else {
        ctx.globalAlpha = a;
        const s = (0.8 + 1.4 * b) * dpr;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }

    for (const L of this.glow) {
      const g = L.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, L.c.width, L.c.height);
      g.setTransform(L.s, 0, 0, L.s, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'butt';
      g.lineJoin = 'round';
    }

    // galaxy change: crossfade across the transition, the old set drifts outward as the new one settles
    const k = this.prev ? this.mix : 1;
    if (this.prev && k < 1) {
      this.layer = { alpha: 1 - k, zoom: (1 + 0.08 * k) * this.zoomOld };
      this.drawSet(this.prev, t);
    } else this.prev = null;
    this.layer = { alpha: k, zoom: (this.prev ? 0.95 + 0.05 * k : 1) * this.zoomNew };
    this.drawSet(this.set, t);
    this.layer = { alpha: 1, zoom: 1 };

    // glow fold: each buffer scaled up into the next larger one and the largest onto the frame, so the
    // halo costs one full-size draw; doubling bilinear steps smooth it towards a gaussian falloff.
    // Strokes went in at half brightness, hence 2x on the last step.
    for (let i = this.glow.length - 1; i >= 0; i--) {
      const L = this.glow[i], up = this.glow[i - 1], g = up ? up.g : ctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = up ? L.weight / up.weight : 2 * L.weight;
      g.drawImage(L.c, 0, 0, L.sw, L.sh, 0, 0, up ? up.sw : W, up ? up.sh : H);
    }
    ctx.globalAlpha = 1;

    // colour split: tinted, offset copies of the finished frame; GPU cost doesn't grow with line shape
    const sctx = this.sctx;
    if (fx.split) {
      const sx = Math.cos(fx.splitA) * fx.split * dpr, sy = Math.sin(fx.splitA) * fx.split * dpr;
      for (const [color, d] of [['#ff2d55', 1], ['#2dc8ff', -1]]) {
        sctx.globalCompositeOperation = 'copy';
        sctx.drawImage(this.c, 0, 0);
        sctx.globalCompositeOperation = 'source-in';
        sctx.fillStyle = color;
        sctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(this.scratch, sx * d, sy * d);
      }
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'source-over';
    if (fx.glitch) {
      // tearing from one snapshot instead of nine self-copies of the canvas
      sctx.globalCompositeOperation = 'copy';
      sctx.drawImage(this.c, 0, 0);
      const src = this.scratch;
      for (let i = 0; i < 6; i++) {
        const shift = (Math.random() - 0.5) * 0.18 * fx.glitch;
        if (fx.glitchKind === 'blocks') {
          const w = (0.04 + Math.random() * 0.25) * W, h = (0.02 + Math.random() * 0.12) * H, x = Math.random() * (W - w), y = Math.random() * (H - h);
          ctx.drawImage(src, x, y, w, h, x + shift * W, y + (Math.random() - 0.5) * 0.1 * H * fx.glitch, w, h);
        } else if (fx.glitchKind === 'v') {
          const x = Math.random() * W, w = (0.006 + Math.random() * 0.06) * W;
          ctx.drawImage(src, x, 0, w, H, x, shift * H, w, H);
        } else {
          const y = Math.random() * H, h = (0.006 + Math.random() * 0.06) * H;
          ctx.drawImage(src, 0, y, W, h, shift * W, y, W, h);
        }
      }
    }
  }

  // one galaxy: geometry, lines, nodes, riding stars and hot spots
  drawSet(set, t) {
    const { ctx, W, H, dpr } = this, base = 30 * dpr, alpha = this.layer.alpha;
    this.cur = set;
    for (const c of set.curves) {
      this.sample(c, t);
      this.deform(c);
      this.shade(c, t);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.strokes((c) => 1 + 0.6 * c.w);
    ctx.globalCompositeOperation = 'lighter';
    const n = this.nodes();
    for (let i = 0; i < n; i++) {
      const s = this.hits[i * 3 + 2];
      this.sprite(this.hits[i * 3], this.hits[i * 3 + 1], base * (0.45 + 0.9 * s), s * 1.6, true);
    }
    for (const [ci, u0, speed, size] of set.g.stars) {
      const c = set.curves[ci], u = (((u0 + t * speed) % 1) + 1) % 1, f = u * (c.n - 1), i = Math.min(c.n - 2, f | 0), r = f - i;
      const x = c.xs[i] + (c.xs[i + 1] - c.xs[i]) * r, y = c.ys[i] + (c.ys[i + 1] - c.ys[i]) * r;
      const local = c.a[Math.min(CHUNKS - 1, (u * CHUNKS) | 0)];
      const tw = 0.82 + 0.18 * Math.sin(t * 1.6 + ci * 3 + u0 * 10);
      this.sprite(x, y, base * size * 1.6 * tw, (0.55 + 0.45 * Math.min(1, local * 2)) * this.calmAt(x / W, y / H) * tw * this.lit * alpha, true);
    }
    for (const [gx, gy, size] of set.g.glow) {
      const [x, y] = this.project(gx * W, gy * H, 0.9);
      this.sprite(x, y, base * size * 2.6 * (0.9 + 0.1 * Math.sin(t * 0.9)), 0.9 * this.calmAt(x / W, y / H) * this.lit * alpha, true);
    }
  }
}
