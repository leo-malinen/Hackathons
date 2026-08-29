// ==UserScript==
// @name         Accessibility Copilot
// @namespace    https://accessibility-copilot.demo
// @version      0.1.0
// @description  A personal reading layer for the web. Change how any page looks, reads and moves, see every change in plain words, and put it all back in one press.
// @author       Accessibility Copilot
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      openrouter.ai
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* ==========================================================================
   Accessibility Copilot, as a userscript.

   The same engine as the companion site, pointed at somebody else's page.
   The difference that matters: this site's own CSS variables mean nothing
   here, so every change is an injected rule or a recorded inline style, and
   undo is removing them. Nothing is patched in place that cannot be lifted
   back out.

   What it will not do, ever:
     - send anything anywhere unless you ask for that passage by name
     - read or transmit a form value, a password, or a payment field
     - reorder a control, because moving one can change what a task means
     - invent an image description or a button name
   ========================================================================== */

(function () {
  'use strict';

  if (window.top !== window.self) return;
  if (document.getElementById('acp-root')) return;

  var HOST = location.hostname || 'this page';

  /* --- Storage, with a fallback so this also runs pasted into a console ---- */

  var store = {
    get: function (k, d) {
      try {
        if (typeof GM_getValue === 'function') return GM_getValue(k, d);
        var v = localStorage.getItem('acp.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set: function (k, v) {
      try {
        if (typeof GM_setValue === 'function') return GM_setValue(k, v);
        localStorage.setItem('acp.' + k, JSON.stringify(v));
      } catch (e) { /* private mode: it still works for this visit */ }
    },
    del: function (k) {
      try {
        if (typeof GM_deleteValue === 'function') return GM_deleteValue(k);
        localStorage.removeItem('acp.' + k);
      } catch (e) { /* nothing to remove */ }
    }
  };

  /* --- The settings schema, shared with the companion site ----------------- */

  var SCHEMA = {
    fontFamily: {
      def: 'default', group: 'Reading', label: 'Reading face',
      options: [['default', 'The page’s own face'], ['legible', 'A wide, open sans'], ['mono', 'Fixed width']],
      reason: function (v) {
        return v === 'legible'
          ? 'Swapped the reading face for a wider, more open one.'
          : 'Swapped the reading face for a fixed-width one, so every letter takes the same room.';
      }
    },
    scale: {
      def: 1, group: 'Reading', label: 'Text size', unit: '%', min: 0.9, max: 1.8, step: 0.05,
      reason: function (v) { return 'Made the text ' + Math.round(v * 100) + ' percent of its usual size.'; }
    },
    lineHeight: {
      def: 0, group: 'Reading', label: 'Line spacing', min: 0, max: 2.4, step: 0.05,
      reason: function (v) { return 'Set the space between lines to ' + v.toFixed(2) + '.'; }
    },
    letterSpacing: {
      def: 0, group: 'Reading', label: 'Letter spacing', unit: 'em', min: 0, max: 0.14, step: 0.005,
      reason: function (v) { return 'Added ' + v.toFixed(3) + 'em of air between letters.'; }
    },
    wordSpacing: {
      def: 0, group: 'Reading', label: 'Word spacing', unit: 'em', min: 0, max: 0.5, step: 0.01,
      reason: function (v) { return 'Added ' + v.toFixed(2) + 'em of air between words.'; }
    },
    measure: {
      def: 0, group: 'Reading', label: 'Line length', unit: 'ch', min: 0, max: 100, step: 2,
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
          ? 'Forced text to black on white and marked every link.'
          : 'Inverted the page to a dark ground and turned the pictures back the right way. This is a filter, not a designed dark theme.';
      }
    },
    links: {
      def: false, group: 'Visual', label: 'Stronger links',
      reason: function () { return 'Underlined and marked every link, so it is never colour alone.'; }
    },
    focus: {
      def: false, group: 'Visual', label: 'Stronger focus ring',
      reason: function () { return 'Made the focus ring thick enough to find at a glance.'; }
    },
    dim: {
      def: false, group: 'Visual', label: 'Dim images',
      reason: function () { return 'Took the brightness down on pictures and video.'; }
    },
    cvd: {
      def: 'none', group: 'Visual', label: 'Colour vision',
      options: [['none', 'Off'], ['protan', 'Red weak'], ['deutan', 'Green weak'], ['tritan', 'Blue weak']],
      reason: function (v) { return 'Shifted the page’s colours for ' + v + '-type colour vision.'; }
    },
    motion: {
      def: false, group: 'Motion and focus', label: 'Reduce motion',
      reason: function () { return 'Stopped animation, transitions, and anything playing by itself.'; }
    },
    outline: {
      def: false, group: 'Navigation', label: 'Show page structure',
      reason: function () { return 'Numbered the headings and drew the page’s regions.'; }
    },
    skip: {
      def: false, group: 'Navigation', label: 'Add a skip link',
      reason: function () { return 'Put a skip-to-content link at the top, aimed at where the content looks like it starts.'; }
    },
    labels: {
      def: false, group: 'Navigation', label: 'Emphasise form labels',
      reason: function () { return 'Marked every form label so it cannot be mistaken for a hint.'; }
    }
  };

  var ORDER = ['fontFamily', 'scale', 'lineHeight', 'letterSpacing', 'wordSpacing', 'measure', 'ruler',
    'contrast', 'links', 'focus', 'dim', 'cvd', 'motion', 'outline', 'skip', 'labels'];
  var GROUPS = ['Reading', 'Visual', 'Motion and focus', 'Navigation'];

  var STARTERS = [
    { id: 'clear-reading', name: 'Clear Reading',
      desc: 'Bigger, airier type on a shorter line, with a ruler to hold your place.',
      settings: { fontFamily: 'legible', scale: 1.2, lineHeight: 1.9, letterSpacing: 0.04, wordSpacing: 0.08, measure: 64, ruler: true, links: true } },
    { id: 'low-motion', name: 'Low Motion',
      desc: 'Nothing moves on its own. No drifting, no auto-play, no parallax.',
      settings: { motion: true, dim: true } },
    { id: 'high-contrast', name: 'High Contrast',
      desc: 'Text forced to its strongest, with links and focus marked twice over.',
      settings: { contrast: 'high', links: true, focus: true, scale: 1.1 } },
    { id: 'focus-mode', name: 'Focus Mode',
      desc: 'A short line, a reading ruler, dimmed pictures, and a page that stays still.',
      settings: { measure: 58, ruler: true, dim: true, motion: true, scale: 1.1, lineHeight: 1.85 } },
    { id: 'keyboard-first', name: 'Keyboard First',
      desc: 'A loud focus ring, a skip link, and the page’s structure on show.',
      settings: { focus: true, skip: true, outline: true, links: true } },
    { id: 'night-reading', name: 'Night Reading',
      desc: 'A dark ground, gentler pictures, and roomier lines for late reading.',
      settings: { contrast: 'dark', dim: true, lineHeight: 1.8, scale: 1.1, links: true } }
  ];

  /* --- State: global, per site, or this visit only -------------------------- */

  function defaults() {
    var s = {};
    ORDER.forEach(function (k) { s[k] = SCHEMA[k].def; });
    return s;
  }

  var state = {
    global: store.get('global', defaults()),
    sites: store.get('sites', {}),
    excluded: store.get('excluded', []),
    profile: store.get('profile', null),
    scope: store.get('scope', 'global'),
    custom: store.get('custom', []),
    lang: store.get('lang', { key: '', model: 'anthropic/claude-haiku-4.5', spent: 0, calls: 0, noticeSeen: false })
  };
  var session = null;

  function siteSettings() { return state.sites[HOST] || null; }

  /* Global first, then anything set for this site, then this visit. The panel
     says which one is winning, because a setting you cannot find is a bug. */
  function effective() {
    var s = Object.assign(defaults(), state.global);
    if (siteSettings()) Object.assign(s, siteSettings());
    if (session) Object.assign(s, session);
    return s;
  }

  function whereItLands() {
    return state.scope === 'session' ? 'this visit' : state.scope === 'site' ? HOST : 'every site';
  }

  function writeSetting(key, value) {
    if (state.scope === 'session') {
      session = session || {};
      session[key] = value;
    } else if (state.scope === 'site') {
      state.sites[HOST] = state.sites[HOST] || {};
      state.sites[HOST][key] = value;
      store.set('sites', state.sites);
    } else {
      state.global[key] = value;
      store.set('global', state.global);
    }
  }

  function isExcluded() { return state.excluded.indexOf(HOST) !== -1; }

  function activeChanges() {
    if (isExcluded()) return [];
    var s = effective(), out = [];
    ORDER.forEach(function (k) {
      if (s[k] === SCHEMA[k].def) return;
      out.push({ key: k, group: SCHEMA[k].group, label: SCHEMA[k].label, why: SCHEMA[k].reason(s[k]) });
    });
    return out;
  }

  /* --- Applying it to somebody else's page ---------------------------------- */
  /* One injected stylesheet does nearly everything, so undo is removing it.
     Font size is the exception: it has to be measured per element, so those
     originals are recorded and put back by hand. */

  var styleEl = null;
  var sheet = null;
  var sizedEls = [];
  var UI_SKIP = '#acp-root';

  /* Strict sites (gov.uk, banks, plenty of government services) send
     style-src 'self', which blocks both <style> tags and the style attribute.
     Those are the sites where this matters most, so the stylesheet is built
     as a constructed CSSStyleSheet, which CSP does not govern, and font sizes
     ride on an attribute plus a rule rather than an inline style. */
  function writeSheet(css) {
    if (sheet === null && 'adoptedStyleSheets' in Document.prototype) {
      try {
        sheet = new CSSStyleSheet();
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);
      } catch (e) { sheet = false; }
    }
    if (sheet) {
      try { sheet.replaceSync(css); return; } catch (e) { sheet = false; }
    }
    if (typeof GM_addStyle === 'function' && !styleEl) {
      try { styleEl = GM_addStyle(css); return; } catch (e) { /* fall through */ }
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'acp-style';
      document.documentElement.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }

  function dropSheet() {
    if (sheet) { try { sheet.replaceSync(''); } catch (e) { /* gone */ } }
    if (styleEl) { styleEl.remove(); styleEl = null; }
  }

  /* The Copilot's own furniture on the page: the ruler, the skip link, and the
     marks it draws beside a finding. Classes rather than inline styles, for
     the same CSP reason, and this sheet is always present. */
  var UI_SHEET_CSS =
    '.acp-ruler{position:fixed;left:0;right:0;height:3.2em;z-index:2147483640;pointer-events:none;' +
      'border-top:1px solid rgba(27,79,216,.45);border-bottom:1px solid rgba(27,79,216,.45);' +
      'background:rgba(27,79,216,.08);box-shadow:0 -100vh 0 rgba(0,0,0,.34),0 100vh 0 rgba(0,0,0,.34)}' +
    '.acp-skip{position:fixed;left:12px;top:12px;z-index:2147483646;background:#1B4FD8;color:#fff;' +
      'font:500 13px/1 ui-monospace,monospace;padding:10px 14px;border-radius:8px;text-decoration:none;' +
      'box-shadow:0 8px 24px -10px rgba(0,0,0,.6)}' +
    '[data-acp-mark]{outline:3px solid #1B4FD8 !important;outline-offset:3px !important}' +
    '.acp-defs{position:absolute;width:0;height:0;overflow:hidden}' +
    '[data-acp-lvl]::before{content:attr(data-acp-lvl);font:400 10px/1 ui-monospace,monospace;' +
      'color:#1B4FD8;border:1px solid rgba(27,79,216,.4);border-radius:4px;padding:2px 4px;' +
      'margin-right:6px;vertical-align:middle;letter-spacing:.06em}';

  var uiSheet = null, uiStyleEl = null;

  /* A live rule beats a style attribute here: mutating a declaration in a
     constructed sheet is not inline style, so a strict style-src leaves it
     alone. Returns null when there is no constructed sheet to write into. */
  function liveRule(sheetObj, selector) {
    if (!sheetObj) return null;
    try {
      var i = sheetObj.insertRule(selector + '{}', sheetObj.cssRules.length);
      return sheetObj.cssRules[i].style;
    } catch (e) { return null; }
  }
  function writePos(rule, el, left, top) {
    if (rule) {
      if (left !== null) rule.left = left + 'px';
      rule.top = top + 'px';
      return;
    }
    try {
      if (left !== null) el.style.left = left + 'px';
      el.style.top = top + 'px';
    } catch (e) { /* a strict style-src with no constructed sheets: it centres */ }
  }
  function ensureUiSheet() {
    if (uiSheet || uiStyleEl) return;
    if ('adoptedStyleSheets' in Document.prototype) {
      try {
        uiSheet = new CSSStyleSheet();
        uiSheet.replaceSync(UI_SHEET_CSS);
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat(uiSheet);
        return;
      } catch (e) { uiSheet = null; }
    }
    if (typeof GM_addStyle === 'function') {
      try { uiStyleEl = GM_addStyle(UI_SHEET_CSS); return; } catch (e) { /* fall through */ }
    }
    uiStyleEl = document.createElement('style');
    uiStyleEl.textContent = UI_SHEET_CSS;
    document.documentElement.appendChild(uiStyleEl);
  }

  function cssFor(s) {
    var css = [];
    var TEXT = 'p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6,label,span,a,div';

    if (s.fontFamily === 'legible') {
      css.push('body,' + TEXT + '{font-family:Verdana,"DejaVu Sans","Segoe UI",Tahoma,sans-serif !important}');
    } else if (s.fontFamily === 'mono') {
      css.push('body,' + TEXT + '{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace !important}');
    }
    if (s.lineHeight) css.push(TEXT + '{line-height:' + s.lineHeight + ' !important}');
    if (s.letterSpacing) css.push(TEXT + '{letter-spacing:' + s.letterSpacing + 'em !important}');
    if (s.wordSpacing) css.push(TEXT + '{word-spacing:' + s.wordSpacing + 'em !important}');
    if (s.measure) css.push('p,li,blockquote,dd{max-width:' + s.measure + 'ch !important}');

    if (s.contrast === 'high') {
      css.push('html{background:#fff !important}');
      css.push('body,' + TEXT + '{color:#000 !important;background-color:transparent !important;text-shadow:none !important}');
      css.push('body{background:#fff !important}');
      css.push('a,a *{color:#00219c !important;text-decoration:underline !important;text-decoration-thickness:.12em !important}');
      css.push('button,input,select,textarea{border:2px solid #000 !important;color:#000 !important;background:#fff !important}');
    } else if (s.contrast === 'dark') {
      /* The classic invert, said plainly in the change log rather than dressed
         up as a designed theme. Media gets turned back the right way. */
      css.push('html{filter:invert(1) hue-rotate(180deg) !important;background:#fff !important}');
      css.push('img,video,picture,canvas,svg,iframe,[style*="background-image"]{filter:invert(1) hue-rotate(180deg) !important}');
    }

    if (s.links) {
      css.push('a[href]{text-decoration:underline !important;text-decoration-thickness:.11em !important;' +
        'font-weight:600 !important;' +
        'text-underline-offset:.16em !important}');
    }
    if (s.focus) {
      css.push(':focus-visible{outline:4px solid #1B4FD8 !important;outline-offset:3px !important;' +
        'box-shadow:0 0 0 8px rgba(27,79,216,.28) !important}');
    }
    if (s.dim) {
      css.push('img,video,picture,canvas{filter:brightness(.78) contrast(.92) saturate(.85) !important}');
    }
    if (s.motion) {
      css.push('*,*::before,*::after{animation-duration:1ms !important;animation-iteration-count:1 !important;' +
        'transition-duration:1ms !important;transition-delay:0s !important;scroll-behavior:auto !important}');
      css.push('marquee{-webkit-animation:none !important}');
    }
    if (s.labels) {
      css.push('label{font-weight:700 !important;border-left:3px solid #1B4FD8 !important;padding-left:.4em !important;display:inline-block !important}');
    }
    if (s.outline) {
      css.push('h1,h2,h3,h4,h5,h6{outline:1px dashed rgba(27,79,216,.5) !important;outline-offset:4px}');
      css.push('main,nav,header,footer,aside,[role=main],[role=navigation]{outline:1px dashed rgba(27,79,216,.32) !important;outline-offset:8px}');
    }
    if (s.cvd !== 'none' && s.contrast !== 'dark') {
      css.push('html{filter:url(#acp-' + s.cvd + ') !important}');
    }

    /* With nothing to change, there is no stylesheet at all. Undo should leave
       no trace of itself, not an empty tag proving something was here. */
    if (!css.length) return '';

    /* Nothing above may touch the Copilot's own surface. */
    css.push(UI_SKIP + ',' + UI_SKIP + ' *{filter:none !important;font-family:inherit !important;' +
      'letter-spacing:normal !important;word-spacing:normal !important;max-width:none !important}');
    return css.join('\n');
  }

  /* Size rides on an attribute so it survives a strict style-src, and a
     handful of rules covers thousands of elements. Undo is removing the
     attribute, which never fails. */
  function applyFontSize(scale) {
    unsizeAll();
    if (scale === 1) return '';
    var els = document.body ? document.body.querySelectorAll(
      'p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6,a,span,label,button,input,select,textarea') : [];
    var buckets = {};
    var n = 0;
    for (var i = 0; i < els.length && n < 5000; i++) {
      var el = els[i];
      if (el.closest(UI_SKIP)) continue;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var px = parseFloat(cs.fontSize);
      if (!px) continue;
      var out = Math.round(px * scale * 2) / 2;      /* half-pixel buckets */
      var key = String(out).replace('.', '_');
      el.setAttribute('data-acp-fs', key);
      sizedEls.push(el);
      buckets[key] = out;
      n++;
    }
    return Object.keys(buckets).map(function (k) {
      return '[data-acp-fs="' + k + '"]{font-size:' + buckets[k] + 'px !important}';
    }).join('\n');
  }

  function unsizeAll() {
    sizedEls.forEach(function (el) { el.removeAttribute('data-acp-fs'); });
    sizedEls = [];
  }

  var lastCss = null, lastScale = null, sizeCss = '';

  function apply() {
    var s = isExcluded() ? defaults() : effective();

    if (s.scale !== lastScale) { lastScale = s.scale; sizeCss = applyFontSize(s.scale); }

    var css = cssFor(s);
    var full = [css, sizeCss].filter(Boolean).join('\n');
    if (full !== lastCss) {
      lastCss = full;
      if (!full) dropSheet(); else writeSheet(full);
    }

    filters(s.cvd !== 'none');
    rulerOn(s.ruler);
    skipLink(s.skip);
    numberHeadings(s.outline);
    if (s.motion) stopMedia();
  }

  function stopMedia() {
    document.querySelectorAll('video,audio').forEach(function (m) {
      try { m.removeAttribute('autoplay'); if (!m.paused) m.pause(); } catch (e) { /* cross origin */ }
    });
  }

  /* --- Bits that are not a stylesheet --------------------------------------- */

  var filterDefs = null;
  function filters(on) {
    if (on && !filterDefs) {
      filterDefs = document.createElement('div');
      filterDefs.id = 'acp-filters';
      filterDefs.className = 'acp-defs';
      filterDefs.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
        '<filter id="acp-protan"><feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/></filter>' +
        '<filter id="acp-deutan"><feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/></filter>' +
        '<filter id="acp-tritan"><feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"/></filter>' +
        '</defs></svg>';
      document.documentElement.appendChild(filterDefs);
    } else if (!on && filterDefs) { filterDefs.remove(); filterDefs = null; }
  }

  var skipEl = null;
  function skipLink(on) {
    if (on && !skipEl) {
      var target = document.querySelector('main, [role=main], #content, #main, article');
      skipEl = document.createElement('a');
      skipEl.id = 'acp-skip';
      skipEl.textContent = 'Skip to the content';
      skipEl.href = '#';
      skipEl.className = 'acp-skip';
      skipEl.addEventListener('click', function (e) {
        e.preventDefault();
        if (!target) return;
        target.setAttribute('tabindex', '-1');
        target.focus();
        target.scrollIntoView({ block: 'start' });
      });
      document.documentElement.appendChild(skipEl);
    } else if (!on && skipEl) { skipEl.remove(); skipEl = null; }
  }

  var numbered = [];
  function numberHeadings(on) {
    if (!on) {
      numbered.forEach(function (h) { h.removeAttribute('data-acp-lvl'); });
      numbered = [];
      return;
    }
    if (numbered.length) return;
    var n2 = 0, n3 = 0;
    document.querySelectorAll('h1,h2,h3').forEach(function (h) {
      if (h.closest(UI_SKIP)) return;
      if (h.tagName === 'H2') { n2++; n3 = 0; h.setAttribute('data-acp-lvl', 'H2 ' + n2); }
      else if (h.tagName === 'H3') { n3++; h.setAttribute('data-acp-lvl', 'H3 ' + n2 + '.' + n3); }
      else h.setAttribute('data-acp-lvl', 'H1');
      numbered.push(h);
    });
  }

  var ruler = null, rulerRaf = null, lastTop = -1;
  function rulerOn(on) {
    if (on && !ruler) {
      ruler = document.createElement('div');
      ruler.className = 'acp-ruler';
      document.documentElement.appendChild(ruler);
      window.addEventListener('pointermove', rulerMove, { passive: true });
      place(window.innerHeight * 0.45);
    } else if (!on && ruler) {
      window.removeEventListener('pointermove', rulerMove);
      ruler.remove(); ruler = null; lastTop = -1;
    }
  }
  function rulerMove(e) {
    var y = e.clientY;
    if (rulerRaf === null) rulerRaf = requestAnimationFrame(function () { rulerRaf = null; place(y); });
  }
  var rulerRule;
  function place(y) {
    if (!ruler) return;
    var top = Math.round(y - ruler.offsetHeight / 2);
    if (top === lastTop) return;
    lastTop = top;
    if (rulerRule === undefined) rulerRule = liveRule(uiSheet, '.acp-ruler');
    writePos(rulerRule, ruler, null, top);
  }

  function restoreEverything() {
    dropSheet();
    lastCss = null; lastScale = null; sizeCss = '';
    unsizeAll();
    filters(false); rulerOn(false); skipLink(false); numberHeadings(false);
    clearQueryMarks();
  }

  /* --- Author queries: the twelve checks ------------------------------------ */

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return !(r.width <= 1 && r.height <= 1);
  }
  function announced(el) {
    if (el.closest('[aria-hidden="true"]')) return false;
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    return true;
  }
  function txt(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }

  function accName(el) {
    var al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    var lb = el.getAttribute('aria-labelledby');
    if (lb) {
      var j = lb.split(/\s+/).map(function (id) { var n = document.getElementById(id); return n ? txt(n) : ''; }).join(' ').trim();
      if (j) return j;
    }
    var tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (el.id) {
        try {
          var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (l && txt(l)) return txt(l);
        } catch (e) { /* odd id */ }
      }
      var w = el.closest('label');
      if (w && txt(w)) return txt(w);
      if (el.type === 'submit' || el.type === 'button') return (el.value || '').trim();
      return (el.getAttribute('title') || '').trim();
    }
    var t = txt(el);
    if (t) return t;
    var img = el.querySelector('img[alt]');
    if (img && img.alt.trim()) return img.alt.trim();
    var st = el.querySelector('svg title');
    if (st && txt(st)) return txt(st);
    return (el.getAttribute('title') || '').trim();
  }

  function rgb(str) {
    str = (str || '').trim();
    if (!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    var scale = 1;
    if (/^color\(\s*srgb\b/i.test(str)) scale = 255;
    else if (!/^rgba?\(/i.test(str)) return null;
    var m = str.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return { r: +m[0] * scale, g: +m[1] * scale, b: +m[2] * scale, a: m.length > 3 ? parseFloat(m[3]) : 1 };
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function backdrop(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var c = rgb(cs.backgroundColor);
      if (c && c.a >= 0.85) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  function ownsText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim().length > 1) return true;
    }
    return false;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function scanPage() {
    var all = Array.prototype.slice.call(document.body.querySelectorAll('*'), 0, 6000)
      .filter(function (el) { return !el.closest(UI_SKIP); });
    var blocked = [], covered = [];
    function add(list, f) { if (f.nodes.length) list.push(f); }

    var noAlt = all.filter(function (e) { return e.tagName === 'IMG' && !e.hasAttribute('alt') && visible(e); });
    add(blocked, { id: 'img-no-alt', nodes: noAlt, title: 'Pictures with no description',
      why: plural(noAlt.length, 'picture carries', 'pictures carry') + ' no description at all, so a screen reader can only say "image".',
      fix: 'Only whoever put the picture there knows what it shows. A made-up description is worse than none, so the Copilot writes nothing.' });

    var unnamed = all.filter(function (e) {
      var t = e.tagName.toLowerCase(), role = (e.getAttribute('role') || '').toLowerCase();
      var c = t === 'button' || (t === 'a' && e.hasAttribute('href')) || role === 'button' || role === 'link';
      return c && visible(e) && announced(e) && !accName(e);
    });
    add(blocked, { id: 'name-missing', nodes: unnamed, title: 'Controls with no name',
      why: plural(unnamed.length, 'button or link has', 'buttons or links have') + ' nothing a screen reader can read out.',
      fix: 'The Copilot could guess from what sits nearby. A guess on a button that spends money is not a risk worth taking.' });

    var VAGUE = ['click here', 'read more', 'more', 'here', 'link', 'this', 'learn more', 'details', 'continue', 'see more'];
    var vague = all.filter(function (e) {
      if (e.tagName !== 'A' || !e.hasAttribute('href') || !visible(e)) return false;
      return VAGUE.indexOf(accName(e).toLowerCase().replace(/[.…>»\s]+$/, '').trim()) !== -1;
    });
    add(blocked, { id: 'vague-link', nodes: vague, title: 'Links that say nothing',
      why: plural(vague.length, 'link reads', 'links read') + ' as "read more" or something like it. Out of the sentence around them they say nothing about where they go.',
      fix: 'Rewriting a link can send somebody somewhere they did not expect, so the Copilot never touches one.' });

    var heads = all.filter(function (e) { return /^H[1-6]$/.test(e.tagName) && announced(e); });
    var skips = [], prev = 0, jump = null;
    heads.forEach(function (h) {
      var l = +h.tagName[1];
      if (prev && l > prev + 1) { skips.push(h); if (!jump) jump = prev + ' to H' + l; }
      prev = l;
    });
    add(blocked, { id: 'heading-skip', nodes: skips, title: 'A heading level skipped',
      why: 'The page jumps from H' + (jump || '') + '. Anyone moving through it by headings loses the shape of it.',
      fix: 'Renumbering headings changes what a page claims about itself. That is the author’s call.' });

    var unlabelled = all.filter(function (e) {
      var t = e.tagName.toLowerCase();
      if (t !== 'input' && t !== 'select' && t !== 'textarea') return false;
      if (e.type === 'hidden' || e.type === 'submit' || e.type === 'button') return false;
      return visible(e) && !accName(e);
    });
    add(blocked, { id: 'field-no-label', nodes: unlabelled, title: 'Form fields with no label',
      why: plural(unlabelled.length, 'field leans', 'fields lean') + ' on placeholder text, which vanishes the moment you type.',
      fix: 'The Copilot will not name a box it might name wrongly, least of all one you are about to type into.' });

    add(blocked, { id: 'no-lang', nodes: document.documentElement.lang ? [] : [document.documentElement],
      title: 'The page does not say what language it is in',
      why: 'A screen reader has to guess which voice to read it in, and it often guesses wrong.',
      fix: 'One attribute on one tag, and only the author can set it.' });

    var ghosts = all.filter(function (e) {
      if (!e.closest('[aria-hidden="true"]')) return false;
      var t = e.tagName.toLowerCase();
      var f = t === 'button' || t === 'select' || t === 'textarea' || (t === 'a' && e.hasAttribute('href')) ||
        (t === 'input' && e.type !== 'hidden');
      return f && !e.disabled && e.getAttribute('tabindex') !== '-1' && !e.closest('[inert]');
    });
    add(blocked, { id: 'ghost-focus', nodes: ghosts, title: 'Hidden from a screen reader, still reachable by keyboard',
      why: plural(ghosts.length, 'control is', 'controls are') + ' hidden from screen readers and still in the tab order. Someone tabbing lands where their screen reader says nothing.',
      fix: 'Untangling that changes how the page is built, and the Copilot does not rebuild pages.' });

    var forced = all.filter(function (e) { return parseInt(e.getAttribute('tabindex'), 10) > 0 && visible(e); });
    add(blocked, { id: 'positive-tabindex', nodes: forced, title: 'Focus order forced out of shape',
      why: plural(forced.length, 'control pulls itself', 'controls pull themselves') + ' out of the normal order with a positive tabindex, so tabbing jumps around.',
      fix: 'The Copilot never reorders controls. Moving one can change what a task means.' });

    var low = [], worst = 99;
    for (var i = 0; i < all.length && low.length < 60; i++) {
      var el = all[i];
      if (!ownsText(el) || !visible(el) || !announced(el)) continue;
      var cs = getComputedStyle(el);
      var fg = rgb(cs.color);
      if (!fg || fg.a < 0.85) continue;
      var bg = backdrop(el);
      if (!bg) continue;
      var size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
      var need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
      var r = ratio(fg, bg);
      if (r < need) { low.push(el); if (r < worst) worst = r; }
    }
    add(covered, { id: 'contrast', nodes: low, title: 'Text under the contrast floor',
      why: plural(low.length, 'piece', 'pieces') + ' of text sit below the readable minimum against what is behind them. The worst is ' + worst.toFixed(1) + ' to 1.',
      fix: 'High Contrast lifts these for you in a moment. It does nothing for the next person who arrives without it.' });

    add(covered, { id: 'no-landmarks', nodes: document.querySelector('main,[role=main]') ? [] : [document.body],
      title: 'No main region to skip to',
      why: 'Nothing here is marked as the main content, so a screen reader has no shortcut past the navigation.',
      fix: 'Add a skip link and the Copilot points it at its best guess at where the content starts. A guess is not the author saying so.' });

    var tiny = all.filter(function (e) {
      var t = e.tagName.toLowerCase();
      var c = t === 'button' || (t === 'a' && e.hasAttribute('href')) || (t === 'input' && e.type !== 'hidden');
      if (!c || !visible(e) || e.closest('p,li,td')) return false;
      var r = e.getBoundingClientRect();
      return r.width < 24 || r.height < 24;
    });
    add(covered, { id: 'small-target', nodes: tiny, title: 'Controls smaller than a fingertip',
      why: plural(tiny.length, 'control is', 'controls are') + ' under 24 pixels across. Hard to hit with a thumb, harder with a tremor.',
      fix: 'The Copilot can pad what you press. It cannot rebuild a layout drawn around them.' });

    var autos = all.filter(function (e) { return (e.tagName === 'VIDEO' || e.tagName === 'AUDIO') && e.autoplay; });
    add(covered, { id: 'autoplay', nodes: autos, title: 'Media that starts itself',
      why: plural(autos.length, 'item starts', 'items start') + ' playing without being asked.',
      fix: 'Low Motion stops them here. They still start for everybody else.' });

    return {
      blocked: blocked, covered: covered,
      count: blocked.length + covered.length,
      items: blocked.concat(covered).reduce(function (a, f) { return a + f.nodes.length; }, 0),
      scanned: all.length
    };
  }

  var qMarked = [];
  function clearQueryMarks() {
    qMarked.forEach(function (el) { el.removeAttribute('data-acp-mark'); });
    qMarked = [];
  }
  function markQuery(nodes) {
    clearQueryMarks();
    nodes.forEach(function (el) {
      if (!el || !el.setAttribute) return;
      el.setAttribute('data-acp-mark', '');
      qMarked.push(el);
    });
    if (nodes[0] && nodes[0].scrollIntoView) nodes[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* --- The language service -------------------------------------------------- */

  var MODELS = [
    ['anthropic/claude-haiku-4.5', 'Fast and cheap'],
    ['anthropic/claude-sonnet-5', 'Slower and better']
  ];
  var FIELDS = 'input,textarea,select,[contenteditable]';
  var FENCE = 'form,fieldset,[class*=payment],[class*=checkout],[class*=password],[id*=payment],[id*=login]';

  var PLAIN_RULES = 'You rewrite web text into plain, clear English for someone who finds the original hard. ' +
    'Keep every fact, number, date and condition. Change nothing about what it means. Add no advice or opinion. ' +
    'Do not drop a caveat that changes the meaning. Short sentences, everyday words. ' +
    'Reply with the rewritten text only: no heading, no preamble, no markdown, no quotation marks.';
  var EXPLAIN_RULES = 'You explain what a passage of web text means, for someone who found it hard. ' +
    'Two or three short sentences. Say only what the passage says. Invent no facts, give no advice. ' +
    'If it is genuinely ambiguous, say which part. Reply with the explanation only, no markdown.';

  function ask(system, user) {
    return new Promise(function (resolve, reject) {
      var body = JSON.stringify({
        model: state.lang.model, max_tokens: 800, temperature: 0.2,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user.slice(0, 4000) }]
      });
      var done = function (status, text) {
        var j;
        try { j = JSON.parse(text); } catch (e) { return reject(new Error('The service sent something unreadable.')); }
        if (status >= 400 || j.error) return reject(new Error((j.error && j.error.message) || ('The service answered ' + status + '.')));
        if (j.usage && typeof j.usage.cost === 'number') {
          state.lang.spent += j.usage.cost;
          state.lang.calls += 1;
          store.set('lang', state.lang);
        }
        var out = j.choices && j.choices[0] && j.choices[0].message.content;
        resolve((out || '').replace(/^#+\s.*\n+/, '').replace(/^["“]|["”]$/g, '').trim());
      };
      /* The userscript route goes around the page's CSP and around CORS, which
         is the one real advantage this has over a content script. */
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer ' + state.lang.key,
            'Content-Type': 'application/json',
            'X-Title': 'Accessibility Copilot'
          },
          data: body,
          onload: function (r) { done(r.status, r.responseText); },
          onerror: function () { reject(new Error('Could not reach the service.')); }
        });
      } else {
        fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + state.lang.key, 'Content-Type': 'application/json' },
          body: body
        }).then(function (r) { return r.text().then(function (t) { done(r.status, t); }); })
          .catch(function () { reject(new Error('Could not reach the service.')); });
      }
    });
  }

  /* --- The panel, in a shadow root so neither side can break the other ------- */

  var root, shadow, shadowSheet = null, ui = {};

  var PANEL_CSS = [
    ':host,*{box-sizing:border-box}',
    '.wrap{position:fixed;inset:0;pointer-events:none;z-index:2147483647;',
    'font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:13px;line-height:1.5}',
    '.launch{position:absolute;right:16px;bottom:16px;pointer-events:auto;display:inline-flex;align-items:center;gap:8px;',
    'min-height:44px;padding:10px 14px;background:#14202E;color:#FBF8F1;border:1px solid #14202E;border-radius:100px;',
    'cursor:pointer;font-weight:500;font-size:13px;line-height:1;font-family:inherit;box-shadow:0 18px 40px -22px rgba(0,0,0,.8)}',
    '.launch:hover{background:#1B4FD8;border-color:#1B4FD8;color:#fff}',
    '.count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;',
    'border-radius:100px;background:#1B4FD8;color:#fff;font-size:11px}',
    '.count[hidden]{display:none}',
    '.panel{position:absolute;right:16px;bottom:72px;pointer-events:auto;width:min(calc(100vw - 32px),380px);',
    'max-height:min(78vh,640px);display:flex;flex-direction:column;background:#FBF8F1;color:#14202E;',
    'border:1px solid #6A7B92;border-radius:14px;overflow:hidden;box-shadow:0 40px 90px -50px rgba(0,0,0,.9)}',
    '.panel[hidden]{display:none}',
    '.head{display:flex;flex:0 0 auto;align-items:center;gap:8px;padding:12px 14px;background:#F3EFE5;border-bottom:1px solid #DCD4C2}',
    '.head h2{margin:0;font:700 15px/1.2 system-ui,sans-serif}',
    '.head .where{margin-left:auto;font-size:11px;color:#4A5866}',
    '.x{width:28px;height:28px;border:0;background:none;color:#4A5866;cursor:pointer;border-radius:6px;font-size:14px}',
    '.x:hover{background:rgba(27,79,216,.08);color:#1539A8}',
    '.tabs{display:flex;flex:0 0 auto;background:#F3EFE5;border-bottom:1px solid #DCD4C2}',
    '.tab{flex:1;padding:9px 2px;background:none;border:0;border-bottom:2px solid transparent;color:#4A5866;',
    'cursor:pointer;font-weight:400;font-size:11px;line-height:1.3;font-family:inherit;letter-spacing:.03em}',
    '.tab:hover{background:rgba(27,79,216,.06);color:#14202E}',
    '.tab[aria-selected=true]{color:#1B4FD8;border-bottom-color:#1B4FD8;background:#FBF8F1}',
    '.body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 14px 14px;overscroll-behavior:contain}',
    '.pane[hidden]{display:none}',
    '.hint{margin:0 0 10px;font-size:11.5px;line-height:1.6;color:#4A5866}',
    '.prof{width:100%;text-align:left;display:grid;grid-template-columns:16px 1fr;gap:9px;align-items:start;',
    'padding:9px 10px;margin-bottom:6px;background:#F3EFE5;border:1px solid #DCD4C2;border-radius:9px;',
    'color:#14202E;cursor:pointer;font:inherit}',
    '.prof:hover,.prof[aria-pressed=true]{border-color:#1B4FD8;background:rgba(27,79,216,.07)}',
    '.dot{width:13px;height:13px;border-radius:100px;border:2px solid #6A7B92;margin-top:3px}',
    '.prof[aria-pressed=true] .dot{border-color:#1B4FD8;background:#1B4FD8;box-shadow:inset 0 0 0 2px #F3EFE5}',
    '.nm{display:block;font:600 13px/1.3 system-ui,sans-serif}',
    '.ds{display:block;margin-top:2px;font-size:11px;line-height:1.5;color:#4A5866}',
    '.grp{border-top:1px solid #DCD4C2;padding-top:11px;margin-top:11px}',
    '.grp:first-child{border-top:0;padding-top:0;margin-top:0}',
    '.grp h3{margin:0 0 9px;font-weight:500;font-size:11px;line-height:1;font-family:inherit;letter-spacing:.1em;text-transform:uppercase;color:#1B4FD8}',
    '.ctrl{margin-bottom:11px}',
    '.ctrl label,.ctrl .lg{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:5px;font-size:12px}',
    '.val{color:#1B4FD8;font-size:11px}',
    'input[type=range]{width:100%;accent-color:#1B4FD8;height:24px}',
    'select,input[type=password],input[type=text]{width:100%;font:inherit;font-size:12px;color:#14202E;',
    'background:#F3EFE5;border:1px solid #6A7B92;border-radius:6px;padding:7px 8px;min-height:36px}',
    '.sw{display:flex;align-items:center;gap:9px;width:100%;padding:5px 0;background:none;border:0;',
    'color:#14202E;cursor:pointer;font:inherit;font-size:12px;text-align:left}',
    '.box{flex:0 0 auto;width:34px;height:19px;border-radius:100px;border:1px solid #6A7B92;background:#F3EFE5;position:relative}',
    '.box::after{content:"";position:absolute;left:2px;top:2px;width:13px;height:13px;border-radius:100px;background:#6A7B92;transition:transform .18s}',
    '.sw[aria-pressed=true] .box{background:#1B4FD8;border-color:#1B4FD8}',
    '.sw[aria-pressed=true] .box::after{transform:translateX(15px);background:#fff}',
    '.log{display:grid;gap:6px}',
    '.log .row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 9px;',
    'background:#F3EFE5;border:1px solid #DCD4C2;border-radius:9px}',
    '.cat{display:block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#1B4FD8}',
    '.why{display:block;margin-top:3px;font-size:11.5px;line-height:1.55;color:#4A5866}',
    '.stet{padding:5px 8px;background:rgba(27,79,216,.07);border:1px solid rgba(27,79,216,.2);border-radius:5px;',
    'color:#1539A8;cursor:pointer;font:inherit;font-size:11px}',
    '.stet:hover{background:#1B4FD8;color:#fff}',
    '.empty{margin:0;padding:12px;border:1px dashed #6A7B92;border-radius:9px;font-size:11.5px;line-height:1.6;color:#4A5866}',
    '.q{border:1px solid #DCD4C2;border-radius:9px;background:#F3EFE5;margin-bottom:7px;overflow:hidden}',
    '.qbtn{width:100%;display:flex;align-items:center;gap:9px;padding:9px 10px;background:none;border:0;',
    'color:#14202E;cursor:pointer;font:600 12.5px/1.3 system-ui,sans-serif;text-align:left}',
    '.qbtn:hover{background:rgba(27,79,216,.07);color:#1539A8}',
    '.qbtn[aria-pressed=true]{background:#1B4FD8;color:#fff}',
    '.qt{flex:1}',
    '.qn{padding:2px 7px;border-radius:100px;background:rgba(27,79,216,.1);border:1px solid rgba(27,79,216,.2);color:#1B4FD8;font-size:11px}',
    '.qbtn[aria-pressed=true] .qn{background:rgba(255,255,255,.25);border-color:transparent;color:inherit}',
    '.qwhy,.qfix{margin:0;padding:0 10px 9px;font-size:11.5px;line-height:1.6}',
    '.qwhy{padding-top:8px;color:#14202E}',
    '.qfix{border-top:1px dashed #DCD4C2;padding-top:8px;color:#4A5866}',
    '.qh{margin:14px 0 3px;font:700 12.5px/1.3 system-ui,sans-serif}',
    '.qh:first-child{margin-top:0}',
    '.qnote{margin:0 0 8px;font-size:11px;line-height:1.55;color:#4A5866}',
    '.foot{display:flex;flex:0 0 auto;gap:7px;flex-wrap:wrap;padding:10px 14px;background:#F3EFE5;border-top:1px solid #DCD4C2}',
    '.btn{flex:1 1 auto;min-height:34px;padding:8px 11px;border-radius:7px;border:1px solid transparent;',
    'cursor:pointer;font-weight:500;font-size:11.5px;line-height:1.2;font-family:inherit}',
    '.pri{background:#1B4FD8;color:#fff;border-color:#1B4FD8}',
    '.pri:hover{background:#1539A8}',
    '.gh{background:transparent;color:#14202E;border-color:#6A7B92}',
    '.gh:hover{border-color:#1B4FD8;color:#1539A8;background:rgba(27,79,216,.06)}',
    '.meta{flex:1 0 100%;margin:0;font-size:10.5px;line-height:1.5;color:#4A5866}',
    '.bar{position:absolute;pointer-events:auto;display:flex;gap:1px;background:#14202E;border-radius:100px;padding:3px;',
    'box-shadow:0 16px 34px -18px rgba(0,0,0,.9)}',
    '.bar[hidden]{display:none}',
    '.bar button{min-height:32px;padding:6px 12px;background:none;border:0;color:#FBF8F1;border-radius:100px;',
    'cursor:pointer;font:inherit;font-size:11.5px;white-space:nowrap}',
    '.bar button:hover{background:#1B4FD8;color:#fff}',
    '.card{position:absolute;pointer-events:auto;width:min(calc(100vw - 32px),420px);max-height:70vh;overflow-y:auto;',
    'background:#FBF8F1;color:#14202E;border:1px solid #6A7B92;border-radius:14px;padding:16px;',
    'box-shadow:0 34px 70px -34px rgba(0,0,0,.85)}',
    '.card[hidden]{display:none}',
    '.card h3{margin:0 0 9px;padding-right:26px;font:700 15px/1.3 system-ui,sans-serif}',
    '.card .out{font:400 14px/1.6 system-ui,sans-serif}',
    '.card .out p{margin:0 0 8px}',
    '.note{margin:10px 0 0;font-size:11px;line-height:1.6;color:#4A5866}',
    '.quote{margin:10px 0 0;padding:9px 11px;border-left:3px solid #6A7B92;background:#F3EFE5;',
    'border-radius:0 6px 6px 0;font:400 13px/1.55 system-ui,sans-serif;color:#4A5866;max-height:170px;overflow:auto}',
    '.quote[hidden]{display:none}',
    '.rowb{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}',
    '.rowb .btn{flex:0 1 auto}',
    '.wait{display:flex;gap:5px;padding:8px 0}',
    '.wait i{width:7px;height:7px;border-radius:100px;background:#1B4FD8;animation:b 1.1s ease-in-out infinite}',
    '.wait i:nth-child(2){animation-delay:.14s}.wait i:nth-child(3){animation-delay:.28s}',
    '@keyframes b{0%,100%{opacity:.25}50%{opacity:1}}',
    '.live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}',
    ':focus-visible{outline:2px solid #1B4FD8;outline-offset:2px}',
    '.full{width:100%}.mt{margin-top:8px}.mt9{margin-top:9px}',
    '.hint.mt{margin:8px 0 0}',
    '.pair{display:flex;gap:7px}',
    '.card .x{position:absolute;right:10px;top:10px}'
  ].join('');

  function buildUI() {
    root = document.createElement('div');
    root.id = 'acp-root';
    shadow = root.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(root);

    var adopted = false;
    if ('adoptedStyleSheets' in ShadowRoot.prototype) {
      try {
        shadowSheet = new CSSStyleSheet();
        shadowSheet.replaceSync(PANEL_CSS);
        shadow.adoptedStyleSheets = [shadowSheet];
        adopted = true;
      } catch (e) { adopted = false; shadowSheet = null; }
    }
    if (!adopted) {
      var style = document.createElement('style');
      style.textContent = PANEL_CSS;
      shadow.appendChild(style);
    }

    var wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML =
      '<p class="live" role="status" aria-live="polite"></p>' +
      '<button class="launch" aria-expanded="false">Copilot<span class="count" hidden>0</span></button>' +
      '<section class="panel" hidden aria-label="Accessibility Copilot">' +
        '<div class="head"><h2>Copilot</h2><span class="where"></span>' +
          '<button class="x" aria-label="Close">✕</button></div>' +
        '<div class="tabs" role="tablist">' +
          '<button class="tab" role="tab" data-tab="profiles" aria-selected="true">Profiles</button>' +
          '<button class="tab" role="tab" data-tab="controls" aria-selected="false" tabindex="-1">Controls</button>' +
          '<button class="tab" role="tab" data-tab="log" aria-selected="false" tabindex="-1">Changed</button>' +
          '<button class="tab" role="tab" data-tab="queries" aria-selected="false" tabindex="-1">In your way</button>' +
        '</div>' +
        '<div class="body">' +
          '<div class="pane" data-pane="profiles">' +
            '<p class="hint">Pick a starting point. Every profile is a set of settings you can change, never a label for you.</p>' +
            '<div class="profs"></div></div>' +
          '<div class="pane" data-pane="controls" hidden></div>' +
          '<div class="pane" data-pane="log" hidden>' +
            '<p class="hint">Everything the Copilot is doing to this page, in plain words. Stet puts one back.</p>' +
            '<div class="log"></div></div>' +
          '<div class="pane" data-pane="queries" hidden>' +
            '<p class="hint">What is still in your way here, and why the Copilot will not move it. This is not an audit and it scores nobody.</p>' +
            '<div class="queries"></div>' +
            '<button class="btn gh full mt" data-act="rescan">Look again</button></div>' +
        '</div>' +
        '<div class="foot">' +
          '<button class="btn gh" data-act="exclude">Turn off here</button>' +
          '<button class="btn pri" data-act="restore">Restore original</button>' +
          '<p class="meta"></p>' +
        '</div>' +
      '</section>' +
      '<div class="bar" hidden role="toolbar" aria-label="What to do with the text you picked">' +
        '<button data-do="simplify">Plain words</button>' +
        '<button data-do="explain">What does this mean?</button>' +
      '</div>' +
      '<section class="card" hidden aria-label="Plain language"></section>';
    shadow.appendChild(wrap);

    ui = {
      wrap: wrap,
      live: wrap.querySelector('.live'),
      launch: wrap.querySelector('.launch'),
      count: wrap.querySelector('.count'),
      panel: wrap.querySelector('.panel'),
      where: wrap.querySelector('.where'),
      tabs: Array.prototype.slice.call(wrap.querySelectorAll('.tab')),
      panes: {},
      profs: wrap.querySelector('.profs'),
      controls: wrap.querySelector('.pane[data-pane=controls]'),
      log: wrap.querySelector('.log'),
      queries: wrap.querySelector('.queries'),
      meta: wrap.querySelector('.meta'),
      bar: wrap.querySelector('.bar'),
      card: wrap.querySelector('.card')
    };
    wrap.querySelectorAll('.pane').forEach(function (p) { ui.panes[p.dataset.pane] = p; });

    buildControls();
    wireUI();
  }

  function buildControls() {
    var html = '';
    GROUPS.forEach(function (g) {
      var keys = ORDER.filter(function (k) { return SCHEMA[k].group === g; });
      if (!keys.length) return;
      html += '<div class="grp"><h3>' + g + '</h3>';
      keys.forEach(function (k) {
        var m = SCHEMA[k];
        if (typeof m.def === 'boolean') {
          html += '<div class="ctrl"><button class="sw" data-key="' + k + '" aria-pressed="false">' +
            '<span class="box"></span><span>' + m.label + '</span></button></div>';
        } else if (m.options) {
          html += '<div class="ctrl"><label class="lg" for="c-' + k + '"><span>' + m.label + '</span></label>' +
            '<select id="c-' + k + '" data-key="' + k + '">' +
            m.options.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') +
            '</select></div>';
        } else {
          html += '<div class="ctrl"><label for="c-' + k + '"><span>' + m.label + '</span>' +
            '<span class="val" data-val="' + k + '"></span></label>' +
            '<input type="range" id="c-' + k + '" data-key="' + k + '" min="' + m.min + '" max="' + m.max + '" step="' + m.step + '"></div>';
        }
      });
      html += '</div>';
    });

    html += '<div class="grp"><h3>Where it applies</h3>' +
      '<div class="ctrl"><label class="lg" for="c-scope"><span>Changes land on</span></label>' +
      '<select id="c-scope">' +
        '<option value="global">Every site</option>' +
        '<option value="site">' + HOST + ' only</option>' +
        '<option value="session">This visit only</option>' +
      '</select></div>' +
      '<p class="hint mt">A setting made for one site always beats the global one. The panel header says which is winning here.</p>' +
      '<div class="ctrl mt9"><button class="btn gh full" data-act="clearsite">Clear the settings for ' + HOST + '</button></div>' +
      '</div>';

    html += '<div class="grp"><h3>Language</h3>' +
      '<p class="hint" id="langstate">Off. Nothing leaves this device.</p>' +
      '<div class="ctrl"><label class="lg" for="c-key"><span>Key, kept in this browser</span></label>' +
      '<input type="password" id="c-key" autocomplete="off" spellcheck="false" placeholder="sk-or-..."></div>' +
      '<div class="ctrl"><label class="lg" for="c-model"><span>Model</span></label>' +
      '<select id="c-model">' + MODELS.map(function (m) {
        return '<option value="' + m[0] + '">' + m[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="ctrl pair">' +
        '<button class="btn pri" data-act="savekey">Switch it on</button>' +
        '<button class="btn gh" data-act="forgetkey">Forget it</button></div>' +
      '<p class="hint mt">Then pick any text on the page and choose Plain words, or press Alt and P. ' +
      'Nothing is ever sent because a page loaded.</p></div>';

    html += '<div class="grp"><h3>Everything you have set</h3>' +
      '<div class="ctrl"><button class="btn gh full" data-act="wipe">Delete all of it</button></div>' +
      '<p class="hint mt">Profiles, site settings, the key, and what it has cost. Gone, from every site.</p></div>';

    ui.controls.innerHTML = html;
  }

  /* --- Rendering ------------------------------------------------------------- */

  var scanned = null;

  function render() {
    var changes = activeChanges();
    ui.count.textContent = String(changes.length);
    ui.count.hidden = changes.length === 0;

    var winner = isExcluded() ? 'off here'
      : session ? 'this visit'
      : siteSettings() ? HOST
      : state.profile ? (profileById(state.profile) || {}).name
      : changes.length ? 'custom' : 'original';
    ui.where.textContent = winner;

    ui.panel.querySelector('[data-act=exclude]').textContent = isExcluded() ? 'Turn back on here' : 'Turn off here';
    ui.meta.textContent = 'Changes land on ' + whereItLands() + '. Everything is kept in this browser only.';

    ui.profs.innerHTML = allProfiles().map(function (p) {
      return '<button class="prof" data-id="' + p.id + '" aria-pressed="' + (state.profile === p.id) + '">' +
        '<span class="dot"></span><span><span class="nm">' + p.name + '</span>' +
        '<span class="ds">' + p.desc + '</span></span></button>';
    }).join('');

    var s = effective();
    ORDER.forEach(function (k) {
      var m = SCHEMA[k], v = s[k];
      if (typeof m.def === 'boolean') {
        var sw = ui.controls.querySelector('.sw[data-key="' + k + '"]');
        if (sw) sw.setAttribute('aria-pressed', String(!!v));
      } else {
        var el = ui.controls.querySelector('[data-key="' + k + '"]');
        if (el && el.value !== String(v)) el.value = v;
        var val = ui.controls.querySelector('[data-val="' + k + '"]');
        if (val) {
          val.textContent = m.unit === '%' ? Math.round(v * 100) + '%'
            : !v ? 'the page’s own'
            : m.unit === 'ch' ? v + ' ch'
            : m.unit ? v + m.unit : String(v);
        }
      }
    });
    var sc = ui.controls.querySelector('#c-scope');
    if (sc && sc.value !== state.scope) sc.value = state.scope;
    var mo = ui.controls.querySelector('#c-model');
    if (mo && mo.value !== state.lang.model) mo.value = state.lang.model;
    var ls = ui.controls.querySelector('#langstate');
    if (ls) {
      ls.textContent = state.lang.key
        ? 'On. ' + state.lang.calls + ' request' + (state.lang.calls === 1 ? '' : 's') + ', ' +
          (state.lang.spent ? (state.lang.spent < 0.01 ? 'under a penny' : '$' + state.lang.spent.toFixed(3)) : 'nothing') + ' spent.'
        : 'Off. Nothing leaves this device.';
    }

    ui.log.innerHTML = changes.length
      ? changes.map(function (c) {
          return '<div class="row"><span><span class="cat">' + c.group + '</span>' +
            '<span class="why">' + c.why + '</span></span>' +
            '<button class="stet" data-key="' + c.key + '" aria-label="Stet: put back ' + c.label.toLowerCase() + '">stet</button></div>';
        }).join('')
      : '<p class="empty">' + (isExcluded()
          ? 'The Copilot is switched off on ' + HOST + '. Nothing is being changed.'
          : 'Nothing is changed. This page is exactly as its authors built it.') + '</p>';
  }

  function renderQueries() {
    if (!scanned) return;
    if (!scanned.count) {
      ui.queries.innerHTML = '<p class="empty">Nothing found on this page. That is the least anyone is owed ' +
        'rather than an achievement, and this check only knows how to look for a dozen things.</p>';
      return;
    }
    var group = function (title, note, list) {
      if (!list.length) return '';
      return '<h3 class="qh">' + title + '</h3><p class="qnote">' + note + '</p>' +
        list.map(function (f) {
          return '<div class="q"><button class="qbtn" aria-pressed="false" data-q="' + f.id + '">' +
            '<span class="qt">' + f.title + '</span><span class="qn">' + f.nodes.length + '</span></button>' +
            '<p class="qwhy">' + f.why + '</p><p class="qfix">' + f.fix + '</p></div>';
        }).join('');
    };
    ui.queries.innerHTML =
      '<p class="qnote">' + scanned.items + ' thing' + (scanned.items === 1 ? '' : 's') +
      ' across ' + scanned.scanned + ' elements on ' + HOST + '.</p>' +
      group('The Copilot will not touch these',
        'Fixing any of them means guessing at what somebody meant, and a wrong guess is worse than the problem.',
        scanned.blocked) +
      group('The Copilot can cover these',
        'It can make them bearable for you. The page is still broken underneath, for everyone who arrives without it.',
        scanned.covered);
  }

  function allProfiles() {
    return STARTERS.map(function (p) { return Object.assign({ starter: true }, p); }).concat(state.custom);
  }
  function profileById(id) {
    var a = allProfiles();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  /* --- Actions ---------------------------------------------------------------- */

  function commit(msg) { apply(); render(); say(msg); }

  function setSetting(k, v) {
    writeSetting(k, v);
    state.profile = null;
    store.set('profile', null);
    commit(v === SCHEMA[k].def ? SCHEMA[k].label + ' put back the way it was.' : SCHEMA[k].reason(v));
  }

  function applyProfile(id) {
    var p = profileById(id);
    if (!p) return;
    var s = Object.assign(defaults(), p.settings);
    ORDER.forEach(function (k) { writeSetting(k, s[k]); });
    state.profile = id;
    store.set('profile', id);
    commit(p.name + ' applied to ' + whereItLands() + '.');
  }

  function restoreAll() {
    session = null;
    delete state.sites[HOST];
    store.set('sites', state.sites);
    ORDER.forEach(function (k) { state.global[k] = SCHEMA[k].def; });
    store.set('global', state.global);
    state.profile = null;
    store.set('profile', null);
    restoreEverything();
    commit('Page restored. Every change is off.');
  }

  var sayTimer = null;
  function say(m) {
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { if (ui.live) ui.live.textContent = m; }, 80);
  }

  function doAction(act) {
    if (act === 'restore') return restoreAll();
    if (act === 'exclude') {
      var i = state.excluded.indexOf(HOST);
      if (i === -1) state.excluded.push(HOST); else state.excluded.splice(i, 1);
      store.set('excluded', state.excluded);
      if (isExcluded()) restoreEverything();
      return commit(isExcluded() ? 'Copilot is off on ' + HOST + '.' : 'Copilot is back on for ' + HOST + '.');
    }
    if (act === 'clearsite') {
      delete state.sites[HOST];
      store.set('sites', state.sites);
      return commit('Cleared the settings kept for ' + HOST + '.');
    }
    if (act === 'rescan') { scanned = scanPage(); renderQueries(); return say('Looked again at this page.'); }
    if (act === 'savekey') {
      var input = ui.controls.querySelector('#c-key');
      var v = (input.value || '').trim();
      if (!v) { say('Paste a key first.'); input.focus(); return; }
      state.lang.key = v;
      store.set('lang', state.lang);
      input.value = '';
      input.placeholder = 'kept in this browser';
      render();
      return say('The language service is on. Pick some text and choose Plain words.');
    }
    if (act === 'forgetkey') {
      state.lang.key = ''; state.lang.spent = 0; state.lang.calls = 0;
      store.set('lang', state.lang);
      var i2 = ui.controls.querySelector('#c-key');
      if (i2) { i2.value = ''; i2.placeholder = 'sk-or-...'; }
      render();
      return say('Key forgotten. Nothing can leave this device now.');
    }
    if (act === 'wipe') {
      ['global', 'sites', 'excluded', 'profile', 'scope', 'custom', 'lang'].forEach(store.del);
      state.global = defaults(); state.sites = {}; state.excluded = []; state.profile = null;
      state.scope = 'global'; state.custom = [];
      state.lang = { key: '', model: MODELS[0][0], spent: 0, calls: 0, noticeSeen: false };
      session = null;
      restoreEverything();
      buildControls();
      return commit('Everything deleted, on every site.');
    }
  }

  /* --- Selection ------------------------------------------------------------- */

  var picked = { text: '', node: null, rect: null }, busy = false;
  var barRule, cardRule;

  function readSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    var text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 12) return false;
    var range = sel.getRangeAt(0);
    var node = range.commonAncestorContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el.closest(UI_SKIP)) return false;
    if (el.closest(FIELDS)) return false;              /* what you typed never leaves */
    var r = range.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    picked = { text: text, node: el, rect: r };
    return true;
  }

  function placeBar() {
    ui.bar.hidden = false;
    var r = picked.rect;
    var w = ui.bar.offsetWidth, h = ui.bar.offsetHeight;
    var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    var top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    if (barRule === undefined) barRule = liveRule(shadowSheet, '.bar');
    writePos(barRule, ui.bar, Math.round(left), Math.round(top));
  }

  function openCard(html) {
    ui.card.innerHTML = '<button class="x" data-act="close" aria-label="Close">✕</button>' + html;
    ui.card.hidden = false;
    var r = picked.rect;
    var w = ui.card.offsetWidth;
    var left = r ? Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) : 16;
    var top = r ? r.bottom + 10 : 80;
    if (top + ui.card.offsetHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - ui.card.offsetHeight - 12);
    }
    if (cardRule === undefined) cardRule = liveRule(shadowSheet, '.card');
    writePos(cardRule, ui.card, Math.round(left), Math.round(top));
    var f = ui.card.querySelector('.btn') || ui.card.querySelector('.x');
    if (f) f.focus();
  }
  function closeCard() { ui.card.hidden = true; busy = false; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function startLang(kind) {
    if (!picked.text || busy) return;
    ui.bar.hidden = true;

    if (!state.lang.key) {
      return openCard('<h3>The language service is not switched on</h3>' +
        '<p class="note">Rewriting is the one part that may leave your device, so it stays off until you turn it on. ' +
        'Open the Copilot panel, go to Controls, and paste a key under Language.</p>' +
        '<div class="rowb"><button class="btn pri" data-act="close">Right you are</button></div>');
    }

    var fenced = picked.node.closest(FENCE);
    if (fenced && !picked.node.closest('article, main, [role=main]')) {
      return openCard('<h3>This one is fenced off</h3>' +
        '<p class="note">This sits inside a form, or in something that looks like payment or sign-in wording. ' +
        'Rewriting any of it can change what you are agreeing to.</p>' +
        '<blockquote class="quote">' + esc(picked.text.slice(0, 240)) + '</blockquote>' +
        '<p class="note">You can send it anyway. The page is not changed either way.</p>' +
        '<div class="rowb"><button class="btn pri" data-act="send" data-kind="' + kind + '">Send it anyway</button>' +
        '<button class="btn gh" data-act="close">Leave it alone</button></div>');
    }

    if (!state.lang.noticeSeen) {
      return openCard('<h3>What is about to leave this device</h3>' +
        '<p class="note">Only the passage you picked. Not the page, not its address, not the site you are on, ' +
        'and never anything you have typed. The answer comes back beside the original.</p>' +
        '<blockquote class="quote">' + esc(picked.text.slice(0, 240)) + (picked.text.length > 240 ? '…' : '') + '</blockquote>' +
        '<div class="rowb"><button class="btn pri" data-act="send" data-kind="' + kind + '">Send just this</button>' +
        '<button class="btn gh" data-act="close">Not now</button></div>' +
        '<p class="note">Said once. After this it just runs when you ask.</p>');
    }
    runLang(kind);
  }

  function runLang(kind) {
    state.lang.noticeSeen = true;
    store.set('lang', state.lang);
    busy = true;
    var source = picked.text;
    var verb = kind === 'explain' ? 'Working out what it means' : 'Putting it in plain words';
    openCard('<h3>' + verb + '</h3><div class="wait"><i></i><i></i><i></i></div>' +
      '<p class="note">The page is still yours while this runs. Nothing on it has changed.</p>');
    say(verb + '.');

    ask(kind === 'explain' ? EXPLAIN_RULES : PLAIN_RULES, source).then(function (out) {
      busy = false;
      render();
      openCard('<h3>' + (kind === 'explain' ? 'What it means' : 'In plain words') + '</h3>' +
        '<div class="out"><p>' + esc(out).replace(/\n+/g, '</p><p>') + '</p></div>' +
        '<p class="note">' + (kind === 'explain'
          ? 'This explains the passage and nothing else. It is not advice, and the original wording is what binds.'
          : 'A rewrite can drop detail. The original is one press away, and it is the one that counts.') + '</p>' +
        '<div class="rowb"><button class="btn gh" data-act="orig" aria-expanded="false">View the original</button>' +
        '<button class="btn pri" data-act="close">Done</button></div>' +
        '<blockquote class="quote" hidden>' + esc(source) + '</blockquote>' +
        '<p class="note">' + state.lang.model + ' · ' + state.lang.calls + ' request' +
        (state.lang.calls === 1 ? '' : 's') + ' · ' +
        (state.lang.spent < 0.01 ? 'under a penny' : '$' + state.lang.spent.toFixed(3)) + ' so far</p>');
      say('Done. The original is one press away.');
    }).catch(function (err) {
      busy = false;
      openCard('<h3>That did not go through</h3>' +
        '<p class="note">' + esc(err.message || 'No answer.') + '</p>' +
        '<p class="note">The page is exactly as it was. Nothing was changed and nothing was lost.</p>' +
        '<div class="rowb"><button class="btn pri" data-act="retry" data-kind="' + kind + '">Try again</button>' +
        '<button class="btn gh" data-act="close">Leave it</button></div>');
      say('That did not go through. The page is unchanged.');
    });
  }

  /* --- Wiring ----------------------------------------------------------------- */

  function selectTab(name) {
    ui.tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      ui.panes[t.dataset.tab].hidden = !on;
    });
    if (name === 'queries' && !scanned) { scanned = scanPage(); renderQueries(); }
    if (name !== 'queries') clearQueryMarks();
  }

  function togglePanel(open) {
    ui.panel.hidden = !open;
    ui.launch.setAttribute('aria-expanded', String(open));
    if (open) render();
  }

  function wireUI() {
    ui.launch.addEventListener('click', function () { togglePanel(ui.panel.hidden); });
    ui.panel.querySelector('.x').addEventListener('click', function () { togglePanel(false); ui.launch.focus(); });

    ui.tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { selectTab(t.dataset.tab); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = ui.tabs[(i + d + ui.tabs.length) % ui.tabs.length];
        selectTab(n.dataset.tab);
        n.focus();
      });
    });

    ui.profs.addEventListener('click', function (e) {
      var b = e.target.closest('.prof');
      if (b) applyProfile(b.dataset.id);
    });

    ui.controls.addEventListener('click', function (e) {
      var sw = e.target.closest('.sw');
      if (sw) return setSetting(sw.dataset.key, !effective()[sw.dataset.key]);
      var a = e.target.closest('[data-act]');
      if (a) doAction(a.dataset.act);
    });
    ui.controls.addEventListener('input', function (e) {
      var k = e.target.dataset && e.target.dataset.key;
      if (!k) return;
      setSetting(k, e.target.type === 'range' ? parseFloat(e.target.value) : e.target.value);
    });
    ui.controls.addEventListener('change', function (e) {
      if (e.target.id === 'c-scope') {
        state.scope = e.target.value;
        store.set('scope', state.scope);
        return commit('Changes now land on ' + whereItLands() + '.');
      }
      if (e.target.id === 'c-model') {
        state.lang.model = e.target.value;
        store.set('lang', state.lang);
        say('Model set.');
      }
    });

    ui.log.addEventListener('click', function (e) {
      var b = e.target.closest('.stet');
      if (b) setSetting(b.dataset.key, SCHEMA[b.dataset.key].def);
    });

    ui.panes.queries.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (a) return doAction(a.dataset.act);
      var b = e.target.closest('.qbtn');
      if (!b || !scanned) return;
      var all = scanned.blocked.concat(scanned.covered);
      var f = all.filter(function (x) { return x.id === b.dataset.q; })[0];
      if (!f) return;
      var was = b.getAttribute('aria-pressed') === 'true';
      ui.panes.queries.querySelectorAll('.qbtn').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      if (was) { clearQueryMarks(); return say('Marks cleared.'); }
      b.setAttribute('aria-pressed', 'true');
      markQuery(f.nodes);
      say('Marked ' + f.nodes.length + ' on the page: ' + f.title + '.');
    });

    ui.panel.querySelector('.foot').addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (a) doAction(a.dataset.act);
    });

    ui.bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    ui.bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-do]');
      if (b) startLang(b.dataset.do);
    });

    ui.card.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'close') return closeCard();
      if (a.dataset.act === 'send' || a.dataset.act === 'retry') return runLang(a.dataset.kind);
      if (a.dataset.act === 'orig') {
        var q = ui.card.querySelector('.quote');
        var show = q.hidden;
        q.hidden = !show;
        a.textContent = show ? 'Hide the original' : 'View the original';
        a.setAttribute('aria-expanded', String(show));
      }
    });

    var t = null;
    var onSel = function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (!ui.card.hidden) return;
        if (readSelection()) placeBar(); else ui.bar.hidden = true;
      }, 180);
    };
    document.addEventListener('mouseup', onSel);
    document.addEventListener('selectionchange', onSel);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!ui.card.hidden) return closeCard();
        if (!ui.panel.hidden) { togglePanel(false); ui.launch.focus(); }
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if ((e.key === 'p' || e.key === 'P') && readSelection()) { e.preventDefault(); startLang('simplify'); }
        if ((e.key === 'e' || e.key === 'E') && readSelection()) { e.preventDefault(); startLang('explain'); }
        if (e.key === 'a' || e.key === 'A') { e.preventDefault(); togglePanel(ui.panel.hidden); }
      }
    });
  }

  /* --- Boot -------------------------------------------------------------------- */

  ensureUiSheet();
  buildUI();
  apply();
  render();

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Open the Copilot panel', function () { togglePanel(true); });
    GM_registerMenuCommand('Restore this page', restoreAll);
    GM_registerMenuCommand('Turn off on ' + HOST, function () { doAction('exclude'); });
  }

  /* Pages that rebuild themselves get the style put back, not a full rescan. */
  var mo = new MutationObserver(function () {
    if (styleEl && !styleEl.isConnected) { styleEl = null; lastCss = null; apply(); }
    if (uiStyleEl && !uiStyleEl.isConnected) { uiStyleEl = null; ensureUiSheet(); }
    if (root && !root.isConnected) document.documentElement.appendChild(root);
  });
  mo.observe(document.documentElement, { childList: true, subtree: false });

  window.AccessibilityCopilot = {
    open: togglePanel, apply: apply, restore: restoreAll,
    scan: function () { scanned = scanPage(); renderQueries(); return scanned; },
    state: function () { return { effective: effective(), scope: state.scope, host: HOST }; },
    setKey: function (k) { state.lang.key = k; store.set('lang', state.lang); render(); },
    pick: startLang
  };
})();
