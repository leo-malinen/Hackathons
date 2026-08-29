/* ==========================================================================
   Small working parts on the inner pages: the counting demo on How it works,
   the delete controls on Privacy, and the onboarding on Get started.
   Each one guards on the elements it needs, so this file is safe everywhere.
   ========================================================================== */

(function () {
  'use strict';

  /* --- How it works: learning counts, then asks ---------------------------- */

  function learningDemo() {
    var bump = document.getElementById('learn-bump');
    if (!bump) return;
    var clear = document.getElementById('learn-clear');
    var tally = document.getElementById('learn-tally');
    var box = document.getElementById('learn-propose');
    var text = document.getElementById('learn-text');
    var say = document.getElementById('learn-say');
    var counts = tally.querySelectorAll('.cnt');
    var n = 0, answered = false;

    function paint() {
      counts[0].textContent = String(n);
      var show = n >= 3 && !answered;
      if (box.hidden === !show) box.hidden = !show;
      if (show) text.textContent = 'You have changed text size ' + n + ' times. Save it to Clear Reading?';
    }

    bump.addEventListener('click', function () {
      n++;
      paint();
      say.textContent = n < 3
        ? 'Counted. That is all it did.'
        : 'Three times is a pattern, so it asks. It still has not changed anything.';
    });
    clear.addEventListener('click', function () {
      n = 0; answered = false;
      paint();
      say.textContent = 'Count cleared. It knows nothing about you again.';
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-learn]');
      if (!b) return;
      answered = true;
      paint();
      say.textContent = b.dataset.learn === 'yes'
        ? 'Saved into your copy of Clear Reading. The original profile is untouched.'
        : 'Turned down, and it will not ask about text size again.';
    });
    paint();
  }

  /* --- Privacy: see it, delete it ------------------------------------------ */

  function privacyControls() {
    var show = document.getElementById('show-store');
    if (!show) return;
    var wrap = document.getElementById('store-wrap');
    var out = document.getElementById('store-out');
    var say = document.getElementById('wipe-say');

    show.addEventListener('click', function () {
      var data = window.Copilot ? window.Copilot.stored() : { local: null, session: null };
      out.value = (data.local === null && data.session === null)
        ? 'Nothing is stored. You have not changed a setting on this site yet.'
        : JSON.stringify(data, null, 2);
      wrap.hidden = false;
      out.focus();
    });

    document.getElementById('forget').addEventListener('click', function () {
      if (!window.Copilot) return;
      window.Copilot.forget();
      say.textContent = 'Deleted the counts, the dismissed suggestions, and any profiles you built.';
      if (!wrap.hidden) show.click();
    });

    document.getElementById('wipe').addEventListener('click', function () {
      if (!window.Copilot) return;
      window.Copilot.wipe();
      say.textContent = 'Everything deleted, and the page is back the way it was published.';
      if (!wrap.hidden) show.click();
    });
  }

  /* --- Get started: the four questions -------------------------------------- */

  var QUESTIONS = [
    {
      q: 'How is the text on most websites for you?',
      note: 'Whatever you pick, you can move every one of these settings afterwards.',
      opts: [
        { nm: 'About right', ds: 'Leave the type alone.', set: {} },
        { nm: 'A little small and tight', ds: 'A gentle lift in size and spacing.', set: { scale: 1.1, lineHeight: 1.8, letterSpacing: 0.02 } },
        { nm: 'Tiring to read for long', ds: 'A wider face, more air, a shorter line, and a ruler.', set: { fontFamily: 'legible', scale: 1.15, lineHeight: 1.9, letterSpacing: 0.04, wordSpacing: 0.08, measure: 58, ruler: true } },
        { nm: 'I need it much bigger', ds: 'A large lift in size with a much shorter line.', set: { scale: 1.4, lineHeight: 1.9, measure: 48, links: true } }
      ]
    },
    {
      q: 'How do you feel about pages that move on their own?',
      note: 'Sliding banners, drifting backgrounds, videos that start themselves.',
      opts: [
        { nm: 'They do not bother me', ds: 'Leave motion alone.', set: {} },
        { nm: 'I would rather they did not', ds: 'Animation, auto-play, and parallax stopped.', set: { motion: true } },
        { nm: 'Movement can make me unwell', ds: 'Everything held still, and pictures taken down a notch.', set: { motion: true, dim: true } }
      ]
    },
    {
      q: 'How are the colours on most sites?',
      note: 'Around 81 in every 100 of the most visited home pages carry low contrast text, so this one is common.',
      opts: [
        { nm: 'Fine as they are', ds: 'Leave colour alone.', set: {} },
        { nm: 'I want stronger contrast', ds: 'Every colour pushed to its strongest, links and focus marked twice.', set: { contrast: 'high', links: true, focus: true } },
        { nm: 'I prefer a dark page', ds: 'A dark background with the text lightened to match.', set: { contrast: 'dark', links: true } },
        { nm: 'Some colours are hard to tell apart', ds: 'A colour shift, and links marked rather than only coloured.', set: { cvd: 'deutan', links: true } }
      ]
    },
    {
      q: 'Anything else that would help?',
      note: 'One more and you are done.',
      opts: [
        { nm: 'No, that is enough', ds: 'Finish here.', set: {} },
        { nm: 'Plainer wording where it exists', ds: 'The plain-language version, with the original one press away.', set: { plain: true, fontFamily: 'legible' } },
        { nm: 'I use the keyboard, not a mouse', ds: 'A loud focus ring, a visible skip link, and the page structure on show.', set: { focus: true, skip: true, outline: true, links: true } },
        { nm: 'A ruler to hold my place', ds: 'A reading ruler that follows your pointer.', set: { ruler: true } }
      ]
    }
  ];

  function onboarding() {
    var root = document.getElementById('onb');
    if (!root || !window.Copilot) return;

    var qEl = document.getElementById('onb-q');
    var noteEl = document.getElementById('onb-note');
    var optsEl = document.getElementById('onb-opts');
    var progEl = document.getElementById('onb-prog');
    var titleEl = document.getElementById('onb-title');
    var backBtn = document.getElementById('onb-back');
    var nextBtn = document.getElementById('onb-next');
    var skipBtn = document.getElementById('onb-skip');

    var at = 0;
    var picks = [null, null, null, null];

    function merged() {
      var s = {};
      picks.forEach(function (p, i) {
        if (p === null) return;
        Object.assign(s, QUESTIONS[i].opts[p].set);
      });
      return s;
    }

    function applyNow() {
      var d = window.Copilot.defaults();
      var s = merged();
      window.Copilot.order.forEach(function (k) {
        window.Copilot.set(k, s[k] === undefined ? d[k] : s[k]);
      });
    }

    function renderQ() {
      var Q = QUESTIONS[at];
      titleEl.textContent = 'A few preferences';
      progEl.textContent = 'Question ' + (at + 1) + ' of ' + QUESTIONS.length;
      qEl.textContent = Q.q;
      noteEl.textContent = Q.note;
      optsEl.innerHTML = Q.opts.map(function (o, i) {
        return '<button type="button" class="onb-opt" data-i="' + i + '" aria-pressed="' + (picks[at] === i) + '">' +
          '<span class="dot" aria-hidden="true"></span><span><span class="nm">' + o.nm + '</span>' +
          '<span class="ds">' + o.ds + '</span></span></button>';
      }).join('');
      backBtn.disabled = at === 0;
      nextBtn.textContent = at === QUESTIONS.length - 1 ? 'Finish' : 'Next question';
      skipBtn.hidden = false;
    }

    function renderDone() {
      var s = merged();
      var keys = Object.keys(s);
      titleEl.textContent = 'Your profile';
      progEl.textContent = 'Done';
      qEl.textContent = keys.length ? 'Here is what you chose.' : 'You chose to change nothing.';
      noteEl.textContent = keys.length
        ? 'It is applied to this site already. Every line has a stet beside it in the panel.'
        : 'That is a real answer. The Copilot stays out of the way until you want it.';

      var lines = keys.map(function (k) {
        var m = window.Copilot.schema[k];
        if (!m) return null;
        return m.reason(s[k]);
      }).filter(Boolean);

      optsEl.innerHTML = '<div class="onb-result">' +
        (lines.length ? '<ul class="onb-summary">' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '') +
        '<label class="field" style="margin:0"><span>Call this profile</span>' +
        '<input type="text" id="onb-name" value="My reading" maxlength="40"></label>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-primary" id="onb-save">Save it</button>' +
        '<button type="button" class="btn btn-ghost" id="onb-again">Start the questions again</button>' +
        '<a class="btn btn-ghost" href="demo.html">Try it on the demo page</a></div>' +
        '<p class="field-note" id="onb-say" role="status"></p></div>';

      backBtn.disabled = false;
      nextBtn.hidden = true;
      skipBtn.hidden = true;

      document.getElementById('onb-save').addEventListener('click', function () {
        var nm = (document.getElementById('onb-name').value || 'My reading').trim() || 'My reading';
        window.Copilot.addProfile({
          id: 'onb-' + nm.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28),
          name: nm, desc: 'Built from your four answers.', settings: merged()
        });
        document.getElementById('onb-say').textContent = 'Saved as ' + nm + '. It is on the profiles page now.';
      });
      document.getElementById('onb-again').addEventListener('click', function () {
        picks = [null, null, null, null];
        at = 0;
        nextBtn.hidden = false;
        applyNow();
        renderQ();
        qEl.focus && qEl.focus();
      });
    }

    optsEl.addEventListener('click', function (e) {
      var b = e.target.closest('.onb-opt');
      if (!b) return;
      picks[at] = parseInt(b.dataset.i, 10);
      optsEl.querySelectorAll('.onb-opt').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      applyNow();
    });

    nextBtn.addEventListener('click', function () {
      if (at < QUESTIONS.length - 1) { at++; renderQ(); }
      else renderDone();
    });
    backBtn.addEventListener('click', function () {
      if (nextBtn.hidden) { nextBtn.hidden = false; renderQ(); return; }
      if (at > 0) { at--; renderQ(); }
    });
    skipBtn.addEventListener('click', function () {
      picks = [null, null, null, null];
      applyNow();
      at = QUESTIONS.length - 1;
      renderDone();
    });

    renderQ();
  }

  function boot() {
    learningDemo();
    privacyControls();
    onboarding();
  }

  if (window.Copilot) boot();
  else document.addEventListener('copilot:ready', boot, { once: true });
})();
