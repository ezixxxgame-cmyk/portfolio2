import { Space } from './space.js';

const TG = 'https://t.me/wa1dx';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const TAU = Math.PI * 2;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const screens = $$('.screen');
const navLinks = $$('.nav [data-go]');
const space = new Space($('.space'), reduce);

let current = Math.max(0, screens.findIndex((s) => location.hash === '#' + s.id));
let tr = null;
let introAt = performance.now();

/* ---------------- warp maps for the SVG filter ---------------- */

// Chromium runs feDisplacementMap on the GPU; elsewhere the warp lives only on the canvas.
let svgWarp = !!navigator.userAgentData?.brands?.some((b) => b.brand === 'Chromium');
const byId = (id) => document.getElementById(id);
const lensImg = byId('fx-lens'), lensD = byId('fx-lens-d'), fieldIn = byId('fx-field-in'), waveD = byId('fx-wave-d');
const tearD = byId('fx-tear-d'), chanR = byId('fx-r'), chanB = byId('fx-b'), blastImg = byId('fx-blast'), blastD = byId('fx-blast-d');
const fields = Object.fromEntries($$('.fx-field').map((el) => [el.dataset.mode, el]));

// Paints a displacement map: f(u, v, row) returns [dx, dy] in −1…1 for u, v in −1…1.
function mapURL(w, h, f) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [dx, dy] = f(((x + 0.5) / w) * 2 - 1, ((y + 0.5) / h) * 2 - 1, y), i = (y * w + x) * 4;
      d[i] = 128 + 127 * clamp(dx, -1, 1);
      d[i + 1] = 128 + 127 * clamp(dy, -1, 1);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

const place = (el, x, y, w, h) => {
  el.setAttribute('x', x.toFixed(1));
  el.setAttribute('y', y.toFixed(1));
  el.setAttribute('width', w.toFixed(1));
  el.setAttribute('height', h.toFixed(1));
};

/* ---------------- four transition modes ---------------- */

// Every mode is the same beat: a charge that sucks the screen in, then an impulsive blast with a short
// glitch. Each has its own distortion texture, tearing, colour split and kick axis.
// lens < 0 pinches inward during the charge. split/shake: fixed axis (radians) or null for random.
const MODES = [
  { field: 'ripple', lens: -0.5, tears: 'h', split: null, shake: null }, // ring shockwave
  { field: 'ripple', lens: -0.8, tears: 'blocks', split: null, shake: null }, // deep implosion, shattered burst
  { field: 'shear', lens: -0.4, tears: 'h', split: 0, shake: 0 }, // horizontal slit blast
  { field: 'rain', lens: -0.4, tears: 'v', split: Math.PI / 2, shake: Math.PI / 2 }, // vertical slit blast
];
let mode = (Math.random() * MODES.length) | 0;
const nextMode = () => {
  let n;
  do n = (Math.random() * MODES.length) | 0;
  while (n === mode);
  return n;
};

// distortion fields don't depend on the viewport: painted once
if (svgWarp) {
  const set = (name, url) => fields[name].setAttribute('href', url);
  set('ripple', mapURL(256, 256, (u, v) => {
    const r = Math.hypot(u, v) || 1e-6, f = r < 1 ? Math.sin(r * TAU * 3.5) * (1 - r) ** 0.6 : 0;
    return [(u / r) * f, (v / r) * f];
  }));
  set('shear', mapURL(4, 256, (u, v) => [0.7 * Math.sin(TAU * 3 * v) + 0.3 * Math.sin(TAU * 8.5 * v + 1), 0]));
  set('rain', mapURL(256, 4, (u) => [0, 0.7 * Math.sin(TAU * 4 * u) + 0.3 * Math.sin(TAU * 9.5 * u + 2)]));
}

