/* ============================================================
   CANVAS VISUALS \u2014 no chart library, all hand-drawn.
   Radar (Business DNA), arc gauges (Pulse + Health Score),
   opportunity heatmap grid, animated shockwave field.
   ============================================================ */

/* MaterialM palette (matches styles.css tokens). Theme-aware: the ink colours
   flip when <html data-theme="dark"> so canvases stay legible either way. */
const C = {
  blue:'#00a1ff', green:'#36c96c', orange:'#f8c20a', red:'#FF6692',
  purple:'#16CDC7', text:'#1F2A3D', dim:'rgba(152,164,174,.95)',
  grid:'rgba(224,230,235,.95)', surface:'#EFF4FA'
};

function syncChartTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  C.text    = dark ? '#FFFFFF' : '#1F2A3D';
  C.dim     = dark ? 'rgba(255,255,255,.55)' : 'rgba(152,164,174,.95)';
  C.grid    = dark ? 'rgba(255,255,255,.12)' : 'rgba(224,230,235,.95)';
  C.surface = dark ? '#2A3851' : '#EFF4FA';
}
syncChartTheme();

function hidpi(cv, w, h) {
  const r = window.devicePixelRatio || 1;
  cv.width = w * r; cv.height = h * r;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(r, 0, 0, r, 0, 0);
  return g;
}

function scoreColor(v) {
  if (v >= 75) return C.green;
  if (v >= 50) return C.blue;
  if (v >= 35) return C.orange;
  return C.red;
}

