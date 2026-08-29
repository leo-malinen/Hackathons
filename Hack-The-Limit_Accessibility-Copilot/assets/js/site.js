/* ==========================================================================
   Site behaviour: navigation, entrances, the living layer, the hold moment,
   forms, and reduced motion honoured live in both directions.
   ========================================================================== */

(function () {
  'use strict';

  var reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduced() { return reduceQ.matches; }

  /* --- Navigation ----------------------------------------------------------- */

  function nav() {
    var bar = document.querySelector('.nav');
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (!bar) return;

    var stuck = false;
    window.addEventListener('scroll', function () {
      var on = window.scrollY > 8;
      if (on === stuck) return;         /* write only on change */
      stuck = on;
      bar.classList.toggle('stuck', on);
    }, { passive: true });

    if (!toggle || !links) return;
    var mq = window.matchMedia('(max-width: 940px)');

    function sync() {
      if (mq.matches) {
        links.hidden = toggle.getAttribute('aria-expanded') !== 'true';
      } else {
        links.hidden = false;
      }
    }
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      sync();
    });
    mq.addEventListener('change', sync);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false');
        sync();
        toggle.focus();
      }
    });
    sync();
  }

  /* --- Entrances ------------------------------------------------------------- */

  function entrances() {
    var items = document.querySelectorAll('.rise, .stagger, .draws');
    if (!items.length) return;

    if (reduced()) { items.forEach(function (el) { el.classList.add('in', 'settled'); }); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add('in');
        io.unobserve(el);
        /* Retire the stagger delays once the entrance has run, or every later
           sibling's hover lags by its stagger for the rest of the visit. */
        setTimeout(function () { el.classList.add('settled'); }, 1200);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* Give every hand-drawn mark its true path length so the draw-on is exact. */
  function measureMarks() {
    document.querySelectorAll('.mark').forEach(function (svg) {
      svg.querySelectorAll('path, line, polyline').forEach(function (p) {
        var len = 0;
        try { len = p.getTotalLength(); } catch (e) { len = 240; }
        if (len) p.style.setProperty('--len', Math.ceil(len));
      });
    });
  }

  /* --- The living layer: on screen only, and never on a hidden tab ---------- */

  function alive() {
    var sections = document.querySelectorAll('[data-alive]');
    if (!sections.length) return;
    if (reduced()) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('alive', en.isIntersecting);
      });
    }, { threshold: 0.04 });
    sections.forEach(function (s) { io.observe(s); });
  }

  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('paused', document.hidden);
  });

  /* --- The hold moment ------------------------------------------------------- */
  /* Hold and the paragraph opens up. Let go early and it eases back, because
     that is the promise. Hold it through and the change stays. */

  function holdMoment() {
    var btn = document.querySelector('.hold-btn');
    var para = document.querySelector('.hold-para');
    var reveal = document.querySelector('.hold-reveal');
    if (!btn || !para) return;

    var h = 0, target = 0, raf = null, done = false, last = 0;
    var labelIdle = btn.dataset.idle || 'Press and hold';
    var labelDone = btn.dataset.done || 'Held. Now let go, it stays';

    reveal && reveal.querySelectorAll('li').forEach(function (li, i) {
      li.style.setProperty('--td', (i * 0.18).toFixed(2));
    });

    function write(v) {
      para.style.setProperty('--h', v.toFixed(4));
      if (reveal) reveal.style.setProperty('--h', v.toFixed(4));
      btn.style.setProperty('--h', v.toFixed(4));
    }

    function tick(now) {
      var dt = Math.min(100, now - (last || now));
      last = now;
      var k = target > h ? 0.055 : 0.09;
      h += (target - h) * (1 - Math.pow(1 - k, dt / 16.667));
      if (h > 0.995 && target === 1 && !done) {
        done = true;
        h = 1;
        btn.classList.add('done');
        btn.querySelector('span:last-child').textContent = labelDone;
        btn.setAttribute('aria-pressed', 'true');
      }
      write(h);
      if (Math.abs(target - h) < 0.002) { h = target; write(h); raf = null; last = 0; return; }
      raf = requestAnimationFrame(tick);
    }

    function drive() { if (raf === null) raf = requestAnimationFrame(tick); }
    function press() { if (done) return; target = 1; drive(); }
    function release() { if (done) return; target = 0; drive(); }

    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); btn.setPointerCapture(e.pointerId); press(); });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(); }
    });
    btn.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); }
    });
    btn.addEventListener('blur', release);

    function finish() {
      done = true; h = 1; target = 1; write(1);
      btn.classList.add('done');
      btn.querySelector('span:last-child').textContent = labelDone;
      btn.setAttribute('aria-pressed', 'true');
    }
    btn._finish = finish;
    btn._resetHold = function () {
      done = false; h = 0; target = 0; write(0);
      btn.classList.remove('done');
      btn.querySelector('span:last-child').textContent = labelIdle;
      btn.setAttribute('aria-pressed', 'false');
    };

    if (reduced()) finish();
  }

  /* --- Forms ---------------------------------------------------------------- */
  /* There is no backend here, so the page says so and shows an honest state. */

  function forms() {
    document.querySelectorAll('form[data-demo-form]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var done = f.querySelector('.form-done');
        var fields = f.querySelector('.form-fields');
        if (fields) fields.hidden = true;
        if (done) {
          done.hidden = false;
          done.setAttribute('tabindex', '-1');
          done.focus();
        }
      });
    });
  }

  /* --- Buttons on the page that open the panel at a given tab ---------------- */

  function panelOpeners() {
    document.querySelectorAll('[data-open-queries]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.Copilot) window.Copilot.open('queries');
      });
    });
    document.querySelectorAll('[data-open-panel]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.Copilot) window.Copilot.open(b.dataset.openPanel || 'profiles');
      });
    });
  }

  /* --- Reduced motion, live and in both directions --------------------------- */

  function pinToFinalStates() {
    document.body.classList.add('pinned');
    document.querySelectorAll('.rise, .stagger, .draws').forEach(function (el) {
      el.classList.add('in', 'settled');
    });
    document.querySelectorAll('[data-alive]').forEach(function (s) { s.classList.remove('alive'); });
    var btn = document.querySelector('.hold-btn');
    if (btn && btn._finish) btn._finish();
    document.dispatchEvent(new CustomEvent('site:pin'));
  }

  function unpin() {
    document.body.classList.remove('pinned');
    alive();
    document.dispatchEvent(new CustomEvent('site:unpin'));
  }

  reduceQ.addEventListener('change', function (e) {
    if (e.matches) pinToFinalStates();
    else unpin();
  });

  /* --- Boot ------------------------------------------------------------------ */

  function boot() {
    nav();
    measureMarks();
    entrances();
    alive();
    holdMoment();
    forms();
    panelOpeners();
    if (reduced()) pinToFinalStates();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