// tearing maps: horizontal bands, vertical strips or scattered blocks, drawn with fillRect and encoded
// off the main thread; repainted after every transition for the next mode, so no two glitches match
function paintTears(kind) {
  const N = 256, rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  $$('.fx-tear').forEach((el) => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d'), col = (dx, dy) => `rgb(${Math.round(128 + 127 * dx)},${Math.round(128 + 127 * dy)},128)`;
    g.fillStyle = col(0, 0);
    g.fillRect(0, 0, N, N);
    for (let p = 0; kind !== 'blocks' && p < N; ) {
      const len = rnd(2, 20), v = Math.random() < 0.45 ? Math.random() * 2 - 1 : 0;
      if (v) {
        g.fillStyle = kind === 'v' ? col(0, v) : col(v, 0);
        kind === 'v' ? g.fillRect(p, 0, len, N) : g.fillRect(0, p, N, len);
      }
      p += len;
    }
    for (let k = 0, n = kind === 'blocks' ? 70 : 24; k < n; k++) {
      g.fillStyle = col(Math.random() * 2 - 1, (Math.random() * 2 - 1) * (kind === 'blocks' ? 1 : 0.6));
      g.fillRect(rnd(0, N), rnd(0, N), rnd(N * 0.03, N * 0.26), rnd(N * 0.01, N * (kind === 'blocks' ? 0.14 : 0.08)));
    }
    c.toBlob((b) => {
      const old = el.getAttribute('href');
      el.setAttribute('href', URL.createObjectURL(b));
      if (old) URL.revokeObjectURL(old);
    });
  });
}
if (svgWarp) paintTears(MODES[mode].tears);

function buildWarp() {
  if (!svgWarp) return;
  const W = innerWidth, H = innerHeight, D = Math.max(W, H), ax = W / D, ay = H / D;
  // lens: magnifies the middle and flattens out towards the edges, so it has no visible rim
  lensImg.setAttribute('href', mapURL(128, 128, (u, v) => {
    const r2 = u * u + v * v, q = r2 < 1 ? ((1 - r2) * (1 - r2)) / 0.286 : 0;
    return [-u * q * ax, -v * q * ay];
  }));
  $$('.fx-tear').forEach((el) => place(el, 0, 0, W, H));
}
buildWarp();

// explosion shockwave: a soft ring of outward displacement, scaled up from the blast point
if (svgWarp) blastImg.setAttribute('href', mapURL(256, 256, (u, v) => {
  const r = Math.hypot(u, v) || 1e-6, f = r < 1 ? Math.exp(-(((r - 0.78) / 0.13) ** 2)) * (1 - r ** 8) : 0;
  return [(-u / r) * f, (-v / r) * f];
}));

// a fresh pattern per transition: the mode's character plus random centre, flow, polarity and axes
function pattern() {
  const m = MODES[mode], r = Math.random, side = () => (r() < 0.5 ? -1 : 1);
  return {
    ...m,
    cx: (r() - 0.5) * 0.24,
    cy: (r() - 0.5) * 0.2,
    splitA: m.split === null ? r() * TAU : m.split + (r() < 0.5 ? 0 : Math.PI),
    shakeA: m.shake === null ? r() * TAU : m.shake,
    speed: 0.6 + r() * 0.9,
    dir: side(),
    phase: r() * TAU,
    sign: side(),
  };
}

// d: distortion 0…1, ts: seconds, tear: tearing 0…1, prog: whole-transition progress 0…1,
// front/punch: shockwave radius 0…1 and strength 0…1
function warpDOM(el, d, ts, tear, pat, prog, front = 0, punch = 0) {
  if (!svgWarp) return;
  const W = innerWidth, H = innerHeight, D = Math.max(W, H), jitter = 3.5 * d * Math.sin(ts * 40);
  const ux = Math.cos(pat.splitA), uy = Math.sin(pat.splitA), lx = W / 2 + pat.cx * W, ly = H / 2 + pat.cy * H;
  const f = fields[pat.field], flow = (ts * pat.speed * 0.9) % 1;
  place(lensImg, pat.cx * W, pat.cy * H, W, H);
  lensD.setAttribute('scale', (0.22 * D * d * pat.lens).toFixed(1));
  fieldIn.setAttribute('in', pat.field);
  if (pat.field === 'ripple') {
    const S = D * (0.6 + 1.8 * prog); // rings expand outward through the whole transition
    place(f, lx - S / 2, ly - S / 2, S, S);
  } else if (pat.field === 'shear') place(f, 0, pat.dir > 0 ? -H + flow * H : -flow * H, W, 2 * H); // scrolls up or down
  else place(f, pat.dir > 0 ? -W + flow * W : -flow * W, 0, 2 * W, H); // scrolls left or right
  waveD.setAttribute('scale', (150 * d * pat.sign).toFixed(1));
  const S = D * (0.15 + 2.7 * front);
  place(blastImg, lx - S / 2, ly - S / 2, S, S);
  blastD.setAttribute('scale', (440 * punch).toFixed(1));
  tearD.setAttribute('scale', (130 * tear).toFixed(1));
  tearD.setAttribute('in2', 't' + (Math.floor(ts * 34) % 3));
  chanR.setAttribute('dx', (-20 * d * ux - jitter * uy).toFixed(1));
  chanR.setAttribute('dy', (-20 * d * uy + jitter * ux).toFixed(1));
  chanB.setAttribute('dx', (20 * d * ux + jitter * uy).toFixed(1));
  chanB.setAttribute('dy', (20 * d * uy - jitter * ux).toFixed(1));
  el.style.filter = d > 0.003 || tear > 0 || punch > 0.003 ? 'url(#warp)' : '';
}

