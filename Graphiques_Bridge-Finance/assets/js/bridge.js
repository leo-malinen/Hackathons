/* ============================================================
   BRIDGE - shared behaviour
   Vanilla JS. No framework, no build step.
   ============================================================ */
(function () {
  'use strict';

  var reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reduceQ.matches;

  /* ---------- page in ---------- */
  function ready() { document.body.classList.add('ready'); }
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready);
  setTimeout(ready, 1200); // never leave the page invisible

  /* ============================================================
     Navigation: five grouped chapters, each with a small menu.
     Hover opens on a real pointer, click works everywhere, and the
     keyboard drives it without a mouse.
     ============================================================ */
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.navtoggle');
  var groups = Array.prototype.slice.call(document.querySelectorAll('.navgroup'));

  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  function stacked() { return window.matchMedia('(max-width: 960px)').matches; }

  function closeGroup(g) {
    if (!g.classList.contains('open')) return;
    g.classList.remove('open');
    g.querySelector('.navtrigger').setAttribute('aria-expanded', 'false');
  }
  function closeAll(except) {
    groups.forEach(function (g) { if (g !== except) closeGroup(g); });
  }
  function openGroup(g) {
    closeAll(g);
    if (g.classList.contains('open')) return;
    g.classList.add('open');
    g.querySelector('.navtrigger').setAttribute('aria-expanded', 'true');
  }

  groups.forEach(function (g) {
    var trigger = g.querySelector('.navtrigger');
    var links = Array.prototype.slice.call(g.querySelectorAll('.navmenu a'));
    var leaveTimer = null;

    trigger.addEventListener('click', function () {
      if (g.classList.contains('open')) closeGroup(g); else openGroup(g);
    });

    /* pointer: open on approach, close on leave with a moment of grace */
    g.addEventListener('mouseenter', function () {
      if (!canHover.matches || stacked()) return;
      clearTimeout(leaveTimer);
      openGroup(g);
    });
    g.addEventListener('mouseleave', function () {
      if (!canHover.matches || stacked()) return;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(function () { closeGroup(g); }, 170);
    });

    /* keyboard */
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || (e.key === 'Enter' && !g.classList.contains('open'))) {
        e.preventDefault();
        openGroup(g);
        if (links[0]) links[0].focus();
      } else if (e.key === 'Escape') {
        closeGroup(g);
      }
    });
    links.forEach(function (a, i) {
      a.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); (links[i + 1] || links[0]).focus(); }
        else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (i === 0) trigger.focus(); else links[i - 1].focus();
        } else if (e.key === 'Escape') { e.preventDefault(); closeGroup(g); trigger.focus(); }
      });
    });

    /* tabbing out of the group closes it */
    g.addEventListener('focusout', function (e) {
      if (!g.contains(e.relatedTarget)) closeGroup(g);
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.navgroup')) closeAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var overlay = document.getElementById('judge');
    if (overlay && overlay.classList.contains('on')) return;
    closeAll(null);
  });

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) closeAll(null);
    });
    nav.querySelectorAll('.navmenu a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* switching between the stacked panel and the bar leaves nothing half open */
  window.addEventListener('resize', function () {
    if (!stacked() && nav) {
      nav.classList.remove('open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
    closeAll(null);
  });

  /* ---------- entrances ---------- */
  var revealed = [];
  function markIn(el) {
    el.classList.add('in');
    if (el.classList.contains('stag')) {
      setTimeout(function () { el.classList.add('done'); }, 1500);
    }
  }
  var targets = document.querySelectorAll('.rev, .stag');
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach(markIn);
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { markIn(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    targets.forEach(function (t) { revealed.push(t); io.observe(t); });

    /* failsafe: if the observer never reports, nothing on screen stays hidden */
    setTimeout(function sweep() {
      revealed.forEach(function (t) {
        if (t.classList.contains('in')) return;
        if (t.getBoundingClientRect().top < window.innerHeight * 1.15) markIn(t);
      });
    }, 2600);
  }

  /* ---------- pause animation off-screen and on hidden tabs ---------- */
  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('paused', document.hidden);
  });

  /* ============================================================
     Scroll-driven drives. One rAF loop, only while it has work.
     ============================================================ */
  var drives = [];
  var rafId = null;
  var running = false;

  function addDrive(fn) { drives.push(fn); }

  function tick() {
    for (var i = 0; i < drives.length; i++) drives[i]();
    rafId = null;
    running = false;
  }
  function schedule() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }

  /* how far an element has travelled through the viewport, 0 to 1 */
  function progressOf(el, startAt, endAt) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || 1;
    var s = (startAt === undefined) ? 0.92 : startAt;
    var e = (endAt === undefined) ? 0.32 : endAt;
    var p = (vh * s - r.top) / Math.max(1, (vh * (s - e) + r.height));
    return Math.max(0, Math.min(1, p));
  }

  /* ---------- the signature: span rules draw themselves ---------- */
  document.querySelectorAll('.span-rule').forEach(function (svg) {
    var deck = svg.querySelector('.deck');
    if (deck && deck.getTotalLength) {
      var len = deck.getTotalLength();
      svg.style.setProperty('--len', len.toFixed(1));
    }
    if (reduced) { svg.style.setProperty('--draw', '1'); return; }
    var last = -1;
    addDrive(function () {
      var p = progressOf(svg, 1.0, 0.55);
      if (Math.abs(p - last) < 0.008) return;
      last = p;
      svg.style.setProperty('--draw', p.toFixed(3));
    });
  });

  /* ---------- timelines draw themselves ---------- */
  document.querySelectorAll('.tl').forEach(function (tl) {
    var items = Array.prototype.slice.call(tl.querySelectorAll('.tl-item'));
    if (reduced) {
      tl.style.setProperty('--draw', '1');
      items.forEach(function (i) { i.classList.add('lit'); });
      return;
    }
    var last = -1;
    addDrive(function () {
      var p = progressOf(tl, 0.88, 0.42);
      if (Math.abs(p - last) < 0.006) return;
      last = p;
      tl.style.setProperty('--draw', p.toFixed(3));
      var n = Math.round(p * items.length);
      items.forEach(function (item, i) { item.classList.toggle('lit', i < n); });
    });
  });

  /* ---------- step rails fill as they pass ---------- */
  document.querySelectorAll('.rail').forEach(function (rail) {
    var items = Array.prototype.slice.call(rail.querySelectorAll('.rail-item'));
    if (reduced) { items.forEach(function (i) { i.style.setProperty('--fill', '1'); }); return; }
    var last = -1;
    addDrive(function () {
      var p = progressOf(rail, 0.94, 0.5);
      if (Math.abs(p - last) < 0.008) return;
      last = p;
      items.forEach(function (item, i) {
        var local = Math.max(0, Math.min(1, p * items.length - i));
        item.style.setProperty('--fill', local.toFixed(3));
      });
    });
  });

  /* ---------- fund flow lights up in sequence ---------- */
  document.querySelectorAll('.flow-out').forEach(function (row) {
    var steps = Array.prototype.slice.call(row.querySelectorAll('.flow-step'));
    if (reduced) { steps.forEach(function (s) { s.classList.add('on'); }); return; }
    var last = -1;
    addDrive(function () {
      var p = progressOf(row, 0.9, 0.5);
      if (Math.abs(p - last) < 0.01) return;
      last = p;
      var n = Math.round(p * steps.length);
      steps.forEach(function (s, i) { s.classList.toggle('on', i < n); });
    });
  });

  /* ---------- counters ---------- */
  function fmt(n, kind) {
    if (kind === 'money') return '$' + Math.round(n).toLocaleString('en-US');
    if (kind === 'pct') return Math.round(n) + '%';
    return Math.round(n).toLocaleString('en-US');
  }
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var to = parseFloat(el.getAttribute('data-count'));
    var kind = el.getAttribute('data-kind') || 'plain';
    if (reduced || !('IntersectionObserver' in window)) { el.textContent = fmt(to, kind); return; }
    el.textContent = fmt(0, kind);
    var seen = false;
    var ob = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting || seen) return;
        seen = true; ob.disconnect();
        var t0 = performance.now(), dur = 1250;
        (function step(now) {
          var k = Math.min(1, (now - t0) / dur);
          var eased = 1 - Math.pow(1 - k, 3);
          el.textContent = fmt(to * eased, kind);
          if (k < 1) requestAnimationFrame(step);
        })(performance.now());
      });
    }, { threshold: 0.4 });
    ob.observe(el);
  });

  /* ---------- bars and rings that fill on entry ---------- */
  function fillOnEntry(el, apply) {
    if (reduced || !('IntersectionObserver' in window)) { apply(); return; }
    var ob = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { apply(); ob.disconnect(); }
      });
    }, { threshold: 0.3 });
    ob.observe(el);
  }
  document.querySelectorAll('[data-fill]').forEach(function (el) {
    var pct = parseFloat(el.getAttribute('data-fill'));
    fillOnEntry(el, function () { el.style.width = Math.max(0, Math.min(100, pct)) + '%'; });
  });
  document.querySelectorAll('.ring').forEach(function (ring) {
    var fg = ring.querySelector('.fg');
    /* rings driven by a page script own themselves; skip them here */
    if (!fg || !ring.hasAttribute('data-pct')) return;
    var r = parseFloat(fg.getAttribute('r'));
    var c = 2 * Math.PI * r;
    ring.style.setProperty('--c', c.toFixed(1));
    fg.style.strokeDasharray = c.toFixed(1);
    fg.style.strokeDashoffset = c.toFixed(1);
    var pct = parseFloat(ring.getAttribute('data-pct') || '0') / 100;
    fillOnEntry(ring, function () {
      fg.style.strokeDashoffset = (c * (1 - Math.max(0, Math.min(1, pct)))).toFixed(1);
    });
  });

  /* ---------- the one interactive moment: hold to span the gap ---------- */
  (function holdMoment() {
    var btn = document.querySelector('.hold-btn');
    var art = document.querySelector('.hold-art');
    if (!btn || !art) return;

    var deck = art.querySelector('.hold-deck');
    if (deck && deck.getTotalLength) art.style.setProperty('--dlen', deck.getTotalLength().toFixed(1));

    var steps = Array.prototype.slice.call(document.querySelectorAll('.hold-steps li'));
    var p = 0, holding = false, raf = null, last = 0;
    var label = btn.querySelector('span');
    var restLabel = label ? label.textContent : '';

    function paint() {
      art.style.setProperty('--p', p.toFixed(3));
      btn.style.setProperty('--p', p.toFixed(3));
      var n = Math.round(p * steps.length);
      steps.forEach(function (s, i) { s.classList.toggle('lit', i < n); });
      var done = p >= 0.999;
      btn.classList.toggle('done', done);
      if (label) label.textContent = done ? 'The gap is spanned. Release to replay.' : restLabel;
      btn.setAttribute('aria-valuenow', Math.round(p * 100));
    }

    function loop(now) {
      var dt = Math.min(64, now - last) / 1000; last = now;
      p += (holding ? 0.62 : -0.9) * dt;
      p = Math.max(0, Math.min(1, p));
      paint();
      if ((holding && p < 1) || (!holding && p > 0)) raf = requestAnimationFrame(loop);
      else raf = null;
    }
    function start(e) {
      if (e && e.cancelable) e.preventDefault();
      if (reduced) { p = 1; paint(); return; }
      holding = true;
      if (raf === null) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }
    function stop() {
      holding = false;
      if (raf === null && p > 0) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }

    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
    });
    btn.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') stop();
    });
    btn.addEventListener('blur', stop);

    btn.setAttribute('role', 'slider');
    btn.setAttribute('aria-valuemin', '0');
    btn.setAttribute('aria-valuemax', '100');
    if (reduced) { p = 1; }
    paint();
  })();

  /* ============================================================
     JUDGE MODE - a guided 90 second walk through the concept
     ============================================================ */
  (function judgeMode() {
    var overlay = document.getElementById('judge');
    var open = document.querySelectorAll('[data-judge-open]');
    if (!overlay || !open.length) return;

    var slides = Array.prototype.slice.call(overlay.querySelectorAll('.jm-slide'));
    var dots = Array.prototype.slice.call(overlay.querySelectorAll('.jm-dots button'));
    var barFill = overlay.querySelector('.jm-bar i');
    var clock = overlay.querySelector('.clock');
    var playBtn = overlay.querySelector('[data-jm="play"]');
    var TOTAL = 90000;
    var STEP = TOTAL / slides.length;

    var idx = 0, t0 = 0, elapsed = 0, playing = false, raf = null;

    function show(i) {
      idx = Math.max(0, Math.min(slides.length - 1, i));
      slides.forEach(function (s, n) { s.classList.toggle('on', n === idx); });
      dots.forEach(function (d, n) { d.setAttribute('aria-current', n === idx ? 'true' : 'false'); });
    }
    function paint() {
      var pct = Math.min(100, (elapsed / TOTAL) * 100);
      if (barFill) barFill.style.width = pct.toFixed(2) + '%';
      if (clock) {
        var s = Math.min(90, Math.floor(elapsed / 1000));
        clock.textContent = '0:' + (s < 10 ? '0' : '') + s + ' / 1:30';
      }
    }
    function frame(now) {
      elapsed = Math.min(TOTAL, now - t0);
      var want = Math.min(slides.length - 1, Math.floor(elapsed / STEP));
      if (want !== idx) show(want);
      paint();
      if (elapsed >= TOTAL) { pause(); return; }
      raf = requestAnimationFrame(frame);
    }
    function play() {
      if (playing) return;
      if (elapsed >= TOTAL) { elapsed = 0; show(0); }
      playing = true;
      if (playBtn) playBtn.textContent = 'Pause';
      t0 = performance.now() - elapsed;
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      playing = false;
      if (playBtn) playBtn.textContent = 'Play';
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    }
    function jump(i) {
      show(i);
      elapsed = i * STEP;
      t0 = performance.now() - elapsed;
      paint();
    }
    function openIt() {
      overlay.classList.add('on');
      document.body.classList.add('jm-lock');
      overlay.setAttribute('aria-hidden', 'false');
      elapsed = 0; show(0); paint();
      var first = overlay.querySelector('[data-jm="close"]');
      if (first) first.focus();
      if (!reduced) play(); else paint();
    }
    function closeIt() {
      pause();
      overlay.classList.remove('on');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('jm-lock');
      var back = document.querySelector('[data-judge-open]');
      if (back) back.focus();
    }

    open.forEach(function (b) { b.addEventListener('click', openIt); });
    overlay.querySelectorAll('[data-jm]').forEach(function (b) {
      var a = b.getAttribute('data-jm');
      b.addEventListener('click', function () {
        if (a === 'close') closeIt();
        else if (a === 'next') jump(idx + 1);
        else if (a === 'prev') jump(idx - 1);
        else if (a === 'play') { playing ? pause() : play(); }
      });
    });
    dots.forEach(function (d, i) { d.addEventListener('click', function () { pause(); jump(i); }); });

    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('on')) return;
      if (e.key === 'Escape') closeIt();
      else if (e.key === 'ArrowRight') { pause(); jump(idx + 1); }
      else if (e.key === 'ArrowLeft') { pause(); jump(idx - 1); }
      else if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
    });

    /* keep focus inside the overlay while it is open */
    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = overlay.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], lastF = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastF.focus(); }
      else if (!e.shiftKey && document.activeElement === lastF) { e.preventDefault(); first.focus(); }
    });
  })();

  /* ---------- run the drives ---------- */
  if (drives.length) {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    setTimeout(schedule, 260);
  }

  /* ---------- reduced motion, live and in both directions ---------- */
  function pinAll() {
    document.querySelectorAll('.span-rule').forEach(function (s) { s.style.setProperty('--draw', '1'); });
    document.querySelectorAll('.tl').forEach(function (t) {
      t.style.setProperty('--draw', '1');
      t.querySelectorAll('.tl-item').forEach(function (i) { i.classList.add('lit'); });
    });
    document.querySelectorAll('.rail-item').forEach(function (i) { i.style.setProperty('--fill', '1'); });
    document.querySelectorAll('.flow-step').forEach(function (s) { s.classList.add('on'); });
    document.querySelectorAll('.rev, .stag').forEach(markIn);
    document.querySelectorAll('[data-fill]').forEach(function (el) {
      el.style.width = Math.max(0, Math.min(100, parseFloat(el.getAttribute('data-fill')))) + '%';
    });
    window.removeEventListener('scroll', schedule);
  }
  function unpinAll() {
    document.querySelectorAll('.tl .tl-item').forEach(function (i) { i.classList.remove('lit'); });
    document.querySelectorAll('.flow-step').forEach(function (s) { s.classList.remove('on'); });
    window.addEventListener('scroll', schedule, { passive: true });
    schedule();
  }
  reduceQ.addEventListener('change', function (e) {
    reduced = e.matches;
    if (reduced) pinAll(); else unpinAll();
    if (window.BridgeOnMotionChange) window.BridgeOnMotionChange(reduced);
  });

  /* ============================================================
     The conceptual Resilience Profile.
     One scoring function, shared by the simulator and the dashboard,
     so the two never disagree about the same person.
     NOT a credit score. A planning and education framework only.
     ============================================================ */
  function profile(o) {
    var cl = function (n) { return Math.max(0, Math.min(100, Math.round(n))); };
    var surplus = Math.max(1, o.income - o.essentials);
    var weeklyEssentials = o.essentials * 12 / 52;
    var weeklyCap = Math.max(5, (surplus * 12 / 52) * 0.35);

    var dims = [
      { n: 'Income stability', v: o.stability === undefined ? 70 : o.stability,
        note: o.stabilityNote },
      /* buffer measured in weeks of essentials, four weeks is the near-term target */
      { n: 'Emergency buffer', v: cl(o.savings / (weeklyEssentials * 4) * 100) },
      /* an essential load of 45 percent of income or less scores full marks */
      { n: 'Expense load', v: cl((1 - o.essentials / Math.max(1, o.income)) / 0.55 * 100) },
      /* what is still owed, measured against monthly surplus */
      { n: 'Financial obligations', v: cl(100 - (o.owed / surplus) * 15) },
      /* how comfortably the remaining amount fits inside an affordable weekly plan */
      { n: 'Recovery capacity', v: cl(100 - (o.owed / weeklyCap) * 2) }
    ];
    var W = [0.18, 0.20, 0.20, 0.18, 0.24];
    var score = Math.round(dims.reduce(function (a, d, i) { return a + d.v * W[i]; }, 0));
    var status = score >= 75 ? 'Well protected' : score >= 55 ? 'Moderate'
      : score >= 35 ? 'Exposed' : 'Highly exposed';
    return { dims: dims, score: score, status: status };
  }

  /* ---------- radar chart, shared ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function radar(svg, dims, cx, cy, r) {
    cx = cx || 150; cy = cy || 132; r = r || 86;
    var n = dims.length;
    function pt(i, f) {
      var a = (Math.PI * 2 * i / n) - Math.PI / 2;
      return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f];
    }
    var web = svg.querySelector('.radar-web');
    if (web && !web.dataset.built) {
      [0.25, 0.5, 0.75, 1].forEach(function (f) {
        var poly = document.createElementNS(SVGNS, 'polygon');
        poly.setAttribute('class', 'web');
        var pts = [];
        for (var i = 0; i < n; i++) pts.push(pt(i, f).map(function (v) { return v.toFixed(1); }).join(','));
        poly.setAttribute('points', pts.join(' '));
        web.appendChild(poly);
      });
      for (var i = 0; i < n; i++) {
        var p = pt(i, 1);
        var line = document.createElementNS(SVGNS, 'line');
        line.setAttribute('class', 'spoke');
        line.setAttribute('x1', cx); line.setAttribute('y1', cy);
        line.setAttribute('x2', p[0].toFixed(1)); line.setAttribute('y2', p[1].toFixed(1));
        web.appendChild(line);
      }
      web.dataset.built = '1';
    }
    var shape = svg.querySelector('.radar-shape');
    if (shape) {
      shape.setAttribute('points', dims.map(function (d, i) {
        return pt(i, Math.max(0.05, d.v / 100)).map(function (v) { return v.toFixed(1); }).join(',');
      }).join(' '));
    }
    var g = svg.querySelector('.radar-pts');
    if (g) {
      g.textContent = '';
      dims.forEach(function (d, i) {
        var p = pt(i, Math.max(0.05, d.v / 100));
        var c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('class', 'pt');
        c.setAttribute('cx', p[0].toFixed(1)); c.setAttribute('cy', p[1].toFixed(1));
        c.setAttribute('r', '3.6');
        g.appendChild(c);
      });
    }
    var lb = svg.querySelector('.radar-lbls');
    if (lb && !lb.dataset.built) {
      dims.forEach(function (d, i) {
        var p = pt(i, 1.25);
        var t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('class', 'lbl');
        t.setAttribute('x', p[0].toFixed(1));
        t.setAttribute('y', (p[1] + 3).toFixed(1));
        t.setAttribute('text-anchor', p[0] < cx - 12 ? 'end' : p[0] > cx + 12 ? 'start' : 'middle');
        t.textContent = d.n;
        lb.appendChild(t);
      });
      lb.dataset.built = '1';
    }
  }

  /* ---------- the dimension list beside the radar ---------- */
  function dimList(ul, dims) {
    if (!ul.dataset.built) {
      ul.innerHTML = dims.map(function (d, i) {
        var note = d.note ? ' <span class="dnote">(' + d.note + ')</span>' : '';
        return '<li><span class="dn">' + d.n + note + '</span>' +
          '<span class="dv" data-dv="' + i + '">0</span>' +
          '<span class="db"><i data-db="' + i + '"></i></span></li>';
      }).join('');
      ul.dataset.built = '1';
    }
    dims.forEach(function (d, i) {
      var v = ul.querySelector('[data-dv="' + i + '"]');
      var b = ul.querySelector('[data-db="' + i + '"]');
      if (v) v.textContent = d.v + ' / 100';
      if (b) b.style.width = d.v + '%';
    });
  }

  /* expose small helpers to page scripts */
  window.Bridge = {
    profile: profile,
    radar: radar,
    dimList: dimList,
    reduced: function () { return reduced; },
    addDrive: function (fn) { addDrive(fn); schedule(); },
    schedule: schedule,
    progressOf: progressOf,
    money: function (n) { return '$' + Math.round(n).toLocaleString('en-US'); },
    money2: function (n) {
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };
})();
