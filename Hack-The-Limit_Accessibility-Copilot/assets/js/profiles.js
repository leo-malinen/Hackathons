/* ==========================================================================
   The profiles page. Every control here drives the same engine that runs the
   rail, so moving one changes the page you are standing on.
   ========================================================================== */

(function () {
  'use strict';

  var grid = document.getElementById('prof-grid');
  var workshop = document.getElementById('workshop');
  if (!grid || !workshop) return;

  var C, SCHEMA, ORDER, GROUPS, DEFAULTS;

  /* A plain sentence per profile, listing what it turns on. */
  function bullets(p) {
    return Object.keys(p.settings).map(function (k) {
      var v = p.settings[k];
      var m = SCHEMA[k];
      if (!m) return null;
      if (typeof m.def === 'boolean') return m.label;
      if (m.options) {
        var o = m.options.filter(function (x) { return x[0] === v; })[0];
        return m.label + ': ' + (o ? o[1] : v);
      }
      if (m.unit === '%') return m.label + ' ' + Math.round(v * 100) + '%';
      if (m.unit === 'ch') return m.label + ' ' + v + ' characters';
      return m.label + ' ' + v;
    }).filter(Boolean);
  }

  function renderGrid() {
    var active = C.getState().profile;
    grid.innerHTML = C.profiles().filter(function (p) { return p.starter; }).map(function (p, i) {
      return '<article class="prof" data-on="' + (active === p.id) + '">' +
        '<h3><span class="n">' + String(i + 1).padStart(2, '0') + '</span>' + p.name + '</h3>' +
        '<p>' + p.desc + '</p>' +
        '<ul>' + bullets(p).map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' +
        '<div class="go"><button type="button" class="btn ' + (active === p.id ? 'btn-ghost' : 'btn-primary') +
        '" data-apply="' + p.id + '">' + (active === p.id ? 'Applied to this site' : 'Apply to this site') + '</button></div>' +
        '</article>';
    }).join('');
  }

  function renderWorkshop() {
    var html = '';
    GROUPS.forEach(function (g) {
      var keys = ORDER.filter(function (k) { return SCHEMA[k].group === g; });
      if (!keys.length) return;
      html += '<div class="wk-group"><h3>' + g + '</h3>';
      keys.forEach(function (k) {
        var m = SCHEMA[k];
        if (typeof m.def === 'boolean') {
          html += '<div class="wk-ctrl"><button type="button" class="cp-switch" data-key="' + k + '" aria-pressed="false">' +
            '<span class="box" aria-hidden="true"></span><span>' + m.label + '</span></button></div>';
        } else if (m.options) {
          html += '<div class="wk-ctrl"><label class="lg" for="wk-' + k + '"><span>' + m.label + '</span></label>' +
            '<select id="wk-' + k + '" data-key="' + k + '">' +
            m.options.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') +
            '</select></div>';
        } else {
          html += '<div class="wk-ctrl"><label for="wk-' + k + '"><span>' + m.label + '</span>' +
            '<span class="val" data-val="' + k + '"></span></label>' +
            '<input type="range" id="wk-' + k + '" data-key="' + k + '" min="' + m.min + '" max="' + m.max +
            '" step="' + m.step + '"></div>';
        }
      });
      html += '</div>';
    });
    workshop.innerHTML = html;
  }

  function syncWorkshop() {
    var s = C.get();
    ORDER.forEach(function (k) {
      var m = SCHEMA[k], v = s[k];
      if (typeof m.def === 'boolean') {
        var sw = workshop.querySelector('.cp-switch[data-key="' + k + '"]');
        if (sw) sw.setAttribute('aria-pressed', String(!!v));
      } else {
        var el = workshop.querySelector('[data-key="' + k + '"]');
        if (el && el.value !== String(v)) el.value = v;
        var val = workshop.querySelector('[data-val="' + k + '"]');
        if (val) {
          var t = m.unit === '%' ? Math.round(v * 100) + '%'
            : m.unit === 'ch' ? v + ' ch'
            : m.unit ? v + m.unit : String(v);
          if (val.textContent !== t) val.textContent = t;
        }
      }
    });
  }

  /* --- Saving, listing, deleting --------------------------------------------- */

  var nameEl = document.getElementById('save-name');
  var saySave = document.getElementById('save-say');
  var customList = document.getElementById('custom-list');

  function slug(s) {
    return 'yours-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'yours';
  }

  function renderCustom() {
    var custom = C.profiles().filter(function (p) { return !p.starter; });
    customList.innerHTML = custom.map(function (p) {
      return '<div class="custom-row"><span class="nm">' + p.name + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-apply="' + p.id + '">Apply</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-del="' + p.id + '">Delete</button></div>';
    }).join('');
  }

  /* --- Export and import ------------------------------------------------------ */

  var port = document.getElementById('port');
  var sayPort = document.getElementById('port-say');

  function fillPort() {
    var st = C.getState();
    port.value = JSON.stringify({
      name: st.profile || 'my settings',
      settings: C.get()
    }, null, 2);
  }

  function loadPort() {
    var data;
    try { data = JSON.parse(port.value); }
    catch (e) { sayPort.textContent = 'That text is not a profile. Check it is the whole thing, braces and all.'; return; }
    if (!data || typeof data.settings !== 'object') {
      sayPort.textContent = 'That text is missing its settings. Nothing was changed.';
      return;
    }
    var applied = 0;
    ORDER.forEach(function (k) {
      if (data.settings[k] === undefined) return;
      var v = data.settings[k];
      if (typeof SCHEMA[k].def === 'number') v = parseFloat(v);
      if (typeof SCHEMA[k].def === 'boolean') v = !!v;
      C.set(k, v);
      applied++;
    });
    sayPort.textContent = applied + ' settings loaded and applied to this site.';
    syncWorkshop();
    renderGrid();
  }

  /* --- Wiring ------------------------------------------------------------------ */

  function boot() {
    C = window.Copilot;
    SCHEMA = C.schema; ORDER = C.order; GROUPS = C.groups; DEFAULTS = C.defaults();

    renderGrid();
    renderWorkshop();
    renderCustom();
    syncWorkshop();
    fillPort();

    document.addEventListener('click', function (e) {
      var ap = e.target.closest('[data-apply]');
      if (ap) { C.applyProfile(ap.dataset.apply); return; }
      var del = e.target.closest('[data-del]');
      if (del) {
        C.removeProfile(del.dataset.del);
        renderCustom();
        saySave.textContent = 'Profile deleted.';
      }
    });

    workshop.addEventListener('click', function (e) {
      var sw = e.target.closest('.cp-switch');
      if (sw && sw.dataset.key) C.set(sw.dataset.key, !C.get()[sw.dataset.key]);
    });
    workshop.addEventListener('input', function (e) {
      var k = e.target.dataset && e.target.dataset.key;
      if (!k) return;
      C.set(k, e.target.type === 'range' ? parseFloat(e.target.value) : e.target.value);
    });

    document.getElementById('save-profile').addEventListener('click', function () {
      var n = (nameEl.value || '').trim();
      if (!n) { saySave.textContent = 'Give it a name first, then it has something to be called.'; nameEl.focus(); return; }
      C.addProfile({ id: slug(n), name: n, desc: 'Yours, saved on this device.', settings: C.get() });
      nameEl.value = '';
      saySave.textContent = 'Saved as ' + n + ', and applied.';
      renderCustom();
      renderGrid();
    });

    document.getElementById('refresh-port').addEventListener('click', function () {
      fillPort();
      sayPort.textContent = 'The box now holds your current settings.';
    });
    document.getElementById('load-port').addEventListener('click', loadPort);

    /* Any change from anywhere, including the rail, keeps this page in step. */
    document.addEventListener('copilot:change', function () {
      syncWorkshop();
      renderGrid();
      renderCustom();
      fillPort();
    });
  }

  if (window.Copilot) boot();
  else document.addEventListener('copilot:ready', boot, { once: true });
})();