/* ---------------- galaxy teleport ---------------- */

// OUT: the charge — lens, field and colour split build up while the next galaxy gathers as a
// compressed core in the middle; right before the burst everything is sucked inward and a short
// glitch lands. POP: flash and an impact kick. IN: the explosion — a shockwave rips outward through
// content and lines, the new galaxy and screen burst out from the centre, the old lines are blown away.
// The background galaxies crossfade across exactly this window.
const OUT = 280, IN = 460;

function go(to, focus = false) {
  if (tr || to === current || to < 0 || to >= screens.length) return;
  tr = { from: screens[current], next: screens[to], to, focus, t0: performance.now(), popped: false, frames: 0, slow: 0, lastT: 0, pat: pattern() };
  tr.from.style.willChange = tr.next.style.willChange = 'transform, opacity, filter';
  introAt = 0;
  space.fx.zoom = 1;
  space.setGalaxy(to, true);
  space.mix = 0;
  if (reduce.matches) tr.fade = true;
}

// glow: target over-brightness 0…1; the canvas smooths it into a quick swell and a long fade
function warpCanvas(d, glow, ts, tear, pat, sx = 0, sy = 0, front = 0, punch = 0) {
  const fx = space.fx, dpr = space.dpr, R = Math.hypot(space.W, space.H) / 2;
  Object.assign(fx, {
    radius: R, warp: 1.4 * pat.lens * d, cx: pat.cx, cy: pat.cy,
    mode: pat.field, wave: 64 * d * dpr * pat.sign, phase: ts * 9 * pat.speed * pat.dir + pat.phase,
    blastR: front * 1.3 * R, blastA: punch * 230 * dpr,
    split: 12 * d, splitA: pat.splitA, glitch: tear > 0.12 ? tear * 0.4 : 0, glitchKind: pat.tears,
    ox: sx * dpr, oy: sy * dpr, gain: 1 + 0.9 * glow,
  });
}

