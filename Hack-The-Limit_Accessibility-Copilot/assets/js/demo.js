/* ==========================================================================
   The live demo. The same engine as the rail, pointed at the sample page
   instead of at this site. Content and address never change; only the
   reading of them does.
   ========================================================================== */

(function () {
  'use strict';

  var sample = document.getElementById('sample');
  if (!sample) return;

  var frame = sample.closest('.sample-frame');
  var badge = document.getElementById('frame-badge');
  var listEl = document.getElementById('demo-profiles');
  var logEl = document.getElementById('demo-log');
  var emptyEl = document.getElementById('demo-empty');
  var nameEl = document.getElementById('active-name');
  var marksBtn = document.getElementById('demo-marks');
  var restoreBtn = document.getElementById('demo-restore');
  var ruler = frame.querySelector('.s-ruler');

  var queriesEl = document.getElementById('demo-queries');
  var rescanBtn = document.getElementById('demo-rescan');

  var SCHEMA = null, PROFILES = [], DEFAULTS = null;
  var settings = null, active = null, marksOn = false;
  var scanResult = null;

  /* --- Applying a setting to the sample -------------------------------------- */

  var last = {};
  function attr(name, value) {
    if (last[name] === value) return;
    last[name] = value;
    if (value === null) sample.removeAttribute(name);
    else sample.setAttribute(name, value);
  }
  /* When a setting is back at its default, the variable is removed rather than
     rewritten, so the sample page returns to the values its own authors set. */
  function cssVar(name, value, isDefault) {
    var v = isDefault ? null : String(value);
    if (last[name] === v) return;
    last[name] = v;
    if (v === null) sample.style.removeProperty(name);
    else sample.style.setProperty(name, v);
  }

  function applySample() {
    var s = settings;
    attr('data-s-font', s.fontFamily === 'default' ? null : s.fontFamily);
    attr('data-s-contrast', s.contrast === 'default' ? null : s.contrast);
    attr('data-s-cvd', s.cvd === 'none' ? null : s.cvd);
    attr('data-s-links', s.links ? 'on' : null);
    attr('data-s-focus', s.focus ? 'strong' : null);
    attr('data-s-dim', s.dim ? 'on' : null);
    attr('data-s-motion', s.motion ? 'off' : null);
    attr('data-s-outline', s.outline ? 'on' : null);
    attr('data-s-skip', s.skip ? 'on' : null);
    attr('data-s-labels', s.labels ? 'on' : null);
    attr('data-s-plain', s.plain ? 'on' : null);
    attr('data-s-marks', marksOn ? 'on' : null);

    cssVar('--s-scale', s.scale, s.scale === DEFAULTS.scale);
    cssVar('--s-lh', Math.max(1.35, s.lineHeight - 0.1), s.lineHeight === DEFAULTS.lineHeight);
    cssVar('--s-ls', s.letterSpacing + 'em', s.letterSpacing === DEFAULTS.letterSpacing);
    cssVar('--s-ws', s.wordSpacing + 'em', s.wordSpacing === DEFAULTS.wordSpacing);
    cssVar('--s-measure', s.measure + 'ch', s.measure === DEFAULTS.measure);

    rulerOn(s.ruler);
  }

  /* --- The scoped reading ruler ---------------------------------------------- */

  var rulerWired = false, rulerRaf = null, rulerY = 0, lastTop = -1;

  function rulerOn(on) {
    ruler.hidden = !on;
    if (on && !rulerWired) {
      rulerWired = true;
      frame.addEventListener('pointermove', onMove, { passive: true });
      frame.addEventListener('focusin', onFocus);
    } else if (!on && rulerWired) {
      rulerWired = false;
      frame.removeEventListener('pointermove', onMove);
      frame.removeEventListener('focusin', onFocus);
      if (rulerRaf) { cancelAnimationFrame(rulerRaf); rulerRaf = null; }
    }
    if (on) place(frame.getBoundingClientRect().height * 0.4);
  }
  function onMove(e) {
    rulerY = e.clientY - frame.getBoundingClientRect().top;
    if (rulerRaf === null) rulerRaf = requestAnimationFrame(function () { rulerRaf = null; place(rulerY); });
  }
  function onFocus(e) {
    if (!e.target.getBoundingClientRect) return;
    var r = e.target.getBoundingClientRect();
    place(r.top + r.height / 2 - frame.getBoundingClientRect().top);
  }
  function place(y) {
    var top = Math.round(y - ruler.offsetHeight / 2);
    if (top === lastTop) return;
    lastTop = top;
    ruler.style.top = top + 'px';
  }

  /* --- The change log --------------------------------------------------------- */

  function changes() {
    var out = [];
    Object.keys(SCHEMA).forEach(function (k) {
      var v = settings[k];
      if (v === SCHEMA[k].def) return;
      out.push({ key: k, group: SCHEMA[k].group, label: SCHEMA[k].label, why: SCHEMA[k].reason(v) });
    });
    return out;
  }

  function render() {
    var cs = changes();

    var label = active ? profileName(active) : (cs.length ? 'someone with custom settings' : 'yourself');
    if (nameEl.textContent !== label) nameEl.textContent = label;
    var badgeText = active ? profileName(active).toLowerCase() : (cs.length ? 'custom' : 'original');
    if (badge.textContent !== badgeText) badge.textContent = badgeText;

    listEl.querySelectorAll('.demo-prof').forEach(function (b) {
      b.setAttribute('aria-pressed', String(active === b.dataset.id));
    });

    emptyEl.hidden = cs.length > 0;
    logEl.innerHTML = cs.map(function (c) {
      return '<li><span><span class="cat">' + c.group + '</span><span class="why">' + c.why + '</span></span>' +
        '<button type="button" class="cp-stet" data-key="' + c.key + '" ' +
        'aria-label="Stet: put back ' + c.label.toLowerCase() + ' on the sample page">stet</button></li>';
    }).join('');

    marksBtn.setAttribute('aria-pressed', String(marksOn));
    marksBtn.textContent = marksOn ? 'Hide changes' : 'Show changes';
  }

  function profileName(id) {
    for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === id) return PROFILES[i].name;
    return 'custom';
  }

  /* --- Author queries, scanned on the sample page only ------------------------- */

  function scanSample() {
    if (!window.CopilotQueries || !queriesEl) return;
    window.CopilotQueries.clear();
    scanResult = window.CopilotQueries.scan(sample);
    queriesEl.innerHTML = window.CopilotQueries.html(scanResult, 'the sample page');
  }

  function wireQueries() {
    if (!queriesEl) return;
    queriesEl.addEventListener('click', function (e) {
      var b = e.target.closest('.cp-qbtn');
      if (!b || !scanResult) return;
      var f = window.CopilotQueries.find(scanResult, b.dataset.q);
      if (!f) return;
      var wasOn = b.getAttribute('aria-pressed') === 'true';
      queriesEl.querySelectorAll('.cp-qbtn').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      if (wasOn) { window.CopilotQueries.clear(); say('Marks cleared.'); return; }
      b.setAttribute('aria-pressed', 'true');
      window.CopilotQueries.mark(f.nodes);
      say('Marked ' + f.nodes.length + ' on the sample page: ' + f.title + '.');
    });
    rescanBtn && rescanBtn.addEventListener('click', function () {
      scanSample();
      say('Looked again at the sample page.');
    });
  }

  /* --- Actions ----------------------------------------------------------------- */

  function applyProfile(id) {
    var p = null;
    for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === id) p = PROFILES[i];
    if (!p) return;
    settings = Object.assign({}, DEFAULTS, p.settings);
    active = id;
    applySample();
    render();
    say(p.name + ' applied to the sample page.');
  }

  function restore() {
    settings = Object.assign({}, DEFAULTS);
    active = null;
    applySample();
    render();
    say('Sample page restored. Every change is off.');
  }

  var live = null;
  function say(msg) {
    if (!live) {
      live = document.createElement('p');
      live.className = 'cp-live';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    setTimeout(function () { live.textContent = msg; }, 80);
  }

  /* --- The sample page's own working parts -------------------------------------- */

  function wireSample() {
    /* the three-step task */
    var steps = Array.prototype.slice.call(sample.querySelectorAll('.s-step'));
    var say3 = document.getElementById('step-say');
    var at = 0;
    function paintSteps() {
      steps.forEach(function (s, i) {
        s.dataset.state = i < at ? 'done' : i === at ? 'now' : '';
        if (i < at) s.dataset.state = 'done';
      });
      if (at >= steps.length) say3.textContent = 'All three steps are done. Your application is complete.';
      else say3.textContent = 'Step ' + ['one', 'two', 'three'][at] + ' of three.';
    }
    var nextBtn = sample.querySelector('[data-step-next]');
    var resetBtn = sample.querySelector('[data-step-reset]');
    nextBtn && nextBtn.addEventListener('click', function () {
      if (at < steps.length) at++;
      paintSteps();
    });
    resetBtn && resetBtn.addEventListener('click', function () { at = 0; paintSteps(); });

    /* the modal */
    var modal = document.getElementById('s-modal');
    var opener = sample.querySelector('[data-open-modal]');
    var lastFocus = null;
    function openModal() {
      lastFocus = document.activeElement;
      modal.hidden = false;
      var f = modal.querySelector('button');
      f && f.focus();
    }
    function closeModal() {
      modal.hidden = true;
      lastFocus && lastFocus.focus();
    }
    opener && opener.addEventListener('click', openModal);
    modal.querySelectorAll('[data-close-modal]').forEach(function (b) { b.addEventListener('click', closeModal); });
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
      if (e.key !== 'Tab' || modal.hidden) return;
      var f = modal.querySelectorAll('button, [href], input');
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });

    /* the original beside the rewrite */
    var pair = sample.querySelector('.pair');
    var origBtn = sample.querySelector('[data-orig-toggle]');
    origBtn && origBtn.addEventListener('click', function () {
      var on = pair.classList.toggle('side-by-side');
      origBtn.textContent = on ? 'Hide the original wording' : 'Show the original wording';
      say(on ? 'The original wording is now shown beside the rewrite.' : 'The original wording is hidden again.');
    });
  }

  /* --- Boot ---------------------------------------------------------------------- */

  function boot() {
    SCHEMA = window.Copilot.schema;
    DEFAULTS = window.Copilot.defaults();
    PROFILES = window.Copilot.profiles().filter(function (p) { return p.starter; });
    settings = Object.assign({}, DEFAULTS);

    listEl.innerHTML = PROFILES.map(function (p) {
      return '<li><button type="button" class="demo-prof" data-id="' + p.id + '" aria-pressed="false">' +
        '<span class="dot" aria-hidden="true"></span><span><span class="nm">' + p.name + '</span>' +
        '<span class="ds">' + p.desc + '</span></span></button></li>';
    }).join('');

    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('.demo-prof');
      if (b) applyProfile(b.dataset.id);
    });
    logEl.addEventListener('click', function (e) {
      var b = e.target.closest('.cp-stet');
      if (!b) return;
      settings[b.dataset.key] = DEFAULTS[b.dataset.key];
      active = null;
      applySample();
      render();
      say(SCHEMA[b.dataset.key].label + ' put back the way it was.');
    });
    marksBtn.addEventListener('click', function () {
      marksOn = !marksOn;
      applySample();
      render();
      say(marksOn ? 'Every changed region is now marked.' : 'The marks are hidden.');
    });
    restoreBtn.addEventListener('click', restore);

    wireSample();
    wireQueries();
    applySample();
    render();
    scanSample();
  }

  if (window.Copilot) boot();
  else document.addEventListener('copilot:ready', boot, { once: true });
})();
