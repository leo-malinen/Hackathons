/* ==========================================================================
   Selection first, exactly as the brief asks: pick a passage, ask for plain
   words or an explanation, and get it back beside the original rather than
   instead of it. Nothing is ever sent because a page loaded.
   ========================================================================== */

(function () {
  'use strict';

  var L = null;
  var bar = null, card = null, live = null;
  var current = { text: '', node: null, rect: null };
  var noticeKey = 'acp.lang.notice.v1';

  function seenNotice() {
    try { return localStorage.getItem(noticeKey) === '1'; } catch (e) { return false; }
  }
  function rememberNotice() {
    try { localStorage.setItem(noticeKey, '1'); } catch (e) { /* blocked */ }
  }

  /* --- The floating bar ---------------------------------------------------- */

  function ensureParts() {
    if (bar) return;

    live = document.createElement('p');
    live.className = 'cp-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);

    bar = document.createElement('div');
    bar.className = 'sel-bar';
    bar.hidden = true;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'What to do with the text you picked');
    bar.innerHTML =
      '<button type="button" data-do="simplify">Plain words</button>' +
      '<button type="button" data-do="explain">What does this mean?</button>';
    document.body.appendChild(bar);

    /* Pressing a button must not throw the selection away. */
    bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-do]');
      if (b) start(b.dataset.do);
    });

    card = document.createElement('section');
    card.className = 'sel-card';
    card.hidden = true;
    card.setAttribute('aria-label', 'Plain language');
    document.body.appendChild(card);

    card.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'close') closeCard();
      if (act.dataset.act === 'orig') {
        var o = card.querySelector('.sel-orig');
        var on = o.hidden;
        o.hidden = !on;
        act.textContent = on ? 'Hide the original' : 'View the original';
        act.setAttribute('aria-expanded', String(on));
      }
      if (act.dataset.act === 'send') { rememberNotice(); run(act.dataset.kind); }
      if (act.dataset.act === 'cancel') closeCard();
      if (act.dataset.act === 'retry') run(act.dataset.kind);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !card.hidden) { closeCard(); return; }
      /* A keyboard selection cannot reach a floating bar by tabbing, so it
         gets a shortcut instead, and the bar says what it is. */
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'p' || e.key === 'P') { if (readSelection()) { e.preventDefault(); start('simplify'); } }
        if (e.key === 'e' || e.key === 'E') { if (readSelection()) { e.preventDefault(); start('explain'); } }
      }
    });
  }

  /* --- Reading what the visitor picked ------------------------------------- */

  function readSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    var text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 12) return false;

    var range = sel.getRangeAt(0);
    var node = range.commonAncestorContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return false;
    if (el.closest('.cp-panel, .sel-card, .sel-bar, nav, .demo-panel')) return false;
    if (L.hardBlocked(node)) return false;

    var r = range.getBoundingClientRect();
    if (!r.width && !r.height) return false;

    current = { text: text, node: node, rect: r };
    return true;
  }

  function place() {
    var r = current.rect;
    bar.hidden = false;
    var top = r.bottom + window.scrollY + 8;
    var left = r.left + window.scrollX + (r.width / 2) - (bar.offsetWidth / 2);
    left = Math.max(8, Math.min(left, document.documentElement.clientWidth - bar.offsetWidth - 8));
    bar.style.top = Math.round(top) + 'px';
    bar.style.left = Math.round(left) + 'px';
  }

  function hideBar() { if (bar) bar.hidden = true; }

  /* --- Running one ---------------------------------------------------------- */

  var busy = false;

  function start(kind) {
    if (!current.text || busy) return;
    hideBar();

    if (!L.hasKey()) {
      openCard('<h3>The language service is not switched on</h3>' +
        '<p class="sel-note">Rewriting is the one part of the Copilot that may leave your device, so it stays off until you turn it on yourself. ' +
        'Open the Copilot panel, go to Controls, and paste a key under Language.</p>' +
        '<div class="sel-row"><button type="button" class="btn btn-primary btn-sm" data-act="close">Right you are</button></div>');
      return;
    }

    var reason = L.fenceReason(current.node);
    if (reason) {
      openCard('<h3>This one is fenced off</h3>' +
        '<p class="sel-note">' + reason + '</p>' +
        '<blockquote class="sel-quote">' + esc(current.text.slice(0, 260)) + '</blockquote>' +
        '<p class="sel-note">You can send it anyway. The original stays on the page either way, and the rewrite never replaces it.</p>' +
        '<div class="sel-row"><button type="button" class="btn btn-primary btn-sm" data-act="send" data-kind="' + kind + '">Send it anyway</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Leave it alone</button></div>');
      return;
    }

    if (!seenNotice()) {
      openCard('<h3>What is about to leave this device</h3>' +
        '<p class="sel-note">Only the passage you picked, and nothing else. Not the page, not its address, not what you were doing before, ' +
        'and never anything you have typed. It goes to the service you gave a key for, and the answer comes back beside the original.</p>' +
        '<blockquote class="sel-quote">' + esc(current.text.slice(0, 260)) + (current.text.length > 260 ? '…' : '') + '</blockquote>' +
        '<div class="sel-row"><button type="button" class="btn btn-primary btn-sm" data-act="send" data-kind="' + kind + '">Send just this</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Not now</button></div>' +
        '<p class="sel-note">Said once. After this it just runs when you ask.</p>');
      return;
    }

    run(kind);
  }

  function run(kind) {
    busy = true;
    var verb = kind === 'explain' ? 'Working out what it means' : 'Putting it in plain words';
    openCard('<h3>' + verb + '</h3><div class="sel-wait"><span></span><span></span><span></span></div>' +
      '<p class="sel-note">The page is still yours while this runs. Nothing on it has changed.</p>');
    say(verb + '.');

    var job = kind === 'explain' ? L.explain(current.text) : L.simplify(current.text);
    job.then(function (res) {
      busy = false;
      var spent = L.spent();
      openCard(
        '<h3>' + (kind === 'explain' ? 'What it means' : 'In plain words') + '</h3>' +
        '<div class="sel-out">' + esc(res.text).replace(/\n+/g, '</p><p>').replace(/^/, '<p>') + '</p></div>' +
        '<p class="sel-note">' + res.note + '</p>' +
        '<div class="sel-row">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="orig" aria-expanded="false">View the original</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="close">Done</button></div>' +
        '<blockquote class="sel-orig" hidden>' + esc(res.original) + '</blockquote>' +
        '<p class="sel-meta">' + L.getModel() + ' · ' + spent.calls + ' request' + (spent.calls === 1 ? '' : 's') +
        ' this browser · ' + money(spent.total) + ' so far</p>');
      say('Done. The original is one press away.');
    }).catch(function (err) {
      busy = false;
      openCard('<h3>That did not go through</h3>' +
        '<p class="sel-note">' + esc(err.message || 'The service did not answer.') + '</p>' +
        '<p class="sel-note">The page is exactly as it was. Nothing was changed and nothing was lost.</p>' +
        '<div class="sel-row"><button type="button" class="btn btn-primary btn-sm" data-act="retry" data-kind="' + kind + '">Try again</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="close">Leave it</button></div>');
      say('That did not go through. The page is unchanged.');
    });
  }

  function money(n) {
    if (!n) return 'nothing yet';
    if (n < 0.01) return 'under a penny';
    return '$' + n.toFixed(3);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function openCard(html) {
    card.innerHTML = '<button type="button" class="sel-x" data-act="close" aria-label="Close">✕</button>' + html;
    card.hidden = false;
    var r = current.rect;
    var top = (r ? r.bottom + window.scrollY : window.scrollY + 80) + 8;
    var w = Math.min(430, document.documentElement.clientWidth - 24);
    card.style.width = w + 'px';
    var left = r ? r.left + window.scrollX : 16;
    left = Math.max(12, Math.min(left, document.documentElement.clientWidth - w - 12));
    card.style.top = Math.round(top) + 'px';
    card.style.left = Math.round(left) + 'px';
    var first = card.querySelector('button:not(.sel-x)') || card.querySelector('.sel-x');
    if (first) first.focus();
  }

  function closeCard() {
    card.hidden = true;
    if (window.CopilotLanguage) busy = false;
  }

  var sayTimer = null;
  function say(msg) {
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { if (live) live.textContent = msg; }, 80);
  }

  /* --- Watching the selection ----------------------------------------------- */

  var t = null;
  function onChange() {
    clearTimeout(t);
    t = setTimeout(function () {
      if (!card.hidden) return;
      if (readSelection()) place(); else hideBar();
    }, 180);
  }

  function boot() {
    L = window.CopilotLanguage;
    if (!L) return;
    ensureParts();
    document.addEventListener('mouseup', onChange);
    document.addEventListener('keyup', function (e) {
      if (e.shiftKey || e.key === 'Shift' || /Arrow|Home|End/.test(e.key)) onChange();
    });
    document.addEventListener('selectionchange', onChange);
    window.addEventListener('scroll', function () {
      if (!bar.hidden && readSelection()) place();
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