/* ---------- ARC GAUGE (City Pulse + Health Score) ---------- */
function drawGauge(cv, size, value, opts = {}) {
  const g = hidpi(cv, size, size);
  const cx = size / 2, cy = size / 2;
  const lw = opts.lw || Math.max(7, size * 0.075);
  const r = size / 2 - lw / 2 - 4;
  const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
  const col = opts.color || scoreColor(value);

  g.clearRect(0, 0, size, size);
  g.lineCap = 'round';

  g.beginPath();
  g.arc(cx, cy, r, start, start + sweep);
  g.strokeStyle = 'rgba(255,255,255,.09)';
  g.lineWidth = lw;
  g.stroke();

  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, col);
  grad.addColorStop(1, opts.color2 || col);

  g.beginPath();
  g.arc(cx, cy, r, start, start + sweep * (Math.max(0, Math.min(100, value)) / 100));
  g.strokeStyle = grad;
  g.lineWidth = lw;
  g.shadowColor = col; g.shadowBlur = 14;
  g.stroke();
  g.shadowBlur = 0;

  if (opts.ticks !== false) {
    for (let i = 0; i <= 10; i++) {
      const a = start + sweep * (i / 10);
      const r1 = r - lw / 2 - 5, r2 = r - lw / 2 - (i % 5 === 0 ? 11 : 8);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.strokeStyle = 'rgba(255,255,255,.16)';
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
}

function animateGauge(cv, size, target, opts = {}) {
  const dur = 900, t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { drawGauge(cv, size, target, opts); if (opts.onTick) opts.onTick(target); return; }
  (function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = target * e;
    drawGauge(cv, size, v, opts);
    if (opts.onTick) opts.onTick(Math.round(v));
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}

/* ---------- RADAR (Business DNA) ---------- */
function drawRadar(cv, size, dna, progress = 1) {
  const g = hidpi(cv, size, size);
  const keys = Object.keys(dna);
  const n = keys.length;
  const cx = size / 2, cy = size / 2 + 4;
  const R = size / 2 - 54;

  g.clearRect(0, 0, size, size);
  const ang = i => -Math.PI / 2 + (i / n) * Math.PI * 2;

  // rings
  for (let ring = 1; ring <= 4; ring++) {
    const rr = R * (ring / 4);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = ang(i);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.strokeStyle = ring === 4 ? 'rgba(255,255,255,.18)' : C.grid;
    g.lineWidth = 1;
    g.stroke();
  }

  // spokes
  for (let i = 0; i < n; i++) {
    const a = ang(i);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.strokeStyle = C.grid;
    g.stroke();
  }

  // polygon
  g.beginPath();
  keys.forEach((k, i) => {
    const a = ang(i);
    const v = (dna[k] / 100) * R * progress;
    const x = cx + Math.cos(a) * v, y = cy + Math.sin(a) * v;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.closePath();
  const fill = g.createRadialGradient(cx, cy, 6, cx, cy, R);
  fill.addColorStop(0, 'rgba(94,159,232,.42)');
  fill.addColorStop(1, 'rgba(191,142,218,.16)');
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = C.blue;
  g.lineWidth = 2;
  g.shadowColor = C.blue; g.shadowBlur = 10;
  g.stroke();
  g.shadowBlur = 0;

  // vertices
  keys.forEach((k, i) => {
    const a = ang(i);
    const v = (dna[k] / 100) * R * progress;
    g.beginPath();
    g.arc(cx + Math.cos(a) * v, cy + Math.sin(a) * v, 3.2, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
  });

  // labels
  const ABBR = { 'Growth':'GROWTH', 'Stability':'STABILITY', 'Competition':'COMPETE',
                 'Innovation':'INNOV', 'Community Trust':'TRUST', 'Expansion Potential':'EXPAND' };
  g.font = '600 9.5px Menlo, Consolas, monospace';
  g.fillStyle = C.dim;
  g.textBaseline = 'middle';
  keys.forEach((k, i) => {
    const a = ang(i);
    const lx = cx + Math.cos(a) * (R + 17), ly = cy + Math.sin(a) * (R + 15);
    const align = Math.abs(Math.cos(a)) < 0.3 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
    g.textAlign = align;
    const label = ABBR[k] || k.toUpperCase();
    // keep the label inside the canvas box
    const w = g.measureText(label).width;
    let x = lx;
    if (align === 'left')  x = Math.min(lx, size - 3 - w);
    if (align === 'right') x = Math.max(lx, 3 + w);
    if (align === 'center') x = Math.max(w / 2 + 3, Math.min(lx, size - 3 - w / 2));
    g.fillText(label, x, ly);
  });
}

function animateRadar(cv, size, dna) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return drawRadar(cv, size, dna, 1);
  const t0 = performance.now(), dur = 800;
  (function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    drawRadar(cv, size, dna, 1 - Math.pow(1 - p, 3));
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}

/* ---------- OPPORTUNITY HEATMAP ---------- */
const HEAT = { cols: 9, rows: 6, cell: 96, pad: 14, hot: null, sel: null };

function heatColor(score, alpha = 1) {
  let base;
  if (score >= 70) base = [114, 188, 143];
  else if (score >= 45) base = [222, 146, 85];
  else base = [233, 115, 102];
  const k = 0.35 + (Math.abs(score - 50) / 100);
  return `rgba(${base[0]},${base[1]},${base[2]},${alpha * Math.min(1, k + 0.25)})`;
}

function drawHeatmap(cv, category) {
  const W = HEAT.cols * HEAT.cell + HEAT.pad * 2;
  const H = HEAT.rows * HEAT.cell + HEAT.pad * 2;
  cv.dataset.w = W; cv.dataset.h = H;
  const g = hidpi(cv, W, H);

  g.fillStyle = '#141416';
  g.fillRect(0, 0, W, H);

  // street grid
  g.strokeStyle = 'rgba(255,255,255,.05)';
  g.lineWidth = 1;
  for (let c = 0; c <= HEAT.cols; c++) {
    g.beginPath();
    g.moveTo(HEAT.pad + c * HEAT.cell, HEAT.pad);
    g.lineTo(HEAT.pad + c * HEAT.cell, H - HEAT.pad);
    g.stroke();
  }
  for (let r = 0; r <= HEAT.rows; r++) {
    g.beginPath();
    g.moveTo(HEAT.pad, HEAT.pad + r * HEAT.cell);
    g.lineTo(W - HEAT.pad, HEAT.pad + r * HEAT.cell);
    g.stroke();
  }

  DISTRICTS.forEach(d => {
    const score = districtScore(d, category);
    const x = HEAT.pad + d.x * HEAT.cell + 4;
    const y = HEAT.pad + d.y * HEAT.cell + 4;
    const w = d.w * HEAT.cell - 8;
    const h = d.h * HEAT.cell - 8;
    const isHot = HEAT.hot === d.id, isSel = HEAT.sel === d.id;

    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, 8); else g.rect(x, y, w, h);
    g.fillStyle = heatColor(score, isHot || isSel ? 0.42 : 0.26);
    g.fill();
    g.strokeStyle = isSel ? '#FFFFFF' : (isHot ? 'rgba(255,255,255,.55)' : heatColor(score, 0.85));
    g.lineWidth = isSel ? 2 : 1.4;
    g.stroke();

    g.fillStyle = '#FFFFFF';
    g.font = '600 13px -apple-system, Segoe UI, Roboto, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(d.name, x + 12, y + 11);

    g.font = '600 26px Menlo, Consolas, monospace';
    g.fillStyle = heatColor(score, 1);
    g.fillText(String(score), x + 12, y + 31);

    g.font = '10px Menlo, Consolas, monospace';
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.fillText(d.saturation.toUpperCase() + ' DENSITY', x + 12, y + h - 22);
  });

  return { W, H };
}

/* Category shifts the base district score deterministically. */
function districtScore(d, category) {
  const bias = {
    'Coffee shop': { downtown:-14, north:6,  berryessa:8,  santana:-6 },
    'Restaurant':  { willow:5,    downtown:-6, north:4,    alumrock:-4 },
    'Pharmacy':    { japantown:14, alumrock:9, westgate:6, santana:-10 },
    'Gym':         { westgate:12, north:8,   berryessa:5,  downtown:-3 },
    'Grocery':     { north:-8,    japantown:-6, willow:4,  westgate:7 },
    'Bakery':      { willow:9,    japantown:5, downtown:-8, santana:-4 }
  }[category] || {};
  return Math.max(4, Math.min(99, d.score + (bias[d.id] || 0)));
}

function heatHitTest(cv, evt) {
  const rect = cv.getBoundingClientRect();
  const W = Number(cv.dataset.w), H = Number(cv.dataset.h);
  const px = (evt.clientX - rect.left) * (W / rect.width);
  const py = (evt.clientY - rect.top) * (H / rect.height);
  return DISTRICTS.find(d => {
    const x = HEAT.pad + d.x * HEAT.cell, y = HEAT.pad + d.y * HEAT.cell;
    return px >= x && px <= x + d.w * HEAT.cell && py >= y && py <= y + d.h * HEAT.cell;
  }) || null;
}

/* ---------- SHOCKWAVE FIELD ---------- */
let shockRAF = null;
function runShockwave(cv, labels) {
  cancelAnimationFrame(shockRAF);
  const W = 760, H = 420;
  const g = hidpi(cv, W, H);
  const cx = W / 2, cy = H / 2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nodes = labels.slice(0, 6).map((l, i, arr) => {
    const a = -Math.PI / 2 + (i / arr.length) * Math.PI * 2;
    const rad = 148;
    return { label: l, x: cx + Math.cos(a) * rad * 1.42, y: cy + Math.sin(a) * rad * 0.82, delay: i * 260 };
  });

  const t0 = performance.now();
  const DUR = reduce ? 0 : 3600;

  function frame(now) {
    const t = now - t0;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#1A1A1C';
    g.fillRect(0, 0, W, H);

    // faint grid
    g.strokeStyle = 'rgba(255,255,255,.04)';
    for (let x = 0; x < W; x += 38) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 38) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    // expanding rings
    for (let i = 0; i < 3; i++) {
      const phase = ((t / 1500) + i / 3) % 1;
      const r = phase * 300;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.strokeStyle = `rgba(94,159,232,${(1 - phase) * 0.5})`;
      g.lineWidth = 2;
      g.stroke();
    }

    // links + nodes
    nodes.forEach(nd => {
      const local = Math.max(0, Math.min(1, (t - nd.delay) / 700));
      if (local <= 0) return;
      const ease = 1 - Math.pow(1 - local, 3);
      const x = cx + (nd.x - cx) * ease, y = cy + (nd.y - cy) * ease;

      g.beginPath();
      g.moveTo(cx, cy); g.lineTo(x, y);
      g.strokeStyle = `rgba(94,159,232,${0.16 + 0.34 * ease})`;
      g.lineWidth = 1.5;
      g.stroke();

      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fillStyle = C.blue;
      g.shadowColor = C.blue; g.shadowBlur = 12 * ease;
      g.fill();
      g.shadowBlur = 0;

      g.font = '600 11px Menlo, Consolas, monospace';
      g.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * ease})`;
      g.textAlign = x > cx ? 'left' : 'right';
      g.textBaseline = 'middle';
      const txt = nd.label.length > 30 ? nd.label.slice(0, 29) + '\u2026' : nd.label;
      g.fillText(txt, x + (x > cx ? 13 : -13), y);
    });

    // epicentre
    const pulse = 1 + Math.sin(t / 260) * 0.12;
    g.beginPath();
    g.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
    g.fillStyle = '#FFFFFF';
    g.shadowColor = '#FFFFFF'; g.shadowBlur = 18;
    g.fill();
    g.shadowBlur = 0;
    g.font = '700 10px Menlo, Consolas, monospace';
    g.fillStyle = '#0E0E0F';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EVT', cx, cy);

    if (t < DUR + 900) shockRAF = requestAnimationFrame(frame);
  }
  frame(t0);
}