function stepTransition(now) {
  // a frame that began before go() ran (rAF-aligned input) would give t < 0, and p ** 1.8 is NaN
  const t = Math.max(0, now - tr.t0), ts = t / 1000, { from, next, pat } = tr;
  space.mix = smooth(0, 1, t / (tr.fade ? 420 : OUT + IN));

  if (tr.fade) {
    const p = Math.min(1, t / 420);
    if (p < 0.4) from.style.opacity = 1 - p / 0.4;
    else {
      if (!tr.popped) pop();
      next.style.opacity = (p - 0.4) / 0.6;
    }
    if (p >= 1) finish();
    return;
  }

  const prog = Math.min(1, t / (OUT + IN));
  if (t < OUT) {
    if (svgWarp && t > 40) {
      tr.slow += now - tr.lastT > 24 ? 1 : 0;
      tr.frames++;
    }
    tr.lastT = now;
    // the charge: lens and field build up, then the last ~100ms suck everything in, accelerating
    const p = t / OUT, d = p ** 1.8, tear = smooth(0.55, 0.9, p), implode = smooth(0.6, 1, p) ** 2;
    from.style.transform = `scale(${(1 - 0.1 * d - 0.2 * implode).toFixed(4)})`;
    warpDOM(from, d, ts, tear, pat, prog);
    warpCanvas(d, smooth(0, 1, p), ts, tear, pat);
    space.zoomOld = 1 - 0.2 * implode; // the old lines get sucked in just before the burst
    space.zoomNew = 0.22 + 0.08 * p; // the next galaxy waits as a compressed core
  } else {
    if (!tr.popped) pop();
    const k = t - OUT, p = Math.min(1, k / IN), e = easeOutExpo(p);
    const d = Math.max(0, 1 - p / 0.2) ** 2, tear = p < 0.12 ? 1 - p / 0.12 : 0;
    // the blast: the front tears outward at once and its push is spent within a few frames
    const pb = Math.min(1, k / 420), front = 1 - (1 - pb) ** 5, punch = (1 - pb) ** 2.6;
    // impact kick: a hard jolt along the pattern's axis that rings down in ~150ms
    const kick = 16 * Math.exp(-k / 45), a = kick * Math.cos(k * 0.15), b = 0.4 * kick * Math.sin(k * 0.11 + 0.8);
    const sx = a * Math.cos(pat.shakeA) - b * Math.sin(pat.shakeA), sy = a * Math.sin(pat.shakeA) + b * Math.cos(pat.shakeA);
    next.style.transform = `translate3d(${sx.toFixed(2)}px,${sy.toFixed(2)}px,0) scale(${(0.8 + 0.2 * e).toFixed(4)})`;
    next.style.opacity = Math.min(1, p * 6);
    warpDOM(next, d, ts, tear, pat, prog, front, punch);
    warpCanvas(d, 0, ts, tear, pat, sx, sy, front, punch);
    space.zoomNew = 0.3 + 0.7 * e; // the new galaxy bursts outward
    space.zoomOld = 0.8 + 1.6 * e; // the old one is blown away
    if (p >= 1) finish();
  }
}

function pop() {
  const { from, next, to } = tr;
  tr.popped = true;
  // a device that can't hold 60fps with the SVG warp keeps the canvas part of the effect
  if (tr.frames > 4 && tr.slow / tr.frames > 0.3) svgWarp = false;
  from.classList.remove('is-active');
  from.inert = true;
  from.style.transform = from.style.filter = from.style.opacity = from.style.willChange = '';
  next.inert = false;
  next.scrollTop = 0;
  next.style.opacity = '0';
  next.classList.add('is-active');
  current = to;
  space.calm = calmRects(next);
  if (!tr.fade) $('.flash').animate([{ opacity: 0.36 }, { opacity: 0 }], { duration: 180, easing: 'cubic-bezier(.1,.7,.3,1)' });
  if (to === 1) carousel.enter(screens.indexOf(from) > 1);
  arrive(next);
}

function finish() {
  const { next, focus } = tr;
  next.style.transform = next.style.opacity = next.style.willChange = next.style.filter = '';
  space.mix = space.zoomOld = space.zoomNew = 1;
  Object.assign(space.fx, { warp: 0, cx: 0, cy: 0, wave: 0, blastA: 0, gain: 1, split: 0, glitch: 0, ox: 0, oy: 0 });
  if (focus) $('h1, h2', next)?.focus({ preventScroll: true });
  tr = null;
  mode = nextMode();
  if (svgWarp) setTimeout(() => paintTears(MODES[mode].tears), 80);
}

function arrive(screen) {
  const i = screens.indexOf(screen);
  navLinks.forEach((a) => a.setAttribute('aria-current', String(+a.dataset.go === i)));
  history.replaceState(null, '', i ? '#' + screen.id : location.pathname + location.search);
  if (reduce.matches) return;
  $$('[data-r]', screen).forEach((el, k) =>
    el.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], {
      duration: 900, delay: 90 + k * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards',
    }));
}

function calmRects(screen) {
  const w = innerWidth, h = innerHeight;
  return $$('[data-calm]', screen).map((el) => {
    const r = el.getBoundingClientRect();
    return [(r.left - 30) / w, (r.top - 30) / h, (r.right + 30) / w, (r.bottom + 30) / h, 0.28];
  });
}

