/* ============================================================
   BRIDGE - the hero. Two financial futures, drawn by scroll.
   The journey is a scrubbed SVG, so the page tells the data
   story rather than playing atmosphere over it.
   ============================================================ */
(function () {
  'use strict';

  var track = document.querySelector('.hero-track');
  if (!track) return;

  var stage = track.querySelector('.hero-stage');
  var art = track.querySelector('.hero-art');
  var caps = Array.prototype.slice.call(track.querySelectorAll('.band-cap'));
  var cue = track.querySelector('.cue');
  var scene = art ? art.querySelector('.scene') : null;

  var pathOut = art ? art.querySelector('.trace-out') : null;
  var pathIn = art ? art.querySelector('.trace-in') : null;
  var pathBase = art ? art.querySelector('.trace-base') : null;
  var gapFill = art ? art.querySelector('.gap-fill') : null;
  var shock = art ? art.querySelector('.shock-group') : null;
  var nodesOut = art ? Array.prototype.slice.call(art.querySelectorAll('.node-out')) : [];
  var nodesIn = art ? Array.prototype.slice.call(art.querySelectorAll('.node-in')) : [];

  /* ---------- the five static-hero gates, character for character ---------- */
  var GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  var MQLS = GATES.map(function (q) { return window.matchMedia(q); });

  /* ---------- seeded randomness, so every load looks identical ---------- */
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------- split headlines into word and character spans ---------- */
  function split(el, mode, spread) {
    if (el.dataset.split === 'done') return;
    var text = el.textContent.trim();
    var words = text.split(/\s+/);
    var r = rng(text.length * 977 + words.length * 31 + 7);
    var totalChars = text.replace(/\s/g, '').length;

    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;

    var vis = document.createElement('span');
    vis.className = 'st';
    vis.setAttribute('aria-hidden', 'true');

    var ci = 0;
    words.forEach(function (w, wi) {
      var ws = document.createElement('span');
      ws.className = 'w';
      if (el.dataset.em && el.dataset.em.split(',').indexOf(String(wi)) > -1) ws.classList.add('em');
      if (mode === 'word' || mode === 'rise' || mode === 'drift') {
        ws.style.setProperty('--th', (wi / Math.max(1, words.length) * (spread || 0.5)).toFixed(3));
      }
      for (var i = 0; i < w.length; i++) {
        var cs = document.createElement('span');
        cs.className = 'c';
        cs.textContent = w[i];
        if (mode === 'scatter') {
          cs.style.setProperty('--th', (r() * 0.5).toFixed(3));
          cs.style.setProperty('--jx', ((r() - 0.5) * 130).toFixed(1) + 'px');
          cs.style.setProperty('--jy', ((r() - 0.5) * 110).toFixed(1) + 'px');
          cs.style.setProperty('--jr', ((r() - 0.5) * 44).toFixed(1) + 'deg');
        } else if (mode === 'grid') {
          cs.style.setProperty('--th', (ci / Math.max(1, totalChars) * (spread || 0.55) + r() * 0.06).toFixed(3));
          cs.style.setProperty('--jx', ((r() - 0.5) * 90).toFixed(1) + 'px');
        }
        ci++;
        ws.appendChild(cs);
      }
      vis.appendChild(ws);
    });

    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(vis);
    el.dataset.split = 'done';
  }

  var bands = caps.map(function (el) {
    var target = el.querySelector('[data-split]');
    if (target) {
      split(target, target.getAttribute('data-split'), parseFloat(target.getAttribute('data-spread') || '0.5'));
    }
    return {
      el: el,
      scrim: el.querySelector('.band-scrim'),
      from: parseFloat(el.getAttribute('data-from')),
      to: parseFloat(el.getAttribute('data-to')),
      ramp: parseFloat(el.getAttribute('data-ramp') || '0'),
      op: -1,
      k: -1
    };
  });

  /* ---------- path lengths ---------- */
  function lenOf(p) { return (p && p.getTotalLength) ? p.getTotalLength() : 0; }
  var LB = lenOf(pathBase), LO = lenOf(pathOut), LI = lenOf(pathIn);
  [[pathBase, LB], [pathOut, LO], [pathIn, LI]].forEach(function (pair) {
    if (!pair[0]) return;
    pair[0].style.strokeDasharray = pair[1].toFixed(1);
    pair[0].style.strokeDashoffset = pair[1].toFixed(1);
  });

  /* ---------- scene beats ---------- */
  function seg(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }

  var lastPaint = {};
  function setStyle(el, prop, val) {
    if (!el) return;
    var key = (el.__id || (el.__id = Math.random())) + prop;
    if (lastPaint[key] === val) return;
    lastPaint[key] = val;
    el.style.setProperty(prop, val);
  }

  function paintScene(p) {
    var kBase = seg(p, 0.02, 0.20);
    var kShock = seg(p, 0.20, 0.30);
    var kOut = seg(p, 0.32, 0.66);
    var kIn = seg(p, 0.62, 0.94);

    if (pathBase) setStyle(pathBase, 'stroke-dashoffset', (LB * (1 - kBase)).toFixed(1));
    if (shock) setStyle(shock, 'opacity', kShock.toFixed(3));
    if (pathOut) setStyle(pathOut, 'stroke-dashoffset', (LO * (1 - kOut)).toFixed(1));
    if (pathIn) setStyle(pathIn, 'stroke-dashoffset', (LI * (1 - kIn)).toFixed(1));
    if (gapFill) setStyle(gapFill, 'opacity', (Math.min(kOut, kIn) * 0.95).toFixed(3));

    nodesOut.forEach(function (n, i) {
      n.classList.toggle('lit', kOut > (i + 0.7) / (nodesOut.length + 0.2));
    });
    nodesIn.forEach(function (n, i) {
      n.classList.toggle('lit', kIn > (i + 0.7) / (nodesIn.length + 0.2));
    });

    /* the camera settles: a slow push in, then rest */
    if (scene) {
      var push = 1 + seg(p, 0, 0.9) * 0.07;
      var lift = -seg(p, 0.55, 1) * 22;
      setStyle(scene, 'transform', 'translate(0,' + lift.toFixed(1) + 'px) scale(' + push.toFixed(4) + ')');
    }
    if (cue) setStyle(cue, '--cue', (1 - seg(p, 0.02, 0.10)).toFixed(3));
  }

  /* ---------- captions ---------- */
  var loadK = 0, loadStart = 0;
  function paintBands(p) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var fadeIn = 0.022, fadeOut = 0.03;
      var op;
      if (p < b.from - fadeIn || p > b.to + fadeOut) op = 0;
      else if (p < b.from) op = (p - (b.from - fadeIn)) / fadeIn;
      else if (p > b.to) op = 1 - (p - b.to) / fadeOut;
      else op = 1;
      if (i === 0 && p <= b.to) op = Math.max(op, 1);
      op = Math.max(0, Math.min(1, op));

      var ramp = b.ramp || Math.min(0.028, (b.to - b.from) * 0.42);
      var k = Math.max(0, Math.min(1, (p - b.from) / ramp));
      if (i === 0) k = Math.max(k, loadK);

      if (Math.abs(op - b.op) > 0.004) {
        b.op = op;
        b.el.style.setProperty('--op', op.toFixed(3));
        if (b.scrim) b.scrim.style.setProperty('--op', op.toFixed(3));
        b.el.style.visibility = op < 0.004 ? 'hidden' : 'visible';
      }
      if (Math.abs(k - b.k) > 0.008) {
        b.k = k;
        b.el.style.setProperty('--k', k.toFixed(3));
      }
    }
  }

  /* ---------- the drive ---------- */
  var scrubOn = false, rafId = null, queued = false;

  function heroProgress() {
    var r = track.getBoundingClientRect();
    var span = Math.max(1, track.offsetHeight - window.innerHeight);
    return Math.max(0, Math.min(1, -r.top / span));
  }

  function paint() {
    var p = heroProgress();
    paintScene(p);
    paintBands(p);
    rafId = null; queued = false;
    if (loadK < 1) {
      loadK = Math.min(1, (performance.now() - loadStart) / 900);
      onScroll();
    }
  }
  function onScroll() {
    if (queued) return;
    queued = true;
    rafId = requestAnimationFrame(paint);
  }

  function pinFinal() {
    /* every drawn thing shown finished, no drive running */
    [[pathBase, LB], [pathOut, LO], [pathIn, LI]].forEach(function (pair) {
      if (pair[0]) pair[0].style.strokeDashoffset = '0';
    });
    if (gapFill) gapFill.style.opacity = '0.95';
    if (shock) shock.style.opacity = '1';
    nodesOut.concat(nodesIn).forEach(function (n) { n.classList.add('lit'); });
    if (scene) scene.style.transform = 'none';
  }

  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    loadK = 0; loadStart = performance.now();
    lastPaint = {};
    bands.forEach(function (b) { b.op = -1; b.k = -1; });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    queued = false;
    pinFinal();
  }
  function applyHeroMode() {
    var gated = MQLS.some(function (m) { return m.matches; });
    if (gated) disableScrub(); else enableScrub();
  }

  MQLS.forEach(function (m) { m.addEventListener('change', applyHeroMode); });
  applyHeroMode();

  /* the static hero art draws itself once, no scroll needed */
  var staticArt = document.querySelector('.hero-static .hero-art');
  if (staticArt) {
    staticArt.querySelectorAll('.trace').forEach(function (p) { p.style.strokeDashoffset = '0'; });
    staticArt.querySelectorAll('.node').forEach(function (n) { n.classList.add('lit'); });
  }

  window.BridgeOnMotionChange = function () { applyHeroMode(); };
})();
