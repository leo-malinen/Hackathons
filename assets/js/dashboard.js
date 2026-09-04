/* ============================================================
   BRIDGE - Resilience Dashboard prototype
   Runs on a fictional demonstration account. No real data.
   Uses the same Resilience Profile function as the simulator,
   so the two never disagree about the same person.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var wk = $('wk');
  if (!wk) return;

  var A = {
    income: 3200, essentials: 2400, savingsBefore: 650,
    expense: 850, contribution: 100, support: 750,
    weeks: 12, weeklyRepay: 62.5, weeklySave: 10, goal: 2000
  };
  var weeklyEssentials = A.essentials * 12 / 52;

  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var money2 = function (n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

  var ring = $('d-ring');
  var ringFg = ring ? ring.querySelector('.fg') : null;
  var ringC = 0;
  if (ringFg) {
    ringC = 2 * Math.PI * parseFloat(ringFg.getAttribute('r'));
    ringFg.style.strokeDasharray = ringC.toFixed(1);
  }

  var radarSvg = document.querySelector('.radar');
  var dimsUl = $('rp-dims');

  function paint() {
    var w = parseInt(wk.value, 10);
    var repaid = Math.min(A.support, w * A.weeklyRepay);
    var owed = A.support - repaid;
    var saveWeeks = Math.max(0, w - 3);
    var fund = A.savingsBefore - A.contribution + saveWeeks * A.weeklySave;
    var cover = fund / weeklyEssentials;

    var prof = window.Bridge.profile({
      income: A.income, essentials: A.essentials, savings: fund, owed: owed,
      stabilityNote: 'steady hours, reviewed at intake'
    });

    $('wk-read').textContent = 'Week ' + w + ' of ' + A.weeks;
    $('d-score').textContent = prof.score;
    $('d-status').textContent = prof.status;
    $('d-bar').style.width = prof.score + '%';
    $('d-repaid').textContent = money2(repaid);
    $('d-recovery').textContent = w >= A.weeks ? 'Complete' : w === 0 ? 'Plan agreed' : 'On track';
    $('d-fund').textContent = money(fund);
    $('d-cover').textContent = cover.toFixed(1);

    if (ringFg) {
      ringFg.style.strokeDashoffset = (ringC * (1 - clamp(fund / A.goal, 0, 1))).toFixed(1);
    }
    if (radarSvg) window.Bridge.radar(radarSvg, prof.dims);
    if (dimsUl) window.Bridge.dimList(dimsUl, prof.dims);
  }

  function syncTrack() {
    var min = parseFloat(wk.min), max = parseFloat(wk.max);
    wk.style.setProperty('--pct', (((parseFloat(wk.value) - min) / (max - min)) * 100).toFixed(1) + '%');
  }

  wk.addEventListener('input', function () { syncTrack(); paint(); });
  syncTrack();
  paint();
})();
