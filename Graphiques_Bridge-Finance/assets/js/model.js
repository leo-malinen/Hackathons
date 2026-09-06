/* ============================================================
   BRIDGE - illustrative institutional program model
   Every figure here is an assumption, labelled as such on page.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  if (!$('m-part')) return;

  var FIELDS = ['m-part', 'm-util', 'm-avg', 'm-pool', 'm-rate', 'm-plat', 'm-admin', 'm-price'];
  var money = function (n) {
    var r = Math.round(n);
    return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('en-US');
  };
  var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

  function read(id) {
    var el = $(id);
    var v = parseFloat(el.value);
    if (isNaN(v)) v = parseFloat(el.min);
    return clamp(v, parseFloat(el.min), parseFloat(el.max));
  }
  function syncRange(id) {
    var num = $(id);
    var range = document.querySelector('.fin-range[data-for="' + id + '"]');
    if (!range) return;
    range.value = num.value;
    var min = parseFloat(range.min), max = parseFloat(range.max);
    range.style.setProperty('--pct', (((parseFloat(range.value) - min) / (max - min)) * 100).toFixed(1) + '%');
  }

  function paint() {
    var participants = read('m-part');
    var util = read('m-util') / 100;
    var avg = read('m-avg');
    var pool = read('m-pool');
    var rate = read('m-rate') / 100;
    var platCost = read('m-plat');
    var adminCost = read('m-admin');
    var price = read('m-price');

    var cases = Math.round(participants * util);
    var need = cases * avg;
    var coverage = need > 0 ? (pool / need) * 100 : 0;
    var recovered = need * rate;
    var lost = need - recovered;
    var again = avg > 0 ? Math.floor(recovered / avg) : 0;

    var revenue = participants * price;
    var costPlat = participants * platCost;
    var costAdmin = cases * adminCost;
    var margin = revenue - costPlat - costAdmin;
    var perCase = cases > 0 ? (costPlat + costAdmin) / cases : 0;

    $('r-cases').textContent = cases.toLocaleString('en-US');
    $('r-need').textContent = money(need);
    $('r-cover').textContent = Math.round(coverage) + '%';
    $('r-coverbar').style.width = clamp(need > 0 ? (need / pool) * 100 : 0, 0, 100).toFixed(1) + '%';
    $('r-poollbl').textContent = money(pool) + ' pool';

    var note = $('r-covernote');
    if (coverage >= 100) {
      note.innerHTML = 'The pool covers modelled first-round demand with ' + money(pool - need) +
        ' in reserve. Reserve matters, because utilisation is an assumption and not a promise.';
    } else {
      note.innerHTML = '<strong>The pool does not cover modelled demand.</strong> Bridge would respond with ' +
        'program limits, transparent eligibility and additional sponsors, never by quietly reducing support ' +
        'quality. Roughly ' + Math.round(100 - coverage) + ' percent of modelled demand is unfunded.';
    }

    $('r-recovered').textContent = money(recovered);
    $('r-loss').textContent = money(lost);
    $('r-again').textContent = again.toLocaleString('en-US');

    $('r-rev').textContent = money(revenue);
    $('r-cplat').textContent = money(costPlat);
    $('r-cadmin').textContent = money(costAdmin);
    $('r-margin').textContent = money(margin);
    $('r-percase').textContent = money(perCase);

    var ratio = revenue > 0 ? margin / revenue : -1;
    var verdict = $('r-verdict'), bar = $('r-verdictbar');
    if (margin <= 0) {
      verdict.textContent = 'Program contribution: negative';
      bar.style.width = '18%';
      bar.style.background = 'var(--warn)';
    } else if (ratio < 0.2) {
      verdict.textContent = 'Program contribution: thin';
      bar.style.width = '45%';
      bar.style.background = 'var(--accent)';
    } else {
      verdict.textContent = 'Program contribution: positive';
      bar.style.width = clamp(30 + ratio * 90, 30, 100).toFixed(0) + '%';
      bar.style.background = 'var(--ok)';
    }
  }

  FIELDS.forEach(function (id) {
    var num = $(id);
    var range = document.querySelector('.fin-range[data-for="' + id + '"]');
    num.addEventListener('input', function () { syncRange(id); paint(); });
    num.addEventListener('blur', function () { num.value = read(id); syncRange(id); paint(); });
    if (range) range.addEventListener('input', function () { num.value = range.value; syncRange(id); paint(); });
    syncRange(id);
  });

  paint();
})();
