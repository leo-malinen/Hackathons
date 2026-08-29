/* ==========================================================================
   The home hero: a proof sheet that opens up as the reader scrolls down.
   Drawn in code, not filmed. Scroll drives one progress value; the sheet and
   the caption bands both read from it. The loop rests when it converges and
   whenever the hero is off screen.
   ========================================================================== */

(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;

  var stage = hero.querySelector('.hero-stage');
  var sheet = hero.querySelector('.sheet');
  var cue = hero.querySelector('.hero-cue');
  var stateChip = hero.querySelector('.sheet-state');
  var bandEls = Array.prototype.slice.call(hero.querySelectorAll('.band'));

  /* --- Bands ---------------------------------------------------------------- */

  var bands = bandEls.map(function (el) {
    var r = (el.dataset.range || '0,1').split(',').map(parseFloat);
    return {
      el: el,
      a: r[0], b: r[1],
      ramp: el.dataset.ramp ? parseFloat(el.dataset.ramp) : 0,
      op: -1, k: -1, live: null
    };
  });

  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var smoothstep = function (p, e0, e1) {
    var t = clamp((p - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* --- Splitting the headlines, once, with a seeded generator ---------------- */

  function rng(seed) {
    var s = seed >>> 0;
    return function () { return (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  }

  function split(el, mode, spread) {
    if (!el || el.dataset.split) return;
    el.dataset.split = '1';
    var text = el.textContent.trim();
    var rand = rng(text.length * 7919 + 13);

    var sr = document.createElement('span');
    sr.className = 'vh';
    sr.textContent = text;

    var vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');

    var words = text.split(/(\s+)/);
    var charIndex = 0;
    var totalChars = text.replace(/\s/g, '').length;

    words.forEach(function (w) {
      if (/^\s+$/.test(w)) { vis.appendChild(document.createTextNode(w)); return; }
      var ws = document.createElement('span');
      ws.className = 'w';
      if (mode === 'chars') {
        for (var i = 0; i < w.length; i++) {
          var cs = document.createElement('span');
          cs.className = 'c';
          cs.textContent = w[i];
          cs.style.setProperty('--th', (charIndex / Math.max(1, totalChars) * (spread || 0.5) + rand() * 0.06).toFixed(3));
          cs.style.setProperty('--jx', ((rand() * 2 - 1) * 34).toFixed(1) + 'px');
          ws.appendChild(cs);
          charIndex++;
        }
      } else {
        ws.textContent = w;
        ws.style.setProperty('--th', (rand() * (spread || 0.42)).toFixed(3));
      }
      vis.appendChild(ws);
    });

    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(vis);
  }

  split(hero.querySelector('.band-2 .beat'), 'words', 0.4);
  split(hero.querySelector('.band-3 .beat'), 'chars', 0.5);
  split(hero.querySelector('.band-4 .beat'), 'words', 0.34);

  /* --- The drive loop -------------------------------------------------------- */

  var target = 0, shown = 0, rafId = null, lastTick = 0, onScreen = true;
  var loadK = 0, loadStart = 0, loadDone = false;

  function heroProgress() {
    var range = hero.offsetHeight - window.innerHeight;
    if (range <= 0) return 0;
    return clamp(-hero.getBoundingClientRect().top / range, 0, 1);
  }

  var lastSheet = {};
  function writeVar(el, name, value, gate) {
    var key = name;
    if (lastSheet[key] !== undefined && Math.abs(lastSheet[key] - value) < gate) return;
    lastSheet[key] = value;
    el.style.setProperty(name, value.toFixed(4));
  }

  var lastChip = '', lastChipAt = 0;
  function chip(p, now) {
    if (!stateChip) return;
    var text = p < 0.18 ? 'as published'
      : p < 0.44 ? 'spacing opened'
      : p < 0.70 ? 'contrast lifted'
      : 'clear reading';
    if (now - lastChipAt < 100) return;    /* about 10Hz */
    if (text === lastChip) return;         /* and only when it truly changed */
    lastChip = text;
    lastChipAt = now;
    stateChip.textContent = text;
  }

  function paint(p, now) {
    /* the sheet's own transformation */
    var sp = smoothstep(p, 0.10, 0.80);
    writeVar(sheet, '--p', sp, 0.004);
    writeVar(sheet, '--ruler', smoothstep(p, 0.20, 0.30) * (1 - smoothstep(p, 0.93, 1)), 0.006);
    writeVar(sheet, '--noise', 1 - smoothstep(p, 0.40, 0.62), 0.006);
    writeVar(sheet, '--pl', smoothstep(p, 0.52, 0.70), 0.006);
    writeVar(sheet, '--m', smoothstep(p, 0.70, 0.95), 0.006);
    if (cue) writeVar(cue, '--cue', 1 - smoothstep(p, 0.005, 0.05), 0.01);
    chip(p, now);

    /* the caption bands */
    for (var i = 0; i < bands.length; i++) {
      var bd = bands[i];
      var f = Math.min(0.02, (bd.b - bd.a) / 3);
      var inEase = i === 0 ? 1 : smoothstep(p, bd.a, bd.a + f);
      var outEase = i === bands.length - 1 ? 1 : (1 - smoothstep(p, bd.b - f, bd.b));
      var op = inEase * outEase;

      var ramp = bd.ramp || Math.min(0.025, (bd.b - bd.a) * 0.35);
      var k = clamp((p - bd.a) / ramp, 0, 1);
      if (i === 0) k = Math.max(k, loadK);

      if (Math.abs(op - bd.op) >= 0.004) {
        bd.op = op;
        bd.el.style.opacity = op.toFixed(3);
      }
      /* A faded band still holds real links. Without inert, a keyboard lands
         on a button nobody can see. */
      var live = op > 0.55;
      if (live !== bd.live) {
        bd.live = live;
        bd.el.style.pointerEvents = live ? 'auto' : 'none';
        bd.el.inert = !live;
      }
      if (Math.abs(k - bd.k) >= 0.008 || (k === 1 && bd.k !== 1) || (k === 0 && bd.k !== 0)) {
        bd.k = k;
        bd.el.style.setProperty('--k', k.toFixed(3));
      }
    }
  }

  function tick(now) {
    var dt = Math.min(100, now - (lastTick || now));
    lastTick = now;

    if (!loadDone) {
      if (!loadStart) loadStart = now;
      loadK = clamp((now - loadStart) / 620, 0, 1);
      if (loadK >= 1) loadDone = true;
    }

    var k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));

    var settled = Math.abs(target - shown) < 0.0005;
    if (settled) { shown = target; }

    paint(shown, now);

    if (settled && loadDone) { rafId = null; lastTick = 0; return; }
    rafId = requestAnimationFrame(tick);
  }

  function drive() {
    if (rafId === null && onScreen) { rafId = requestAnimationFrame(tick); }
  }

  function onScroll() {
    target = heroProgress();
    drive();
  }

  /* --- The static-hero gate, decided live ------------------------------------ */
  /* Deviation from the default, declared in the design package: phones keep a
     shortened journey, because there is no heavy file to withhold. Reduced
     motion and a sideways phone with no room get the settled composition.
     The class is the only source of truth, so CSS and JS cannot disagree. */

  var GATES = [
    '(prefers-reduced-motion: reduce)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)'
  ];
  var MQLS = GATES.map(function (q) { return window.matchMedia(q); });

  var scrubOn = false;
  var io = null;

  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    hero.classList.remove('static');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    bands.forEach(function (b) { b.op = -1; b.k = -1; b.live = null; });
    lastSheet = {};
    lastChip = '';
    loadK = 0; loadStart = 0; loadDone = false;
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) drive();
        else if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
      }, { threshold: 0 });
      io.observe(hero);
    }
    onScroll();
  }

  function disableScrub() {
    if (!scrubOn) {
      hero.classList.add('static');
      pinStatic();
      return;
    }
    scrubOn = false;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
    hero.classList.add('static');
    pinStatic();
  }

  function pinStatic() {
    bands.forEach(function (b, i) {
      b.el.style.opacity = i === 0 ? '1' : '0';
      b.el.style.setProperty('--k', '1');
      b.el.style.pointerEvents = i === 0 ? 'auto' : 'none';
      b.el.inert = i !== 0;
      b.op = -1; b.k = -1; b.live = i === 0;
    });
    sheet.style.setProperty('--p', '1');
    sheet.style.setProperty('--ruler', '0');
    sheet.style.setProperty('--noise', '0');
    sheet.style.setProperty('--pl', '1');
    sheet.style.setProperty('--m', '1');
    if (stateChip) stateChip.textContent = 'clear reading';
    lastSheet = {};
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onScroll, 120);
  }

  function applyHeroMode() {
    if (MQLS.some(function (m) { return m.matches; })) disableScrub();
    else enableScrub();
  }

  MQLS.forEach(function (m) { m.addEventListener('change', applyHeroMode); });

  document.addEventListener('site:pin', function () { disableScrub(); });
  document.addEventListener('site:unpin', function () { applyHeroMode(); });

  applyHeroMode();
})();