/* ---------------- portfolio orbit ---------------- */

const carousel = (() => {
  const orbit = $('.orbit');
  const meta = { tag: $('.pmeta__tag'), name: $('.pmeta__name'), desc: $('.pmeta__desc'), link: $('.pmeta__link'), cur: $('.pmeta__cur'), all: $('.pmeta__all'), bar: $('.pmeta__bar i'), box: $('.pmeta') };
  const tilts = [[4, -5, 3.5], [-3, 7, -2.5], [5, 4, 2]];
  let cards, n, pos = 0, vel = 0, target = 0, geo, front = -1;

  function collect() {
    cards = $$('.card', orbit);
    n = cards.length;
    meta.all.textContent = String(n).padStart(2, '0');
    meta.box.hidden = !n;
  }

  // the orbit is empty until /api/works answers
  function measure() {
    const cw = cards[0]?.offsetWidth || 0, small = innerWidth < 761;
    geo = { RX: cw * (small ? 1.05 : 1.15), RZ: cw * (small ? 1.1 : 1), RY: innerHeight * 0.035 };
  }

  function showMeta(i, animate) {
    if (!n) return;
    const d = cards[i].dataset, fill = () => {
      meta.tag.textContent = d.tag;
      meta.name.textContent = d.name;
      meta.desc.textContent = d.desc;
      meta.link.hidden = !d.url;
      if (d.url) meta.link.href = d.url;
      meta.cur.textContent = String(i + 1).padStart(2, '0');
    };
    meta.bar.style.transform = `scaleX(${(i + 1) / n})`;
    if (!animate || reduce.matches) return fill();
    meta.box.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 160, easing: 'ease-in' }).onfinish = () => {
      fill();
      meta.box.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
    };
  }

  function to(i) {
    if (i === target) return;
    target = i;
    showMeta(i, true);
  }

  orbit.addEventListener('click', (e) => {
    const i = cards.indexOf(e.target.closest('.card'));
    if (i >= 0) to(i);
  });
  addEventListener('resize', measure);
  collect();
  measure();
  showMeta(0);

  return {
    add(html) {
      orbit.innerHTML = html;
      collect();
      measure();
      front = -1;
      showMeta(target);
      if (current === 1) space.calm = calmRects(screens[1]); // the meta block just appeared
    },
    step(dir) {
      const i = target + dir;
      if (i < 0 || i >= n) return false;
      to(i);
      return true;
    },
    enter(fromBelow) {
      target = fromBelow ? Math.max(0, n - 1) : 0;
      pos = target + ((fromBelow ? 0.7 : -0.7) * Math.min(n, 3)) / 3; // the same ~84° swing for 1–2 cards as for 3+
      vel = 0;
      showMeta(target);
    },
    update(t, dt) {
      const k = 110;
      vel += ((target - pos) * k - vel * 2 * Math.sqrt(k)) * dt;
      pos += vel * dt;
      const still = reduce.matches ? 0 : 1, { RX, RZ, RY } = geo;
      const f = Math.round(pos), step = TAU / Math.min(n, 3);
      cards.forEach((card, i) => {
        // ring offset from the front card, wrapped to ±n/2; the ring keeps three places, extra cards hide behind
        const th = ((((i - pos + n / 2) % n) + n) % n - n / 2) * step, s = Math.sin(th), c = Math.cos(th), [bx, by, bz] = tilts[i % 3], ph = i * 2.1;
        const fade = n > 3 ? clamp((Math.PI - Math.abs(th)) * 2, 0, 1) : 1;
        const x = s * RX, z = (c - 1) * RZ, y = s * RY + Math.sin(t * 0.6 + ph) * 7 * still;
        const ry = -s * 34 + by + Math.sin(t * 0.53 + ph) * 2.4 * still;
        const rx = bx + Math.sin(t * 0.41 + ph * 1.3) * 2.2 * still;
        const rz = bz + Math.sin(t * 0.37 + ph * 0.7) * 1.5 * still;
        card.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${(0.82 + 0.18 * c).toFixed(3)})`;
        card.style.opacity = (clamp((c + 1.1) * 1.2, 0, 1) * fade).toFixed(3);
        card.style.visibility = fade ? '' : 'hidden';
      });
      if (f !== front) {
        front = f;
        cards.forEach((card, i) => card.classList.toggle('is-front', i === f));
      }
    },
  };
})();

fetch('/api/works')
  .then((r) => (r.ok ? r.json() : []))
  .then((works) => works.length && carousel.add(works.map((w) =>
    `<article class="card" data-name="${esc(w.name)}" data-tag="${esc(w.tag)}" data-desc="${esc(w.desc)}" data-url="${esc(w.url || '')}"><div class="card__bar"><i></i><i></i><i></i></div><img class="card__img" src="/api/works?img=${encodeURIComponent(w.img)}" alt="Скриншот проекта ${esc(w.name)}" decoding="async"></article>`).join('')))
  .catch(() => {});

/* ---------------- telegram card orbit flare ---------------- */

const flare = (() => {
  const el = $('.tg__flare'), box = $('.tg__visual');
  const R = (-20 * Math.PI) / 180, cr = Math.cos(R), sr = Math.sin(R);
  let size = 0, back = null;
  const measure = () => (size = box.offsetWidth / 260);
  addEventListener('resize', measure);
  return (t) => {
    if (!size) measure();
    const a = t * 0.5, ex = Math.cos(a) * 122, ey = Math.sin(a) * 50;
    el.style.transform = `translate(${((130 + ex * cr - ey * sr) * size).toFixed(1)}px,${((100 + ex * sr + ey * cr) * size).toFixed(1)}px)`;
    const isBack = Math.sin(a) < 0;
    if (isBack !== back) el.classList.toggle('is-back', (back = isBack));
  };
})();

/* ---------------- calculator: landing base price + add-on options ---------------- */

const calc = (() => {
  const form = $('#calc'), checks = $('.checks'), opts = $('.calc-opts'), empty = $('.calc-empty');
  const nameEl = $('.calc-head__name'), baseEl = $('.calc-head__price'), sumEl = $('.total__sum'), cta = $('#calc-cta');
  const rub = (n) => Math.round(n).toLocaleString('ru-RU');
  let data = null, shown = 0, tween = null;

  function render() {
    const options = data?.options || [];
    if (data?.base) {
      nameEl.textContent = data.base.name;
      baseEl.textContent = `от ${rub(data.base.price)} ₽`;
    }
    opts.hidden = !options.length;
    empty.hidden = !!options.length;
    checks.innerHTML = options.map((o) =>
      `<label class="check"><input type="checkbox" name="opt" value="${esc(o.id)}"><span class="box"><svg class="i"><use href="#i-check"/></svg></span><span>${esc(o.name)}</span><span class="check__price">+${rub(o.price)} ₽</span></label>`).join('');
    update();
  }

  function update() {
    const picked = (data?.options || []).filter((o) => form.querySelector(`input[name="opt"][value="${CSS.escape(o.id)}"]`)?.checked);
    const total = (data?.base?.price || 0) + picked.reduce((s, o) => s + o.price, 0);
    tween = { from: shown, to: total, t0: performance.now() };
    const lines = [`Здравствуйте! Хочу заказать ${(data?.base?.name || 'лендинг').toLowerCase()}.`];
    if (picked.length) lines.push(`Опции: ${picked.map((o) => o.name).join(', ')}`);
    if (data) lines.push(`Ориентир по калькулятору: от ${rub(total)} ₽`);
    cta.href = `${TG}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());

  (async () => {
    for (const url of ['/api/pricing', 'pricing.json']) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) {
          data = await r.json();
          break;
        }
      } catch {}
    }
    render();
  })();

  return (now) => {
    if (!tween) return;
    const p = Math.min(1, (now - tween.t0) / 650);
    shown = tween.from + (tween.to - tween.from) * easeOutExpo(p);
    sumEl.textContent = rub(shown);
    if (p >= 1) tween = null;
  };
})();

