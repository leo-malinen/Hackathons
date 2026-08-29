/* ==========================================================================
   Accessibility Copilot: the engine and the rail.
   Every change is a typed, reversible operation. It records its category,
   its plain-language reason, and the value it replaced, so the change log
   can list it and one press can put it back.
   ========================================================================== */

(function () {
  'use strict';

  var KEY = 'acp.state.v3';
  var SESSION_KEY = 'acp.session.v3';
  var root = document.documentElement;

  /* --- The settings schema ---------------------------------------------- */
  /* value: the default. reason: what the change log says, in plain words. */

  var SCHEMA = {
    fontFamily: {
      def: 'default', group: 'Reading', label: 'Reading face',
      options: [
        ['default', 'The page’s own face'],
        ['legible', 'A wide, open sans'],
        ['mono', 'Fixed width']
      ],
      reason: function (v) {
        return v === 'legible'
          ? 'Swapped the reading face for a wider, more open one.'
          : 'Swapped the reading face for a fixed-width one, so every letter takes the same room.';
      }
    },
    scale: {
      def: 1, group: 'Reading', label: 'Text size', unit: '%', min: 0.9, max: 1.6, step: 0.05,
      reason: function (v) { return 'Made the text ' + Math.round(v * 100) + ' percent of its usual size.'; }
    },
    lineHeight: {
      def: 1.66, group: 'Reading', label: 'Line spacing', min: 1.3, max: 2.2, step: 0.02,
      reason: function (v) { return 'Opened the space between lines to ' + v.toFixed(2) + '.'; }
    },
    letterSpacing: {
      def: 0, group: 'Reading', label: 'Letter spacing', unit: 'em', min: 0, max: 0.12, step: 0.005,
      reason: function (v) { return 'Added ' + v.toFixed(3) + 'em of air between letters.'; }
    },
    wordSpacing: {
      def: 0, group: 'Reading', label: 'Word spacing', unit: 'em', min: 0, max: 0.4, step: 0.01,
      reason: function (v) { return 'Added ' + v.toFixed(2) + 'em of air between words.'; }
    },
    measure: {
      def: 68, group: 'Reading', label: 'Line length', unit: 'ch', min: 42, max: 96, step: 1,
      reason: function (v) { return 'Held paragraphs to about ' + v + ' characters a line.'; }
    },
    ruler: {
      def: false, group: 'Reading', label: 'Reading ruler',
      reason: function () { return 'Put a reading ruler under the pointer and dimmed the rest.'; }
    },
    contrast: {
      def: 'default', group: 'Visual', label: 'Contrast',
      options: [['default', 'The page’s own colours'], ['high', 'High contrast'], ['dark', 'Dark']],
      reason: function (v) {
        return v === 'high'
          ? 'Pushed every colour to its strongest against the background.'
          : 'Turned the page dark and lightened the text to match.';
      }
    },
    links: {
      def: false, group: 'Visual', label: 'Stronger links',
      reason: function () { return 'Underlined and marked every link so it is not colour alone.'; }
    },
    focus: {
      def: false, group: 'Visual', label: 'Stronger focus ring',
      reason: function () { return 'Made the focus ring thicker and gave it a halo.'; }
    },
    dim: {
      def: false, group: 'Visual', label: 'Dim images',
      reason: function () { return 'Took the brightness down on pictures and decoration.'; }
    },
    cvd: {
      def: 'none', group: 'Visual', label: 'Colour vision',
      options: [['none', 'Off'], ['protan', 'Red weak'], ['deutan', 'Green weak'], ['tritan', 'Blue weak']],
      reason: function (v) { return 'Shifted the page’s colours for ' + v + '-type colour vision.'; }
    },
    motion: {
      def: false, group: 'Motion and focus', label: 'Reduce motion',
      reason: function () { return 'Stopped animation, auto-playing panels, and drifting backgrounds.'; }
    },
    outline: {
      def: false, group: 'Navigation', label: 'Show page structure',
      reason: function () { return 'Numbered the headings and drew the page’s regions.'; }
    },
    skip: {
      def: false, group: 'Navigation', label: 'Always show skip link',
      reason: function () { return 'Kept the skip-to-content link visible instead of hidden until focus.'; }
    },
    labels: {
      def: false, group: 'Navigation', label: 'Emphasise form labels',
      reason: function () { return 'Marked every form label so it cannot be mistaken for a hint.'; }
    },
    plain: {
      def: false, group: 'Language', label: 'Plain language',
      reason: function () { return 'Showed the plain-language version, with the original one press away.'; }
    }
  };

  var ORDER = ['fontFamily', 'scale', 'lineHeight', 'letterSpacing', 'wordSpacing', 'measure', 'ruler',
    'contrast', 'links', 'focus', 'dim', 'cvd', 'motion', 'outline', 'skip', 'labels', 'plain'];

  var GROUPS = ['Reading', 'Visual', 'Motion and focus', 'Language', 'Navigation'];

  /* --- The six starter profiles ----------------------------------------- */
  /* Names describe a configuration. They are not labels for people. */

  var STARTERS = [
    {
      id: 'clear-reading', name: 'Clear Reading',
      desc: 'Bigger, airier type on a shorter line, with a ruler to hold your place.',
      settings: { fontFamily: 'legible', scale: 1.15, lineHeight: 1.9, letterSpacing: 0.04, wordSpacing: 0.08, measure: 58, ruler: true, links: true }
    },
    {
      id: 'low-motion', name: 'Low Motion',
      desc: 'Nothing moves on its own. No drifting, no auto-play, no parallax.',
      settings: { motion: true, dim: true }
    },
    {
      id: 'high-contrast', name: 'High Contrast',
      desc: 'Every colour pushed to its strongest, with links and focus marked twice over.',
      settings: { contrast: 'high', links: true, focus: true, scale: 1.05 }
    },
    {
      id: 'focus-mode', name: 'Focus Mode',
      desc: 'A short line, a reading ruler, dimmed pictures, and a page that stays still.',
      settings: { measure: 52, ruler: true, dim: true, motion: true, scale: 1.05, lineHeight: 1.82 }
    },
    {
      id: 'keyboard-first', name: 'Keyboard First',
      desc: 'A loud focus ring, a visible skip link, and the page’s structure on show.',
      settings: { focus: true, skip: true, outline: true, links: true }
    },
    {
      id: 'plain-language', name: 'Plain Language',
      desc: 'Shorter sentences and simpler words, with the original always one press away.',
      settings: { plain: true, fontFamily: 'legible', scale: 1.08, lineHeight: 1.8, measure: 60 }
    }
  ];

  /* --- State ------------------------------------------------------------- */

  function defaults() {
    var s = {};
    ORDER.forEach(function (k) { s[k] = SCHEMA[k].def; });
    return s;
  }

  function freshState() {
    return {
      settings: defaults(),
      activeProfile: null,
      custom: [],
      scope: 'global',
      excluded: [],
      learning: true,
      events: {},
      proposalDismissed: {}
    };
  }

  var state = freshState();
  var sessionOnly = false;

  function load() {
    try {
      var sess = sessionStorage.getItem(SESSION_KEY);
      if (sess) { sessionOnly = true; return Object.assign(freshState(), JSON.parse(sess)); }
    } catch (e) { /* private mode, carry on with defaults */ }
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var merged = Object.assign(freshState(), parsed);
        merged.settings = Object.assign(defaults(), parsed.settings || {});
        return merged;
      }
    } catch (e) { /* nothing stored, or storage is blocked */ }
    return freshState();
  }

  function save() {
    var body = JSON.stringify(state);
    /* Nothing set means nothing stored. A page that promises deletion should
       not leave a tidy record of defaults behind to prove it was here. */
    if (body === JSON.stringify(freshState())) {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* blocked */ }
      return;
    }
    try {
      if (state.scope === 'session') { sessionStorage.setItem(SESSION_KEY, body); localStorage.removeItem(KEY); }
      else { localStorage.setItem(KEY, body); sessionStorage.removeItem(SESSION_KEY); }
    } catch (e) { /* storage blocked: the session still works, it just will not persist */ }
  }

  /* --- Applying the settings --------------------------------------------- */

  var lastApplied = {};

  function pageId() {
    var p = location.pathname.split('/').pop() || 'index.html';
    return p;
  }

  function isExcluded() { return state.excluded.indexOf(pageId()) !== -1; }

  function apply() {
    var s = isExcluded() ? defaults() : state.settings;

    setAttr('data-cp-font', s.fontFamily === 'default' ? null : s.fontFamily);
    setAttr('data-cp-contrast', s.contrast === 'default' ? null : s.contrast);
    setAttr('data-cp-cvd', s.cvd === 'none' ? null : s.cvd);
    setAttr('data-cp-links', s.links ? 'on' : null);
    setAttr('data-cp-focus', s.focus ? 'strong' : null);
    setAttr('data-cp-dim', s.dim ? 'on' : null);
    setAttr('data-cp-motion', s.motion ? 'off' : null);
    setAttr('data-cp-outline', s.outline ? 'on' : null);
    setAttr('data-cp-skip', s.skip ? 'on' : null);
    setAttr('data-cp-labels', s.labels ? 'on' : null);
    setAttr('data-cp-plain', s.plain ? 'on' : null);

    setVar('--cp-scale', s.scale);
    setVar('--cp-lh', s.lineHeight);
    setVar('--cp-ls', s.letterSpacing + 'em');
    setVar('--cp-ws', s.wordSpacing + 'em');
    setVar('--cp-measure', s.measure + 'ch');

    rulerOn(s.ruler && !prefersReduced());
    if (s.outline) numberHeadings();
    flagChanges();
  }

  function setAttr(name, value) {
    if (lastApplied[name] === value) return;
    lastApplied[name] = value;
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }

  function setVar(name, value) {
    var v = String(value);
    if (lastApplied[name] === v) return;
    lastApplied[name] = v;
    root.style.setProperty(name, v);
  }

  function prefersReduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* --- The change log ----------------------------------------------------- */

  function activeChanges() {
    if (isExcluded()) return [];
    var out = [];
    ORDER.forEach(function (k) {
      var v = state.settings[k];
      if (v === SCHEMA[k].def) return;
      out.push({ key: k, group: SCHEMA[k].group, label: SCHEMA[k].label, why: SCHEMA[k].reason(v) });
    });
    return out;
  }

  /* --- Numbering the headings for the structure outline -------------------- */

  var numbered = false;
  function numberHeadings() {
    if (numbered) return;
    numbered = true;
    var main = document.querySelector('main');
    if (!main) return;
    var n2 = 0, n3 = 0;
    main.querySelectorAll('h2, h3').forEach(function (h) {
      if (h.tagName === 'H2') { n2++; n3 = 0; h.setAttribute('data-lvl', 'H2 · ' + n2); }
      else { n3++; h.setAttribute('data-lvl', 'H3 · ' + n2 + '.' + n3); }
    });
  }

  /* --- The margin proof marks --------------------------------------------- */

  var MARK_PATHS = {
    stet: 'M4 18 L10 6 L16 18 M6.5 13 H13.5',
    caret: 'M3 17 L10 6 L17 17 M10 6 V19',
    para: 'M15 4 H8 a4 4 0 0 0 0 8 h3 M13 4 V19 M16 4 V19'
  };

  function flagChanges() {
    document.querySelectorAll('.cp-flag').forEach(function (el) { el.remove(); });
    if (isExcluded() || activeChanges().length === 0) return;
    var targets = document.querySelectorAll('[data-cp-flag]');
    if (!targets.length) return;
    targets.forEach(function (t) {
      var kind = t.getAttribute('data-cp-flag') || 'stet';
      if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'cp-flag');
      svg.setAttribute('viewBox', '0 0 20 24');
      svg.setAttribute('aria-hidden', 'true');
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', MARK_PATHS[kind] || MARK_PATHS.stet);
      svg.appendChild(p);
      t.appendChild(svg);
    });
  }

  /* --- The reading ruler --------------------------------------------------- */

  var rulerEl = null, rulerY = 0, rulerRaf = null;

  function rulerOn(on) {
    if (on && !rulerEl) {
      rulerEl = document.createElement('div');
      rulerEl.className = 'cp-ruler';
      rulerEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(rulerEl);
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('focusin', onFocusRuler);
      placeRuler(window.innerHeight * 0.45);
    } else if (!on && rulerEl) {
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('focusin', onFocusRuler);
      if (rulerRaf) { cancelAnimationFrame(rulerRaf); rulerRaf = null; }
      rulerEl.remove();
      rulerEl = null;
    }
  }

  function onPointer(e) {
    rulerY = e.clientY;
    if (rulerRaf === null) rulerRaf = requestAnimationFrame(flushRuler);
  }

  function onFocusRuler(e) {
    if (!e.target || !e.target.getBoundingClientRect) return;
    if (e.target.closest && e.target.closest('.cp-panel, .cp-launch')) return;
    var r = e.target.getBoundingClientRect();
    rulerY = r.top + r.height / 2;
    if (rulerRaf === null) rulerRaf = requestAnimationFrame(flushRuler);
  }

  var lastRulerTop = -1;
  function flushRuler() {
    rulerRaf = null;
    placeRuler(rulerY);
  }

  function placeRuler(y) {
    if (!rulerEl) return;
    var top = Math.round(y - rulerEl.offsetHeight / 2);
    if (top === lastRulerTop) return;   /* write only on change */
    lastRulerTop = top;
    rulerEl.style.top = top + 'px';
  }

  /* --- Learning: explicit proposals, never a silent change ----------------- */

  function record(key) {
    if (!state.learning) return;
    state.events[key] = (state.events[key] || 0) + 1;
  }

  function proposal() {
    if (!state.learning || !state.activeProfile) return null;
    var prof = profileById(state.activeProfile);
    if (!prof || prof.starter) return proposalForStarter();
    return proposalFor(prof);
  }

  function proposalForStarter() {
    var prof = profileById(state.activeProfile);
    if (!prof) return null;
    return proposalFor(prof);
  }

  function proposalFor(prof) {
    var best = null;
    Object.keys(state.events).forEach(function (k) {
      if (state.events[k] < 3) return;
      if (state.proposalDismissed[k]) return;
      var want = prof.settings[k] === undefined ? SCHEMA[k].def : prof.settings[k];
      if (state.settings[k] === want) return;
      if (!best || state.events[k] > state.events[best]) best = k;
    });
    if (!best) return null;
    return {
      key: best,
      text: 'You have changed ' + SCHEMA[best].label.toLowerCase() + ' ' + state.events[best] +
        ' times. Save it to ' + prof.name + '?',
      profile: prof
    };
  }

  /* --- Profiles ------------------------------------------------------------ */

  function allProfiles() {
    return STARTERS.map(function (p) { return Object.assign({ starter: true }, p); })
      .concat(state.custom.map(function (p) { return Object.assign({ starter: false }, p); }));
  }

  function profileById(id) {
    var all = allProfiles();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function applyProfile(id) {
    var p = profileById(id);
    if (!p) return;
    state.settings = Object.assign(defaults(), p.settings);
    state.activeProfile = id;
    state.events = {};
    commit('Applied the ' + p.name + ' profile.');
  }

  function setSetting(key, value) {
    if (!SCHEMA[key]) return;
    if (state.settings[key] === value) return;
    state.settings[key] = value;
    record(key);
    commit(value === SCHEMA[key].def
      ? SCHEMA[key].label + ' put back the way it was.'
      : SCHEMA[key].reason(value));
  }

  function restoreAll() {
    state.settings = defaults();
    state.activeProfile = null;
    state.events = {};
    commit('Page restored. Every change is off.');
  }

  function commit(message) {
    apply();
    save();
    render();
    announce(message);
    document.dispatchEvent(new CustomEvent('copilot:change', { detail: { settings: state.settings, profile: state.activeProfile } }));
  }

  /* --- Announcements -------------------------------------------------------- */

  var live = null, liveTimer = null;
  function announce(msg) {
    if (!live) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { live.textContent = msg; }, 90);
  }

  /* --- The colour-vision filters -------------------------------------------- */

  function injectFilters() {
    var wrap = document.createElement('div');
    wrap.className = 'cp-svgdefs';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" focusable="false"><defs>' +
      '<filter id="cp-protan"><feColorMatrix type="matrix" values="' +
      '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/></filter>' +
      '<filter id="cp-deutan"><feColorMatrix type="matrix" values="' +
      '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/></filter>' +
      '<filter id="cp-tritan"><feColorMatrix type="matrix" values="' +
      '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"/></filter>' +
      '</defs></svg>';
    document.body.appendChild(wrap);
  }

  /* --- The rail UI ----------------------------------------------------------- */

  var launcher, panel, countEl, logEl, profileList, controlsEl, proposalEl, stateEl, queriesEl,
    tabButtons = [], panes = {};

  function buildUI() {
    live = document.createElement('div');
    live.className = 'cp-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);

    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'cp-launch';
    launcher.id = 'cp-launch';
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'cp-panel');
    launcher.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15 L10 3 L17 15 M6 11 H14"/></svg>' +
      '<span>Copilot</span><span class="cp-count" hidden>0</span>';
    document.body.appendChild(launcher);
    countEl = launcher.querySelector('.cp-count');

    panel = document.createElement('section');
    panel.className = 'cp-panel';
    panel.id = 'cp-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Accessibility Copilot controls');
    panel.innerHTML =
      '<div class="cp-head">' +
        '<h2>Copilot</h2>' +
        '<span class="cp-state"></span>' +
        '<button type="button" class="cp-close" aria-label="Close the Copilot panel">✕</button>' +
      '</div>' +
      '<div class="cp-tabs" role="tablist" aria-label="Copilot sections">' +
        '<button type="button" class="cp-tab" role="tab" id="cp-tab-profiles" aria-controls="cp-pane-profiles" aria-selected="true">Profiles</button>' +
        '<button type="button" class="cp-tab" role="tab" id="cp-tab-controls" aria-controls="cp-pane-controls" aria-selected="false" tabindex="-1">Controls</button>' +
        '<button type="button" class="cp-tab" role="tab" id="cp-tab-log" aria-controls="cp-pane-log" aria-selected="false" tabindex="-1">Changed</button>' +
        '<button type="button" class="cp-tab" role="tab" id="cp-tab-queries" aria-controls="cp-pane-queries" aria-selected="false" tabindex="-1">In your way</button>' +
      '</div>' +
      '<div class="cp-body">' +
        '<div class="cp-pane" id="cp-pane-profiles" role="tabpanel" aria-labelledby="cp-tab-profiles" tabindex="0">' +
          '<div class="cp-proposal" hidden></div>' +
          '<p class="cp-hint">Pick a starting point. Every profile is a set of settings you can change, not a label for you.</p>' +
          '<ul class="cp-profiles"></ul>' +
        '</div>' +
        '<div class="cp-pane" id="cp-pane-controls" role="tabpanel" aria-labelledby="cp-tab-controls" tabindex="0" hidden></div>' +
        '<div class="cp-pane" id="cp-pane-log" role="tabpanel" aria-labelledby="cp-tab-log" tabindex="0" hidden>' +
          '<p class="cp-hint">Everything the Copilot is doing to this page, in plain words. Stet puts one back.</p>' +
          '<ul class="cp-log"></ul>' +
        '</div>' +
        '<div class="cp-pane" id="cp-pane-queries" role="tabpanel" aria-labelledby="cp-tab-queries" tabindex="0" hidden>' +
          '<p class="cp-hint">What is still in your way here, and why the Copilot will not move it. This is not an audit and it does not score anybody.</p>' +
          '<div class="cp-queries"></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="rescan" style="width:100%;margin-top:.6rem">Look again</button>' +
        '</div>' +
      '</div>' +
      '<div class="cp-foot">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="exclude">Turn off here</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="restore">Restore original</button>' +
        '<span class="cp-meta"></span>' +
      '</div>';
    document.body.appendChild(panel);

    profileList = panel.querySelector('.cp-profiles');
    controlsEl = panel.querySelector('#cp-pane-controls');
    logEl = panel.querySelector('.cp-log');
    proposalEl = panel.querySelector('.cp-proposal');
    stateEl = panel.querySelector('.cp-state');
    tabButtons = Array.prototype.slice.call(panel.querySelectorAll('.cp-tab'));
    queriesEl = panel.querySelector('.cp-queries');
    panes = {
      'cp-tab-profiles': panel.querySelector('#cp-pane-profiles'),
      'cp-tab-controls': controlsEl,
      'cp-tab-log': panel.querySelector('#cp-pane-log'),
      'cp-tab-queries': panel.querySelector('#cp-pane-queries')
    };

    buildControls();
    wireUI();
  }

  function buildControls() {
    var html = '';
    GROUPS.forEach(function (g) {
      var keys = ORDER.filter(function (k) { return SCHEMA[k].group === g; });
      if (!keys.length) return;
      html += '<div class="cp-group"><h3>' + g + '</h3>';
      keys.forEach(function (k) {
        var m = SCHEMA[k];
        if (typeof m.def === 'boolean') {
          html += '<div class="cp-ctrl"><button type="button" class="cp-switch" data-key="' + k + '" aria-pressed="false">' +
            '<span class="box" aria-hidden="true"></span><span>' + m.label + '</span></button></div>';
        } else if (m.options) {
          html += '<div class="cp-ctrl"><label class="lg" for="cp-' + k + '"><span>' + m.label + '</span></label>' +
            '<select id="cp-' + k + '" data-key="' + k + '">' +
            m.options.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') +
            '</select></div>';
        } else {
          html += '<div class="cp-ctrl"><label for="cp-' + k + '"><span>' + m.label + '</span>' +
            '<span class="val" data-val="' + k + '"></span></label>' +
            '<input type="range" id="cp-' + k + '" data-key="' + k + '" min="' + m.min + '" max="' + m.max +
            '" step="' + m.step + '"></div>';
        }
      });
      /* The language service is the one part that may leave the device, so it
         lives with the language controls and stays off until it is switched on. */
      if (g === 'Language' && window.CopilotLanguage) {
        html += '<div class="cp-lang">' +
          '<p class="cp-langstate" data-on="false"><span class="cp-langtext">Off. Nothing leaves this device.</span></p>' +
          '<label class="lg" for="cp-langkey" style="display:block;margin-bottom:.3rem">' +
            '<span>Key, kept in this browser</span></label>' +
          '<input type="password" id="cp-langkey" autocomplete="off" spellcheck="false" placeholder="sk-or-...">' +
          '<label class="lg" for="cp-langmodel" style="display:block;margin:.55rem 0 .3rem"><span>Model</span></label>' +
          '<select id="cp-langmodel">' +
            window.CopilotLanguage.models.map(function (m) {
              return '<option value="' + m[0] + '">' + m[1] + ', ' + m[2] + '</option>';
            }).join('') +
          '</select>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-primary btn-sm" data-act="savekey">Switch it on</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="forgetkey">Forget the key</button>' +
          '</div>' +
          '<div class="row"><button type="button" class="btn btn-ghost btn-sm" data-act="summarise" style="width:100%">Summarise this page</button></div>' +
          '<div class="cp-summary" id="cp-summary"></div>' +
          '<p class="cp-langnote">Then pick any text on the page and choose Plain words, or press Alt and P. ' +
            'The key is written into this browser and never into the site.</p>' +
          '</div>';
      }
      html += '</div>';
    });
    html += '<div class="cp-group"><h3>Safety and control</h3>' +
      '<div class="cp-ctrl"><label class="lg" for="cp-scope"><span>Where it applies</span></label>' +
      '<select id="cp-scope"><option value="global">Every page here</option>' +
      '<option value="session">This visit only</option></select></div>' +
      '<div class="cp-ctrl"><button type="button" class="cp-switch" data-learn aria-pressed="true">' +
      '<span class="box" aria-hidden="true"></span><span>Let it suggest changes</span></button></div>' +
      '<div class="cp-ctrl"><button type="button" class="btn btn-ghost btn-sm" data-act="export">Export profile</button> ' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="forget">Delete what it learned</button></div>' +
      '</div>';
    controlsEl.innerHTML = html;
  }

  function wireUI() {
    launcher.addEventListener('click', function () { togglePanel(panel.hidden); });
    panel.querySelector('.cp-close').addEventListener('click', function () { togglePanel(false); launcher.focus(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { togglePanel(false); launcher.focus(); }
    });

    document.addEventListener('pointerdown', function (e) {
      if (panel.hidden) return;
      if (panel.contains(e.target) || launcher.contains(e.target)) return;
      togglePanel(false);
    });

    tabButtons.forEach(function (btn, i) {
      btn.addEventListener('click', function () { selectTab(btn.id); });
      btn.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = tabButtons[(i + d + tabButtons.length) % tabButtons.length];
        selectTab(next.id);
        next.focus();
      });
    });

    controlsEl.addEventListener('click', function (e) {
      var sw = e.target.closest('.cp-switch');
      if (sw && sw.dataset.key) { setSetting(sw.dataset.key, !state.settings[sw.dataset.key]); return; }
      if (sw && sw.hasAttribute('data-learn')) {
        state.learning = !state.learning;
        if (!state.learning) state.events = {};
        commit(state.learning ? 'Suggestions are on.' : 'Suggestions are off, and what it learned is cleared.');
        return;
      }
      var act = e.target.closest('[data-act]');
      if (act) doAction(act.dataset.act);
    });

    controlsEl.addEventListener('input', function (e) {
      var k = e.target.dataset && e.target.dataset.key;
      if (!k) return;
      var v = e.target.type === 'range' ? parseFloat(e.target.value) : e.target.value;
      setSetting(k, v);
    });

    controlsEl.addEventListener('change', function (e) {
      if (e.target.id === 'cp-langmodel' && window.CopilotLanguage) {
        window.CopilotLanguage.setModel(e.target.value);
        announce('Model set to ' + e.target.value + '.');
        return;
      }
      if (e.target.id !== 'cp-scope') return;
      state.scope = e.target.value;
      commit(state.scope === 'session'
        ? 'Settings now last for this visit only.'
        : 'Settings now apply to every page here.');
    });

    panel.querySelector('.cp-foot').addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (act) doAction(act.dataset.act);
    });

    profileList.addEventListener('click', function (e) {
      var b = e.target.closest('.cp-profile');
      if (b) applyProfile(b.dataset.id);
    });

    logEl.addEventListener('click', function (e) {
      var b = e.target.closest('.cp-stet');
      if (b) setSetting(b.dataset.key, SCHEMA[b.dataset.key].def);
    });

    queriesEl.addEventListener('click', function (e) {
      var b = e.target.closest('.cp-qbtn');
      if (!b || !lastScan || !window.CopilotQueries) return;
      var f = window.CopilotQueries.find(lastScan, b.dataset.q);
      if (!f) return;
      var wasOn = b.getAttribute('aria-pressed') === 'true';
      queriesEl.querySelectorAll('.cp-qbtn').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      if (wasOn) { window.CopilotQueries.clear(); announce('Marks cleared.'); return; }
      b.setAttribute('aria-pressed', 'true');
      window.CopilotQueries.mark(f.nodes);
      announce('Marked ' + f.nodes.length + ' on the page: ' + f.title + '.');
    });
    panel.querySelector('#cp-pane-queries').addEventListener('click', function (e) {
      var act = e.target.closest('[data-act="rescan"]');
      if (act) { runScan(); announce('Looked again at this page.'); }
    });

    proposalEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-prop]');
      if (!b) return;
      var p = proposal();
      if (!p) return;
      if (b.dataset.prop === 'yes') {
        if (p.profile.starter) {
          var copy = {
            id: p.profile.id + '-yours', name: p.profile.name + ' (yours)',
            desc: p.profile.desc, settings: Object.assign({}, p.profile.settings)
          };
          copy.settings[p.key] = state.settings[p.key];
          state.custom = state.custom.filter(function (c) { return c.id !== copy.id; });
          state.custom.push(copy);
          state.activeProfile = copy.id;
        } else {
          p.profile.settings[p.key] = state.settings[p.key];
        }
        state.events[p.key] = 0;
        commit('Saved to ' + (p.profile.starter ? p.profile.name + ' (yours)' : p.profile.name) + '.');
      } else {
        state.proposalDismissed[p.key] = true;
        commit('Suggestion dismissed. It will not ask about that again.');
      }
    });
  }

  /* --- The language service's own controls ---------------------------------- */

  function syncLang() {
    var L = window.CopilotLanguage;
    if (!L) return;
    var stateEl2 = controlsEl.querySelector('.cp-langstate');
    var textEl = controlsEl.querySelector('.cp-langtext');
    var sel = controlsEl.querySelector('#cp-langmodel');
    if (!stateEl2) return;
    var on = L.hasKey();
    stateEl2.setAttribute('data-on', String(on));
    var s = L.spent();
    textEl.textContent = on
      ? 'On. ' + s.calls + ' request' + (s.calls === 1 ? '' : 's') + ' so far, ' +
        (s.total ? (s.total < 0.01 ? 'under a penny' : '$' + s.total.toFixed(3)) : 'nothing spent yet') + '.'
      : 'Off. Nothing leaves this device.';
    if (sel && sel.value !== L.getModel()) sel.value = L.getModel();
  }

  function langAction(act) {
    var L = window.CopilotLanguage;
    if (!L) return false;
    if (act === 'savekey') {
      var input = controlsEl.querySelector('#cp-langkey');
      var v = (input.value || '').trim();
      if (!v) { announce('Paste a key first, then press it again.'); input.focus(); return true; }
      L.setKey(v);
      input.value = '';
      input.placeholder = 'kept in this browser';
      syncLang();
      announce('The language service is on. Pick some text and choose Plain words.');
      return true;
    }
    if (act === 'forgetkey') {
      L.clearKey();
      var i2 = controlsEl.querySelector('#cp-langkey');
      if (i2) { i2.value = ''; i2.placeholder = 'sk-or-...'; }
      var sum = controlsEl.querySelector('#cp-summary');
      if (sum) sum.innerHTML = '';
      syncLang();
      announce('Key forgotten. Nothing can leave this device now.');
      return true;
    }
    if (act === 'summarise') {
      var out = controlsEl.querySelector('#cp-summary');
      if (!L.hasKey()) {
        out.innerHTML = '<p class="cp-langnote">Switch the service on first, with a key.</p>';
        return true;
      }
      out.innerHTML = '<p class="cp-langnote">Reading the page. It stays yours while this runs.</p>';
      L.summarise(L.pageText()).then(function (r) {
        out.innerHTML =
          '<h4>' + r.minutes + ' minute read, about ' + r.words + ' words</h4>' +
          (r.points.length ? '<h4>What it says</h4><ul>' + r.points.map(function (p) {
            return '<li>' + p.replace(/[<>]/g, '') + '</li>';
          }).join('') + '</ul>' : '') +
          (r.actions.length ? '<h4>What it asks of you</h4><ul>' + r.actions.map(function (p) {
            return '<li>' + p.replace(/[<>]/g, '') + '</li>';
          }).join('') + '</ul>' : '') +
          '<p class="cp-langnote">' + r.note + '</p>';
        syncLang();
        announce('Summary ready in the panel.');
      }).catch(function (e) {
        out.innerHTML = '<p class="cp-langnote">That did not go through: ' +
          (e.message || 'no answer') + '. The page is unchanged.</p>';
      });
      return true;
    }
    return false;
  }

  function doAction(act) {
    if (langAction(act)) return;
    if (act === 'restore') { restoreAll(); return; }
    if (act === 'exclude') {
      var id = pageId();
      var i = state.excluded.indexOf(id);
      if (i === -1) state.excluded.push(id); else state.excluded.splice(i, 1);
      commit(isExcluded() ? 'Copilot is off on this page.' : 'Copilot is back on for this page.');
      return;
    }
    if (act === 'export') {
      var payload = JSON.stringify({
        name: state.activeProfile || 'custom', settings: state.settings
      }, null, 2);
      announce('Profile copied below the controls.');
      var pre = controlsEl.querySelector('.cp-export');
      if (!pre) {
        pre = document.createElement('textarea');
        pre.className = 'cp-export';
        pre.rows = 6;
        pre.readOnly = true;
        pre.setAttribute('aria-label', 'Your profile, as text you can copy');
        pre.style.cssText = 'width:100%;margin-top:.6rem;font-family:var(--mono);font-size:.7rem;' +
          'border:1px solid var(--line-strong);border-radius:6px;padding:.5rem;background:var(--canvas);color:var(--text-primary)';
        controlsEl.querySelector('[data-act="export"]').parentNode.appendChild(pre);
      }
      pre.value = payload;
      pre.focus();
      pre.select();
      return;
    }
    if (act === 'forget') {
      state.events = {};
      state.proposalDismissed = {};
      state.custom = [];
      commit('Deleted everything it had learned.');
    }
  }

  function selectTab(id) {
    tabButtons.forEach(function (b) {
      var on = b.id === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      panes[b.id].hidden = !on;
    });
    /* The scan touches the whole page, so it waits until somebody asks. */
    if (id === 'cp-tab-queries' && !scanned) runScan();
    if (id !== 'cp-tab-queries' && window.CopilotQueries) window.CopilotQueries.clear();
  }

  /* --- Author queries: what could not be fixed, and why --------------------- */

  var scanned = false;
  var lastScan = null;

  function runScan() {
    if (!window.CopilotQueries) return;
    scanned = true;
    window.CopilotQueries.clear();
    lastScan = window.CopilotQueries.scan(document.body);
    renderQueries();
  }

  function renderQueries() {
    if (!queriesEl || !lastScan) return;
    queriesEl.innerHTML = window.CopilotQueries.html(lastScan, 'this page');
  }

  var panelTimer = null;
  function togglePanel(open) {
    clearTimeout(panelTimer);
    if (open) {
      panel.hidden = false;
      panel.classList.add('opening');
      launcher.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(function () {
        panel.classList.remove('opening');
        panel.classList.add('open');
      });
      render();
    } else {
      panel.classList.remove('open');
      launcher.setAttribute('aria-expanded', 'false');
      panelTimer = setTimeout(function () { panel.hidden = true; }, 200);
    }
  }

  /* --- Rendering the panel, delta-gated where it matters --------------------- */

  var lastCount = -1, lastSig = '';

  function render() {
    var changes = activeChanges();

    if (changes.length !== lastCount) {
      lastCount = changes.length;
      countEl.textContent = String(changes.length);
      countEl.hidden = changes.length === 0;
    }

    var excluded = isExcluded();
    var stateText = excluded ? 'off here' : (state.activeProfile
      ? (profileById(state.activeProfile) || {}).name
      : (changes.length ? 'custom' : 'original'));
    if (stateEl.textContent !== stateText) stateEl.textContent = stateText;

    var exBtn = panel.querySelector('[data-act="exclude"]');
    exBtn.textContent = excluded ? 'Turn back on here' : 'Turn off here';

    var meta = panel.querySelector('.cp-meta');
    meta.textContent = state.scope === 'session'
      ? 'Kept for this visit only. Nothing leaves your browser.'
      : 'Kept in this browser only. Nothing leaves your device.';

    /* profiles */
    var sig = JSON.stringify([state.activeProfile, state.custom.map(function (c) { return c.id; })]);
    if (sig !== lastSig) {
      lastSig = sig;
      profileList.innerHTML = allProfiles().map(function (p) {
        return '<li><button type="button" class="cp-profile" data-id="' + p.id + '" aria-pressed="' +
          (state.activeProfile === p.id) + '"><span class="dot" aria-hidden="true"></span><span>' +
          '<span class="nm">' + p.name + '</span><span class="ds">' + p.desc + '</span></span></button></li>';
      }).join('');
    } else {
      profileList.querySelectorAll('.cp-profile').forEach(function (b) {
        b.setAttribute('aria-pressed', String(state.activeProfile === b.dataset.id));
      });
    }

    /* controls reflect the settings */
    ORDER.forEach(function (k) {
      var m = SCHEMA[k];
      var v = state.settings[k];
      if (typeof m.def === 'boolean') {
        var sw = controlsEl.querySelector('.cp-switch[data-key="' + k + '"]');
        if (sw) sw.setAttribute('aria-pressed', String(!!v));
      } else {
        var el = controlsEl.querySelector('[data-key="' + k + '"]');
        if (el && el.value !== String(v)) el.value = v;
        var val = controlsEl.querySelector('[data-val="' + k + '"]');
        if (val) {
          var text = m.unit === '%' ? Math.round(v * 100) + '%'
            : m.unit ? v + (m.unit === 'ch' ? ' ch' : m.unit)
            : String(v);
          if (val.textContent !== text) val.textContent = text;
        }
      }
    });
    syncLang();
    var learnBtn = controlsEl.querySelector('[data-learn]');
    if (learnBtn) learnBtn.setAttribute('aria-pressed', String(state.learning));
    var scopeSel = controlsEl.querySelector('#cp-scope');
    if (scopeSel && scopeSel.value !== state.scope) scopeSel.value = state.scope;

    /* the log */
    if (!changes.length) {
      logEl.innerHTML = '<li style="display:block;padding:0;border:0;background:none">' +
        '<p class="cp-empty">' + (excluded
          ? 'The Copilot is switched off on this page. Nothing is being changed.'
          : 'Nothing is changed. This page is exactly as its authors wrote it.') + '</p></li>';
    } else {
      logEl.innerHTML = changes.map(function (c) {
        return '<li><span><span class="cat">' + c.group + '</span><span class="why">' + c.why + '</span></span>' +
          '<button type="button" class="cp-stet" data-key="' + c.key + '" ' +
          'aria-label="Stet: put back ' + c.label.toLowerCase() + '">stet</button></li>';
      }).join('');
    }

    /* the proposal */
    var p = proposal();
    if (p) {
      proposalEl.innerHTML = '<p>' + p.text + '</p><div class="row">' +
        '<button type="button" class="btn btn-primary btn-sm" data-prop="yes">Save it</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-prop="no">No thanks</button></div>';
      proposalEl.hidden = false;
    } else {
      proposalEl.hidden = true;
    }
  }

  /* --- Reduced motion, honoured live and in both directions ------------------ */

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  mqReduce.addEventListener('change', function () {
    rulerOn(state.settings.ruler && !prefersReduced());
  });

  /* --- Boot -------------------------------------------------------------------- */

  function boot() {
    state = load();
    injectFilters();
    buildUI();
    apply();
    render();

    if (isExcluded()) {
      var note = document.createElement('p');
      note.className = 'cp-off-note';
      note.textContent = 'Copilot is off on this page.';
      document.body.appendChild(note);
      setTimeout(function () { note.hidden = true; }, 6000);
    }

    /* The public handle the Profiles page, the demo, and onboarding drive. */
    window.Copilot = {
      profiles: allProfiles,
      schema: SCHEMA,
      order: ORDER,
      groups: GROUPS,
      get: function () { return Object.assign({}, state.settings); },
      getState: function () { return { profile: state.activeProfile, scope: state.scope, learning: state.learning, excluded: isExcluded() }; },
      set: setSetting,
      applyProfile: applyProfile,
      restore: restoreAll,
      open: function (tab) { togglePanel(true); if (tab) selectTab('cp-tab-' + tab); },
      addProfile: function (p) {
        state.custom = state.custom.filter(function (c) { return c.id !== p.id; });
        state.custom.push(p);
        applyProfile(p.id);
      },
      removeProfile: function (id) {
        state.custom = state.custom.filter(function (c) { return c.id !== id; });
        if (state.activeProfile === id) restoreAll(); else commit('Profile deleted.');
      },
      forget: function () { doAction('forget'); },
      wipe: function () {
        try {
          localStorage.removeItem(KEY);
          sessionStorage.removeItem(SESSION_KEY);
          localStorage.removeItem('acp.lang.notice.v1');
        } catch (e) { /* blocked */ }
        if (window.CopilotLanguage) window.CopilotLanguage.clearKey();
        state = freshState();
        commit('Everything deleted. Nothing of yours is stored any more.');
      },
      stored: function () {
        var out = { local: null, session: null };
        try { out.local = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { out.local = 'unreadable'; }
        try { out.session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { out.session = 'unreadable'; }
        return out;
      },
      defaults: defaults
    };

    document.dispatchEvent(new CustomEvent('copilot:ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
