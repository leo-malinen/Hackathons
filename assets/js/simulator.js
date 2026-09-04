/* ============================================================
   BRIDGE - Financial Shock Simulator
   An illustrative model. Every assumption is printed on the page.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  if (!$('in-income')) return;

  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var money2 = function (n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

  var FIELDS = ['in-income', 'in-savings', 'in-essentials', 'in-expense'];

  var PRESETS = {
    maya: { 'in-income': 3200, 'in-savings': 650, 'in-essentials': 2400, 'in-expense': 850 },
    hourly: { 'in-income': 2100, 'in-savings': 180, 'in-essentials': 1750, 'in-expense': 600 },
    student: { 'in-income': 1600, 'in-savings': 90, 'in-essentials': 1300, 'in-expense': 450 },
    family: { 'in-income': 5400, 'in-savings': 1900, 'in-essentials': 4500, 'in-expense': 2200 }
  };

  /* ============================================================
     The model
     ============================================================ */
  function model(income, savings, essentials, expense) {
    var surplus = income - essentials;
    var weeklySurplus = surplus * 12 / 52;

    /* --- the shock --- */
    var covered = Math.min(savings, expense);
    var gap = Math.max(0, expense - savings);
    var coveredPct = expense > 0 ? (covered / expense) * 100 : 100;

    /* --- without structured support --- */
    var APR = 0.24;
    var repayCapacity = Math.max(25, surplus * 0.35);
    var debt = gap, months = 0, interest = 0;
    if (debt > 0) {
      var mi = APR / 12;
      while (debt > 0.5 && months < 240) {
        var i = debt * mi;
        interest += i;
        debt = debt + i - repayCapacity;
        months++;
        if (debt > 0.5 && repayCapacity <= debt * mi) { months = 240; break; }
      }
      if (debt > 0.5) months = 240;
    }
    var neverClears = months >= 240;
    var bufferLeft = Math.max(0, savings - covered);
    var rebuildRate = Math.max(10, surplus * 0.25);
    var rebuildMonths = (surplus > 0)
      ? (neverClears ? 240 : months + Math.ceil((savings - bufferLeft) / rebuildRate))
      : 240;

    /* --- with Bridge --- */
    var contribution = Math.min(expense, Math.round(savings * 0.15 / 5) * 5);
    var support = expense - contribution;
    var weeklyCap = Math.max(5, weeklySurplus * 0.35);
    var weeks = clamp(Math.ceil(support / weeklyCap), 4, 26);
    var weeklyRepay = support / weeks;
    var needsReview = weeklyRepay > weeklyCap + 0.01 || surplus <= 0;
    var weeklySave = surplus > 0 ? clamp(Math.round(weeklySurplus * 0.055), 5, 50) : 0;
    var saveWeeks = Math.max(0, weeks - 3);
    var bufferKept = savings - contribution;
    var bufferEnd = bufferKept + weeklySave * saveWeeks;

    /* --- pressure, 0 to 100, higher is worse ---
       The buffer term is what actually separates the two paths, so each
       side is scored against the buffer it is left holding. */
    var pGap = expense > 0 ? clamp(gap / expense, 0, 1) : 0;
    var pClaim = clamp(expense / Math.max(1, surplus), 0, 1);
    var bufferTarget = Math.max(1, essentials * 0.75);
    var pBufOut = 1 - clamp(bufferLeft / bufferTarget, 0, 1);
    var pBufIn = 1 - clamp(bufferKept / bufferTarget, 0, 1);

    var pDrag = clamp(months / 12, 0, 1);
    var pressureOut = clamp(Math.round(pGap * 30 + pClaim * 25 + pBufOut * 30 + pDrag * 15), 0, 100);
    var pressureIn = clamp(Math.round(
      (weeklyRepay / Math.max(1, weeklyCap)) * 30 + pBufIn * 26 + (needsReview ? 30 : 0)
    ), 0, 100);

    /* --- the eighteen month trajectory --- */
    var series = { out: [], in: [] };
    (function () {
      var d = gap, s = bufferLeft;
      for (var m = 0; m <= 18; m++) {
        series.out.push(s - d);
        if (d > 0) {
          var iv = d * (APR / 12);
          var pay = Math.min(repayCapacity, d + iv);
          d = Math.max(0, d + iv - pay);
          var spare = repayCapacity - pay;
          if (spare > 0) s += spare * 0.7;
        } else if (surplus > 0) {
          s += rebuildRate;
        }
      }
    })();
    (function () {
      var owed = support, s = bufferKept;
      var monthlyRepay = weeklyRepay * 52 / 12;
      var monthlySave = weeklySave * 52 / 12;
      for (var m = 0; m <= 18; m++) {
        series.in.push(s - owed);
        if (owed > 0) {
          owed = Math.max(0, owed - monthlyRepay);
          if (m >= 1) s += monthlySave;
        } else {
          s += monthlySave + (surplus > 0 ? rebuildRate : 0);
        }
      }
    })();

    /* --- the conceptual resilience profile, before any support --- */
    var prof = window.Bridge.profile({
      income: income, essentials: essentials, savings: savings,
      owed: expense, stabilityNote: 'assumed steady in this model'
    });

    return {
      surplus: surplus, covered: covered, gap: gap, coveredPct: coveredPct,
      months: months, neverClears: neverClears, interest: interest,
      bufferLeft: bufferLeft, rebuildMonths: rebuildMonths,
      contribution: contribution, support: support, weeks: weeks,
      weeklyRepay: weeklyRepay, weeklySave: weeklySave, bufferEnd: bufferEnd,
      needsReview: needsReview, pressureOut: pressureOut, pressureIn: pressureIn,
      series: series, prof: prof
    };
  }

  /* ============================================================
     Painting
     ============================================================ */
  function pressureWord(p) {
    return p >= 80 ? 'Severe' : p >= 60 ? 'High' : p >= 35 ? 'Moderate' : 'Low';
  }
  function pressureColour(p) {
    return p >= 60 ? 'var(--warn)' : p >= 35 ? 'var(--accent)' : 'var(--ok)';
  }
  function monthWord(n) {
    if (n >= 240) return 'Over 20 years';
    return n + (n === 1 ? ' month' : ' months');
  }

  function drawChart(series) {
    var out = series.out, inn = series.in;
    var all = out.concat(inn);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (hi - lo < 100) hi = lo + 100;
    var pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;

    var X0 = 46, X1 = 606, Y0 = 20, Y1 = 214;
    function px(i) { return X0 + (i / 18) * (X1 - X0); }
    function py(v) { return Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0); }
    function d(arr) {
      return arr.map(function (v, i) {
        return (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1);
      }).join(' ');
    }
    $('sc-path-out').setAttribute('d', d(out));
    $('sc-path-in').setAttribute('d', d(inn));
    var zeroY = clamp(py(0), Y0, Y1);
    $('sc-zeroline').setAttribute('y1', zeroY.toFixed(1));
    $('sc-zeroline').setAttribute('y2', zeroY.toFixed(1));
    $('sc-ymax').textContent = money(hi);
    $('sc-ymin').textContent = money(lo);
  }

  function paint() {
    var income = read('in-income'), savings = read('in-savings');
    var essentials = read('in-essentials'), expense = read('in-expense');
    var m = model(income, savings, essentials, expense);

    $('o-expense').textContent = money(expense);
    $('o-savings').textContent = money(savings);
    $('o-gap').textContent = money(m.gap);

    var cov = Math.round(m.coveredPct);
    $('bar-cov').style.width = cov + '%';
    $('bar-unc').style.width = (100 - cov) + '%';
    $('lg-cov').textContent = 'Covered by savings ' + cov + '%';
    $('lg-unc').textContent = 'Uncovered gap ' + (100 - cov) + '%';

    $('w-spent').textContent = money(m.covered);
    $('w-gap').textContent = money(m.gap);
    $('w-months').textContent = m.gap > 0 ? monthWord(m.months) : 'No gap to clear';
    $('w-interest').textContent = m.gap <= 0 ? 'None'
      : m.neverClears ? 'Not repayable at this rate' : money(m.interest);
    $('w-buffer').textContent = money(m.bufferLeft);
    $('w-rebuild').textContent = m.surplus > 0 ? monthWord(m.rebuildMonths) : 'No surplus to rebuild from';

    $('b-contrib').textContent = money(m.contribution);
    $('b-support').textContent = money(m.support);
    $('b-weeks').textContent = m.weeks + ' weeks';
    $('b-weekly').textContent = money2(m.weeklyRepay);
    $('b-save').textContent = m.weeklySave > 0 ? money2(m.weeklySave) : 'Not affordable yet';
    $('b-buffer').textContent = money(m.bufferEnd);

    $('p-label').textContent = 'Pressure: ' + pressureWord(m.pressureOut);
    $('p-meter').style.width = m.pressureOut + '%';
    $('p-meter').style.background = pressureColour(m.pressureOut);
    $('bp-label').textContent = 'Pressure: ' + pressureWord(m.pressureIn);
    $('bp-meter').style.width = m.pressureIn + '%';
    $('bp-meter').style.background = pressureColour(m.pressureIn);

    drawChart(m.series);

    var svg = document.querySelector('.radar');
    if (svg) window.Bridge.radar(svg, m.prof.dims);
    window.Bridge.dimList($('rp-dims'), m.prof.dims);
    $('rp-score').textContent = m.prof.score;
    $('rp-status').textContent = m.prof.status;
    $('rp-bar').style.width = m.prof.score + '%';

    var msgs = [];
    if (m.surplus <= 0) {
      msgs.push('Essential expenses meet or exceed income in this scenario. Bridge would route this to human support and hardship pathways rather than to a repayment plan.');
    } else if (m.needsReview) {
      msgs.push('The support needed does not fit inside a 26 week plan at an affordable weekly amount. Bridge would treat this as a case for review, partial support or referral, not for a larger amount.');
    }
    if (m.gap <= 0 && expense <= savings * 0.4) {
      msgs.push('Savings comfortably cover this expense. The honest answer here is that no support is needed.');
    }
    $('sim-warn').innerHTML = msgs.length
      ? '<span class="tag tag-ill">Model note</span> ' + msgs.join(' ') : '';
  }

  /* ============================================================
     Inputs
     ============================================================ */
  function read(id) {
    var el = $(id);
    var v = parseFloat(el.value);
    if (isNaN(v)) v = parseFloat(el.getAttribute('min'));
    return clamp(v, parseFloat(el.getAttribute('min')), parseFloat(el.getAttribute('max')));
  }
  function syncRange(numId) {
    var num = $(numId);
    var range = document.querySelector('.fin-range[data-for="' + numId + '"]');
    if (!range) return;
    range.value = num.value;
    var min = parseFloat(range.min), max = parseFloat(range.max);
    range.style.setProperty('--pct', (((parseFloat(range.value) - min) / (max - min)) * 100).toFixed(1) + '%');
  }

  var presetBtns = Array.prototype.slice.call(document.querySelectorAll('.preset'));
  function clearPresets() { presetBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); }

  FIELDS.forEach(function (id) {
    var num = $(id);
    var range = document.querySelector('.fin-range[data-for="' + id + '"]');
    num.addEventListener('input', function () { syncRange(id); paint(); clearPresets(); });
    num.addEventListener('blur', function () { num.value = read(id); syncRange(id); paint(); });
    if (range) {
      range.addEventListener('input', function () {
        num.value = range.value; syncRange(id); paint(); clearPresets();
      });
    }
    syncRange(id);
  });

  presetBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var p = PRESETS[b.getAttribute('data-preset')];
      if (!p) return;
      Object.keys(p).forEach(function (id) { $(id).value = p[id]; syncRange(id); });
      clearPresets();
      b.setAttribute('aria-pressed', 'true');
      paint();
    });
  });

  paint();
})();