/* ---------------- input: wheel, touch, keys, links ---------------- */

function step(dir) {
  if (tr) return;
  if (current === 1 && carousel.step(dir)) return 'card';
  go(current + dir);
}

function canScroll(el, dir) {
  return dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2;
}

let wheelLock = 0, wheelAcc = 0, wheelLast = 0;
addEventListener('wheel', (e) => {
  if (e.ctrlKey) return;
  const now = performance.now(), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  const gap = now - wheelLast;
  wheelLast = now;
  if (!dy || Math.abs(e.deltaX) > Math.abs(dy)) return;
  const scroller = screens[current];
  if (!tr && canScroll(scroller, Math.sign(dy))) {
    wheelLock = now + 220;
    return;
  }
  e.preventDefault();
  // trackpad inertia keeps firing; any event inside the lock extends it so one flick = one step
  if (tr || now < wheelLock) {
    wheelLock = Math.max(wheelLock, now + 160);
    return;
  }
  if (gap > 240) wheelAcc = 0;
  wheelAcc += dy;
  if (Math.abs(wheelAcc) < 30) return;
  const kind = step(Math.sign(wheelAcc));
  wheelAcc = 0;
  wheelLock = now + (kind === 'card' ? 420 : 900);
}, { passive: false });

let touch = null;
addEventListener('touchstart', (e) => {
  const p = e.touches[0], el = screens[current];
  touch = { x: p.clientX, y: p.clientY, up: canScroll(el, -1), down: canScroll(el, 1) };
}, { passive: true });
addEventListener('touchend', (e) => {
  if (!touch || tr) return;
  const p = e.changedTouches[0], dx = touch.x - p.clientX, dy = touch.y - p.clientY;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (current === 1 && ax > 44 && ax > ay) step(Math.sign(dx));
  else if (ay > 56 && ay > ax && !(dy > 0 ? touch.down : touch.up)) step(Math.sign(dy));
  touch = null;
}, { passive: true });

addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const el = e.target;
  if (el.closest?.('input, textarea, select')) return;
  if (e.key === ' ' && el.closest?.('a, button, label')) return;
  const dir = { ArrowDown: 1, PageDown: 1, ArrowRight: 1, ArrowUp: -1, PageUp: -1, ArrowLeft: -1, ' ': e.shiftKey ? -1 : 1 }[e.key];
  if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    return go(e.key === 'Home' ? 0 : screens.length - 1, true);
  }
  if (!dir) return;
  const scroller = screens[current];
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(e.key) && canScroll(scroller, dir)) {
    e.preventDefault();
    return scroller.scrollBy({ top: dir * scroller.clientHeight * 0.8, behavior: reduce.matches ? 'auto' : 'smooth' });
  }
  e.preventDefault();
  if (current === 1 && carousel.step(dir)) return;
  go(current + dir, true);
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if (!a) return;
  e.preventDefault();
  go(+a.dataset.go, e.detail === 0);
});

addEventListener('hashchange', () => {
  const i = screens.findIndex((s) => location.hash === '#' + s.id);
  go(i < 0 ? 0 : i);
});

addEventListener('resize', () => {
  buildWarp();
  space.calm = calmRects(screens[current]);
});

/* ---------------- boot + frame loop ---------------- */

screens.forEach((s, i) => {
  s.classList.toggle('is-active', i === current);
  s.inert = i !== current;
});
space.setGalaxy(current);
if (current === 1) carousel.enter(false);
document.fonts.ready.then(() => (space.calm = calmRects(screens[current])));
space.calm = calmRects(screens[current]);
arrive(screens[current]);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  // 90-144Hz screens draw every other refresh (~60fps): the motion is tuned for 60, so the extra
  // frames would only double the cost
  if (now - last < 12) return;
  const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000;
  last = now;
  if (introAt) {
    const p = Math.min(1, (now - introAt) / 1800);
    space.fx.zoom = 0.55 + 0.45 * easeOutExpo(p);
    if (p >= 1) introAt = 0;
  }
  if (tr) stepTransition(now);
  const visible = (i) => current === i || (tr && (tr.to === i || tr.from === screens[i]));
  if (visible(1)) carousel.update(t, dt);
  if (visible(3)) flare(t * (reduce.matches ? 0.3 : 1));
  calc(now);
  space.render(now);
}
requestAnimationFrame(frame);
