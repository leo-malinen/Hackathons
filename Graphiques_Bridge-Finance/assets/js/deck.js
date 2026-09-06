/* ============================================================
   BRIDGE - the deck. Reads as one page, or one slide at a time.
   ============================================================ */
(function () {
  'use strict';

  var deck = document.getElementById('deck');
  if (!deck) return;

  var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
  var modeBtn = document.getElementById('deck-mode');
  var nav = document.getElementById('deck-nav');
  var prev = document.getElementById('deck-prev');
  var next = document.getElementById('deck-next');
  var count = document.getElementById('deck-count');

  var stepping = false;
  var idx = 0;

  function show() {
    slides.forEach(function (s, i) { s.hidden = stepping && i !== idx; });
    count.textContent = (idx + 1) + ' / ' + slides.length;
    prev.disabled = idx === 0;
    next.disabled = idx === slides.length - 1;
  }
  function go(n) {
    idx = Math.max(0, Math.min(slides.length - 1, n));
    show();
    if (stepping) deck.scrollIntoView({ block: 'start', behavior: window.Bridge && window.Bridge.reduced() ? 'auto' : 'smooth' });
  }

  modeBtn.addEventListener('click', function () {
    stepping = !stepping;
    nav.hidden = !stepping;
    modeBtn.textContent = stepping ? 'Show all twelve slides' : 'Switch to one slide at a time';
    modeBtn.setAttribute('aria-pressed', stepping ? 'true' : 'false');
    idx = 0;
    show();
  });
  prev.addEventListener('click', function () { go(idx - 1); });
  next.addEventListener('click', function () { go(idx + 1); });

  document.addEventListener('keydown', function (e) {
    if (!stepping) return;
    var overlay = document.getElementById('judge');
    if (overlay && overlay.classList.contains('on')) return;
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
  });

  show();
})();
