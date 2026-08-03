/* ============================================================
   LOCAL RADAR \u2014 application logic
   State is a single plain object. Every panel reads from it and
   every AI panel routes through AI.text() / AI.json().
   ============================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  view: 'pulse',
  city: CITY_KEYS[0],
  business: BUSINESSES[0].id,
  mode: 'Professional',
  askMode: 'Professional',
  snapshot: 'July',
  category: 'Coffee shop',
  district: null,
  insights: [...SEED_INSIGHTS],
  alerts: [...SEED_ALERTS],
  busy: {}
};

/* ---------- typewriter renderer ---------- */
function typeInto(el, text, source) {
  el.hidden = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const badge = source === 'openai'
    ? `<span>${AI.cfg.model}</span>`
    : source === 'error' ? '<span>model error \u2014 mock fallback</span>' : '<span>mock engine</span>';

  if (reduce || !AI.cfg.stream) {
    el.innerHTML = escapeHTML(text) + `<div class="ai-src">${badge}</div>`;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let i = 0;
    el.innerHTML = '<span class="cursor"></span>';
    const step = Math.max(1, Math.round(text.length / 260));
    const timer = setInterval(() => {
      i = Math.min(text.length, i + step);
      el.innerHTML = escapeHTML(text.slice(0, i)) +
        (i < text.length ? '<span class="cursor"></span>' : `<div class="ai-src">${badge}</div>`);
      if (i >= text.length) { clearInterval(timer); resolve(); }
    }, 14);
  });
}

/* Provenance badge shown under every AI answer. */
function srcBadge(source) {
  const label = source === 'openai' ? AI.cfg.model
    : source === 'error' ? 'model error \u2014 mock fallback'
    : 'mock engine';
  return '<div class="ai-src"><span>' + escapeHTML(label) + '</span></div>';
}

/* Streams a completion straight into an element, token by token.
   With a live OpenAI key this is real SSE output; without one it falls
   back to the deterministic mock plus the old typewriter. */
async function aiInto(el, system, user, opts = {}) {
  el.hidden = false;
  const res = await AI.text(system, user, {
    ...opts,
    onToken: (_delta, full) => {
      el.innerHTML = escapeHTML(full) + '<span class="cursor"></span>';
    }
  });
  if (res.source === 'openai') el.innerHTML = escapeHTML(res.text) + srcBadge(res.source);
  else await typeInto(el, res.text, res.source);
  return res;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
}

function loading(el, label = 'Reasoning') {
  el.hidden = false;
  el.innerHTML = `${label}<span class="cursor"></span>`;
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function go(view) {
  state.view = view;
  $$('.rail-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  $('#main').scrollTop = 0;
  if (view === 'heatmap') renderHeatmap();
}

$$('.rail-item').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

/* ============================================================
   API KEY MODAL
   ============================================================ */
function refreshEngineUI() {
  const on = AI.live();
  $('#enginePip').classList.toggle('live', on);
  $('#engineName').textContent = on ? 'OpenRouter live' : 'Mock engine';
  $('#engineSub').textContent = on ? AI.cfg.model : 'no key \u00b7 deterministic';
}

/* ============================================================
   THEME (MaterialM light / dark)
   ============================================================ */
const THEME_KEY = 'localradar.theme';

function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
  const btn = $('#themeBtn');
  if (btn) {
    btn.innerHTML = icon(mode === 'dark' ? 'sun' : 'moon', 18);
    btn.title = mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
  if (typeof syncChartTheme === 'function') syncChartTheme();
  redrawCanvases();
}

/* Canvases are painted with baked-in colours, so every visible one is redrawn
   whenever the theme flips. */
function redrawCanvases() {
  try {
    renderPulse();
    if (state.business) renderBizDetail();
    if (state.view === 'heatmap') renderHeatmap();
  } catch (e) {}
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  const mode = saved || 'light';
  document.documentElement.setAttribute('data-theme', mode);
  if (typeof syncChartTheme === 'function') syncChartTheme();
  const btn = $('#themeBtn');
  if (btn) {
    btn.innerHTML = icon(mode === 'dark' ? 'sun' : 'moon', 18);
    btn.title = mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
}

$('#engineBtn').addEventListener('click', () => {
  $('#modelInput').value = AI.cfg.model;
  $('#thinkInput').value = AI.cfg.effort;
  $('#streamToggle').checked = AI.cfg.stream;
  $('#keyStatus').hidden = true;
  $('#keyModal').hidden = false;
});
const closeModal = () => { $('#keyModal').hidden = true; };
$('#keyClose').addEventListener('click', closeModal);
$('#keyModal').addEventListener('click', e => { if (e.target.id === 'keyModal') closeModal(); });

$('#keyClose2').addEventListener('click', () => {
  AI.save({
    model: $('#modelInput').value,
    effort: $('#thinkInput').value,
    stream: $('#streamToggle').checked
  });
  refreshEngineUI();
  closeModal();
});

$('#keySave').addEventListener('click', async () => {
  const st = $('#keyStatus');
  AI.save({
    model: $('#modelInput').value,
    effort: $('#thinkInput').value,
    stream: $('#streamToggle').checked
  });
  refreshEngineUI();
  if (!AI.live()) { st.hidden = false; st.className = 'key-status err'; st.textContent = 'No key entered \u2014 running on the mock engine.'; return; }
  st.hidden = false; st.className = 'key-status wait'; st.textContent = 'Testing ' + AI.cfg.model + '\u2026';
  try {
    const ms = await AI.test();
    st.className = 'key-status ok';
    st.textContent = `Connected. ${AI.cfg.model} responded in ${ms} ms. Every panel is now live.`;
    setTimeout(closeModal, 1400);
  } catch (err) {
    st.className = 'key-status err';
    st.textContent = 'Failed: ' + err.message;
  }
});

/* ============================================================
   CITY PULSE
   ============================================================ */
function renderTicker() {
  const row = TICKER.map(t =>
    `<span class="ticker-item"><b>${t.n}</b><span class="tv ${t.d}">${t.v}</span></span>`).join('');
  $('#tickerTrack').innerHTML = row + row;
}

function renderPulse() {
  const city = CITIES[state.city];
  $('#pulseCity').textContent = city.name;
  animateGauge($('#pulseGauge'), 220, city.pulse, {
    color: scoreColor(city.pulse),
    onTick: v => { $('#pulseScore').textContent = v; }
  });

  $('#pulseStats').innerHTML = PULSE_STATS.map(s => {
    const col = { green: C.green, red: C.red, orange: C.orange, blue: C.blue }[s.color];
    const arrow = s.dir === 'up' ? '\u2191' : '\u2193';
    return `<li>
      <span style="color:${col};width:12px">${arrow}</span>
      <span style="min-width:132px">${s.label}</span>
      <span class="bar"><i style="width:${s.value}%;background:${col}"></i></span>
      <span class="val" style="color:${col}">${s.value}</span>
    </li>`;
  }).join('');

  renderModePills('#pulseModes', 'mode');
  renderInsights();
  renderMovers();
  renderMiniLists();
}

function renderModePills(sel, key) {
  const host = $(sel);
  host.innerHTML = EXPLAIN_MODES.map(m =>
    `<button class="mode-pill ${state[key] === m ? 'active' : ''}" data-mode="${m}">${m}</button>`).join('');
  $$('.mode-pill', host).forEach(b => b.addEventListener('click', () => {
    state[key] = b.dataset.mode;
    renderModePills(sel, key);
  }));
}

function renderInsights() {
  $('#insightList').innerHTML = state.insights.map(i => `<li>${escapeHTML(i)}</li>`).join('');
}

function renderMovers() {
  $('#movers').innerHTML = BUSINESSES.map(b => {
    const d = b.timeline.July.health - b.timeline.January.health;
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    return `<div class="mover"><span>${b.emoji}</span><span class="nm">${b.name}</span>
      <span class="dt ${cls}">${d > 0 ? '+' : ''}${d}</span></div>`;
  }).join('');
}

function miniBtn(b) {
  const s = b.healthHint;
  const cls = s >= 75 ? 'sc-g' : s >= 50 ? 'sc-o' : 'sc-r';
  return `<button data-biz="${b.id}"><span>${b.emoji}</span><span>${b.name}</span>
    <span class="sc ${cls}">${s}</span></button>`;
}
function renderMiniLists() {
  const wire = (sel, arr) => {
    $(sel).innerHTML = arr.map(miniBtn).join('');
    $$('button', $(sel)).forEach(x => x.addEventListener('click', () => openBusiness(x.dataset.biz)));
  };
  wire('#listRising', BUSINESSES.filter(b => b.trend === 'rising'));
  wire('#listHiring', BUSINESSES.filter(b => /\+/.test(b.signals.hiringChange90d)));
  wire('#listRisk',   BUSINESSES.filter(b => b.closeRisk >= 30));
}

$('#pulseExplain').addEventListener('click', async () => {
  const out = $('#pulseOut');
  loading(out, 'City Pulse agent reasoning');
  const city = CITIES[state.city];
  const ctx = JSON.stringify({ city: city.name, pulse: city.pulse, indicators: PULSE_STATS, ticker: TICKER });
  const mock =
`${city.name} holds a pulse of ${city.pulse}, driven by an expanding employment base rather than consumer strength.
Hiring is up and construction permits are rising, but consumer sentiment at 52 is the weakest indicator on the board.
Competition at 88 means new entrants are absorbing the growth faster than demand is being created.
Commercial rent at 66 and climbing is the constraint that decides who survives the next two quarters.
Recommendation: favour employment-adjacent categories in North San Jose and Berryessa, and treat Downtown discretionary retail as defensive.`;
  const { text, source } = await AI.text(
    AGENTS.summary.prompt + modeSuffix(state.mode),
    `Explain today's City Pulse for a terminal user.\n\nCONTEXT:\n${ctx}`,
    { mock, maxTokens: 500 });
  typeInto(out, text, source);
});

$('#insightBtn').addEventListener('click', async () => {
  const btn = $('#insightBtn');
  btn.disabled = true; btn.textContent = 'Discovering\u2026';
  const ctx = JSON.stringify({ businesses: BUSINESSES.map(slim), districts: DISTRICTS });
  const pool = EXTRA_INSIGHTS.filter(i => !state.insights.includes(i));
  const mock = pool[0] || EXTRA_INSIGHTS[Math.floor(Math.random() * EXTRA_INSIGHTS.length)];
  const { data } = await AI.json(
    BASE_ROLE + ' You are the HIDDEN INSIGHTS AGENT. Find one non-obvious, specific, surprising ' +
    'correlation or pattern in the data that a dashboard would never show. One sentence. Include a number.',
    `Return {"insight":"..."}\n\nCONTEXT:\n${ctx}\n\nAlready found (do not repeat):\n${state.insights.join('\n')}`,
    { insight: mock }, { temp: 0.95 });
  state.insights.unshift(data.insight || mock);
  state.insights = state.insights.slice(0, 5);
  renderInsights();
  btn.disabled = false; btn.textContent = 'Discover new insight';
});

function slim(b) {
  return { name: b.name, category: b.category, hood: b.hood, rating: b.rating,
           employees: b.employees, trend: b.trend, signals: b.signals };
}

/* ============================================================
   BUSINESS DESK
   ============================================================ */
function renderBizList(filter = '') {
  const f = filter.toLowerCase();
  const rows = BUSINESSES.filter(b =>
    !f || b.name.toLowerCase().includes(f) || b.category.toLowerCase().includes(f) || b.hood.toLowerCase().includes(f));
  $('#bizCount').textContent = rows.length;
  $('#bizList').innerHTML = rows.map(b => `
    <button class="biz-row ${b.id === state.business ? 'active' : ''}" data-biz="${b.id}">
      <span class="av">${b.emoji}</span>
      <span class="mt"><b>${b.name}</b><small>${b.category} \u00b7 ${b.hood}</small></span>
    </button>`).join('');
  $$('.biz-row').forEach(r => r.addEventListener('click', () => openBusiness(r.dataset.biz)));
}
$('#bizFilter').addEventListener('input', e => renderBizList(e.target.value));

function openBusiness(id) {
  state.business = id;
  state.snapshot = 'July';
  go('business');
  renderBizList($('#bizFilter').value);
  renderBizDetail();
}

function stars(r) {
  const full = Math.round(r);
  return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
}

function renderBizDetail() {
  const b = byId(state.business);
  const host = $('#bizDetail');
  host.innerHTML = `
    <div class="card">
      <div class="biz-hero">
        <img class="biz-photo" src="${b.photo}" alt="${b.name}"
             onerror="this.style.display='none'" />
        <div class="biz-meta">
          <h2>${b.name}</h2>
          <div class="stars">${stars(b.rating)} <span class="muted small" style="letter-spacing:0">${b.rating} \u00b7 ${b.reviews.toLocaleString()} reviews</span></div>
          <div class="tags">
            <span class="tag">${b.category}</span><span class="tag">${b.hood}</span>
            <span class="tag">${b.employees} employees</span><span class="tag">${b.priceTier}</span>
            <span class="tag">rent ${b.signals.rentPerSqFt}/sqft</span>
          </div>
        </div>
        <div class="score-ring">
          <canvas id="healthGauge"></canvas>
          <div class="v"><b id="healthVal">\u2014</b><small>Health</small></div>
        </div>
      </div>
      <div class="card-foot">
        <button class="btn btn-primary" id="genHealth">Generate health score</button>
        <div class="mode-pills" id="bizModes"></div>
      </div>
      <div id="healthReasons"></div>
      <div class="ai-out" id="healthOut" hidden></div>
    </div>

    <div class="biz-grid">
      <div class="card">
        <div class="card-head"><h3>Business DNA</h3><span class="chip">AI identity</span></div>
        <div class="dna-wrap">
          <canvas id="dnaRadar"></canvas>
          <div class="dna-legend">${Object.entries(b.dna).map(([k, v]) =>
            `<div><i class="sw" style="background:${scoreColor(v)}"></i>${k}<b>${v}</b></div>`).join('')}</div>
        </div>
        <button class="btn btn-soft w-full" id="dnaExplain" style="margin-top:12px">Interpret this DNA</button>
        <div class="ai-out" id="dnaOut" hidden></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Predict the Future</h3><span class="chip">12-month horizon</span></div>
        <div class="predict">
          <div>
            <div class="muted small">Chance business closes</div>
            <div class="big" style="color:${b.closeRisk >= 60 ? C.red : b.closeRisk >= 30 ? C.orange : C.green}">${b.closeRisk}%</div>
          </div>
          <div>
            <div class="muted small">Confidence</div>
            <div class="conf">${[1,2,3].map(i =>
              `<i class="${i <= (b.closeRisk >= 60 ? 2 : b.closeRisk >= 30 ? 2 : 3) ? 'on' : ''}"></i>`).join('')}
              <span class="small muted" style="margin-left:6px">${b.closeRisk >= 30 ? 'Medium' : 'High'}</span></div>
          </div>
        </div>
        <div class="muted small" style="margin-top:14px">Evidence</div>
        <ul class="evidence">${evidenceFor(b).map(e => `<li>${e}</li>`).join('')}</ul>
        <button class="btn btn-soft w-full" id="predExplain" style="margin-top:14px">Forecast with logprobs</button>
        <div class="ai-out" id="predOut" hidden></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Memory Timeline</h3><span class="chip">snapshots</span></div>
      <div class="timeline"><div class="tl-line"></div>
        ${Object.keys(b.timeline).map(m =>
          `<div class="tl-node ${m === state.snapshot ? 'active' : ''}" data-snap="${m}">${m}</div>`).join('')}
      </div>
      <div class="muted small" style="margin-bottom:8px">Change since January \u2192 <b style="color:#fff">${state.snapshot}</b></div>
      <div class="delta-grid" id="deltaGrid"></div>
      <button class="btn btn-soft w-full" id="memExplain" style="margin-top:14px">Compare snapshots</button>
      <div class="ai-out" id="memOut" hidden></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>AI Competitor Simulator</h3><span class="chip">${b.competitors.length} rivals nearby</span></div>
      <div class="comp-cols">
        <div><h4>Nearby competitor strengths</h4>
          <ul>${b.competitors.flatMap(c => c.strengths.map(s =>
            `<li><b>${c.name}</b> \u2014 ${s}</li>`)).join('')}</ul></div>
        <div><h4>Recommendations</h4>
          <ul id="compRecs"><li class="muted">Run the simulator to generate counter-moves.</li></ul></div>
      </div>
      <button class="btn btn-primary" id="compRun" style="margin-top:14px">Simulate competition</button>
      <div class="ai-out" id="compOut" hidden></div>
    </div>`;

  animateGauge($('#healthGauge'), 112, b.healthHint, {
    lw: 9, ticks: false, onTick: v => { $('#healthVal').textContent = v; }
  });
  animateRadar($('#dnaRadar'), 230, b.dna);
  renderModePills('#bizModes', 'mode');
  renderDeltas();

  $$('.tl-node').forEach(n => n.addEventListener('click', () => {
    state.snapshot = n.dataset.snap;
    $$('.tl-node').forEach(x => x.classList.toggle('active', x === n));
    renderDeltas();
  }));

  $('#genHealth').addEventListener('click', genHealth);
  $('#dnaExplain').addEventListener('click', explainDNA);
  $('#predExplain').addEventListener('click', forecast);
  $('#memExplain').addEventListener('click', compareSnapshots);
  $('#compRun').addEventListener('click', simulateCompetition);
}

function evidenceFor(b) {
  const e = [];
  if (/-/.test(b.signals.reviewVelocity)) e.push('Review velocity ' + b.signals.reviewVelocity);
  else e.push('Review velocity ' + b.signals.reviewVelocity + ' (supportive)');
  e.push('Hiring ' + b.signals.hiringChange90d);
  e.push('Foot traffic ' + b.signals.footTraffic);
  e.push(b.signals.nearbyOpenings90d + ' competitor opening(s) within 90 days');
  if (b.signals.complaints.parking > 15) e.push('Parking complaints elevated (' + b.signals.complaints.parking + ')');
  return e;
}

function renderDeltas() {
  const b = byId(state.business);
  const t = b.timeline[state.snapshot];
  const rows = [
    ['Hiring', t.hiring, '%'], ['Reviews', t.reviews, '%'],
    ['Parking complaints', t.complaints, '%'], ['Competition', t.competition, ''],
    ['Health score', t.health - b.timeline.January.health, ' pts']
  ];
  $('#deltaGrid').innerHTML = rows.map(([k, v, u]) => {
    const good = (k === 'Parking complaints' || k === 'Competition') ? v <= 0 : v >= 0;
    const col = v === 0 ? 'var(--text-3)' : good ? C.green : C.red;
    return `<div class="delta"><span class="lbl">${k}</span><b class="num" style="color:${col}">${v > 0 ? '+' : ''}${v}${u}</b></div>`;
  }).join('');
}

/* ---- Health Score ---- */
async function genHealth() {
  const b = byId(state.business);
  const out = $('#healthOut');
  const btn = $('#genHealth');
  btn.disabled = true; btn.textContent = 'Generating\u2026';
  loading(out, 'Health agent scoring');

  const mock = {
    score: b.healthHint,
    positives: mockPos(b),
    negatives: mockNeg(b),
    summary: `${b.name} scores ${b.healthHint}. ${b.trend === 'rising'
      ? 'Momentum is real and supported by hiring, reviews and traffic moving together.'
      : b.trend === 'falling'
      ? 'The decline is broad-based: demand, staffing and sentiment are all deteriorating at once.'
      : 'Performance is stable but flat, and competitive pressure is doing the work of a decline.'}`
  };

  const { data, source } = await AI.json(
    BASE_ROLE + ' You are the BUSINESS HEALTH AGENT. Score the business 0-100 and justify it with ' +
    'signal-grounded reasons.' + modeSuffix(state.mode),
    `Return {"score":<int 0-100>,"positives":["+ short reason",...3-4],"negatives":["- short reason",...2-3],"summary":"2-3 short lines"}\n\n` +
    `BUSINESS:\n${JSON.stringify({ ...slim(b), competitors: b.competitors, timeline: b.timeline })}`,
    mock, { maxTokens: 700 });

  const score = Math.max(0, Math.min(100, Number(data.score) || b.healthHint));
  animateGauge($('#healthGauge'), 112, score, { lw: 9, ticks: false, onTick: v => { $('#healthVal').textContent = v; } });

  $('#healthReasons').innerHTML = `<div class="reasons">
    ${(data.positives || []).map(p => `<div class="reason pos"><span class="s">+</span><span>${escapeHTML(String(p).replace(/^[+\-]\s*/, ''))}</span></div>`).join('')}
    ${(data.negatives || []).map(p => `<div class="reason neg"><span class="s">\u2212</span><span>${escapeHTML(String(p).replace(/^[+\-]\s*/, ''))}</span></div>`).join('')}
  </div>`;

  await typeInto(out, data.summary || mock.summary, source);
  btn.disabled = false; btn.textContent = 'Regenerate health score';
}

function mockPos(b) {
  const p = [];
  if (/\+/.test(b.signals.hiringChange90d)) p.push('Hiring increased ' + b.signals.hiringChange90d + ' over 90 days');
  if (/\+/.test(b.signals.reviewVelocity)) p.push('Reviews improving, velocity ' + b.signals.reviewVelocity);
  if (/\+/.test(b.signals.footTraffic)) p.push('Foot traffic rising ' + b.signals.footTraffic);
  if (b.dna['Community Trust'] > 75) p.push('Community trust at ' + b.dna['Community Trust'] + ' is a durable moat');
  if (!p.length) p.push('Stable revenue base and an established local customer set');
  return p.slice(0, 4);
}
function mockNeg(b) {
  const n = [];
  if (b.signals.complaints.parking > 8) n.push('Parking complaints increased to ' + b.signals.complaints.parking);
  if (b.signals.nearbyOpenings90d > 0) n.push(b.signals.nearbyOpenings90d + ' nearby competitor(s) opened recently');
  if (/-/.test(b.signals.reviewVelocity)) n.push('Review velocity falling ' + b.signals.reviewVelocity);
  if (b.signals.rentPerSqFt > 5) n.push('Rent at $' + b.signals.rentPerSqFt + '/sqft is above the city median');
  return n.slice(0, 3);
}

/* ---- DNA interpretation ---- */
async function explainDNA() {
  const b = byId(state.business);
  const out = $('#dnaOut');
  loading(out, 'DNA agent reading the profile');
  const top = Object.entries(b.dna).sort((a, c) => c[1] - a[1]);
  const mock =
`${b.name}'s DNA is defined by ${top[0][0].toLowerCase()} at ${top[0][1]} and constrained by ${top[top.length-1][0].toLowerCase()} at ${top[top.length-1][1]}.
Competition scores ${b.dna.Competition}, which means the market, not the operator, sets the ceiling here.
With expansion potential at ${b.dna['Expansion Potential']}, a second site is ${b.dna['Expansion Potential'] > 70 ? 'defensible now' : 'premature until the weakest axis improves'}.
Recommendation: invest against the lowest axis before scaling the highest one.`;
  const { text, source } = await AI.text(
    AGENTS.summary.prompt + modeSuffix(state.mode),
    `Interpret this Business DNA radar in 4 short lines.\n\n${JSON.stringify({ name: b.name, dna: b.dna, signals: b.signals })}`,
    { mock, maxTokens: 400 });
  typeInto(out, text, source);
}

/* ---- Forecast ---- */
async function forecast() {
  const b = byId(state.business);
  const out = $('#predOut');
  loading(out, 'Risk agent forecasting');
  const mock =
`Twelve-month closure probability is ${b.closeRisk}% with medium confidence.
The decisive variables are review velocity (${b.signals.reviewVelocity}) and hiring (${b.signals.hiringChange90d}); when both move the same direction the forecast is rarely wrong.
${b.signals.nearbyOpenings90d} new competitor(s) inside 90 days compress the recovery window to roughly two quarters.
Recommendation: ${b.closeRisk >= 60 ? 'restructure hours and cost base now, before the next lease decision.' : 'protect the current position and re-measure in 60 days.'}`;
  /* OpenAI logprobs turn "Confidence: Medium" into a real measured number:
     the mean per-token probability of the answer the model just produced. */
  const r = await AI.confident(
    AGENTS.risk.prompt + modeSuffix(state.mode),
    `Forecast the 12-month outlook and closure risk.\n\n${JSON.stringify({ ...slim(b), closeRisk: b.closeRisk, timeline: b.timeline, competitors: b.competitors })}`,
    { mock, maxTokens: 450 });

  await typeInto(out, r.text, r.source);

  if (r.confidence != null) {
    const cls = r.band === 'High' ? 'sc-g' : r.band === 'Medium' ? 'sc-o' : 'sc-r';
    out.insertAdjacentHTML('beforeend',
      `<div class="conf-badge ${cls}">Model confidence: <b>${r.confidence}%</b> \u00b7 ${r.band}` +
      `<small>mean token probability via logprobs</small></div>`);
  }
}

/* ---- Memory timeline ---- */
async function compareSnapshots() {
  const b = byId(state.business);
  const out = $('#memOut');
  loading(out, 'Comparing snapshots');
  const t = b.timeline[state.snapshot];
  const mock =
`Since January, hiring moved ${t.hiring > 0 ? '+' : ''}${t.hiring}% and reviews ${t.reviews > 0 ? '+' : ''}${t.reviews}%.
Parking complaints are ${t.complaints > 0 ? 'up ' + t.complaints + '%' : 'flat'} and competition increased by ${t.competition}.
Net health moved from ${b.timeline.January.health} to ${t.health}, a ${t.health - b.timeline.January.health > 0 ? 'gain' : 'loss'} of ${Math.abs(t.health - b.timeline.January.health)} points.
Recommendation: the complaint curve is the leading indicator here \u2014 watch it before the rating moves.`;
  const { text, source } = await AI.text(
    AGENTS.research.prompt + modeSuffix(state.mode),
    `Compare the January snapshot to the ${state.snapshot} snapshot and explain what changed and why it matters.\n\n${JSON.stringify({ name: b.name, timeline: b.timeline, signals: b.signals })}`,
    { mock, maxTokens: 420 });
  typeInto(out, text, source);
}

/* ---- Competitor simulator ---- */
async function simulateCompetition() {
  const b = byId(state.business);
  const out = $('#compOut');
  const btn = $('#compRun');
  btn.disabled = true; btn.textContent = 'Simulating\u2026';
  loading(out, 'Competitor agent analysing rivals');

  const mock = {
    recommendations: [
      'Add delivery on at least two aggregators to match rival coverage',
      'Extend closing time by 90 minutes to capture the evening gap',
      'Promote family and group specials where rivals only price for individuals',
      'Answer every review within 48 hours \u2014 this alone tracks with 2.3x traffic growth'
    ],
    summary: `${b.name} is not losing on product, it is losing on availability and price perception.\nRivals win on hours and lunch pricing, both of which are operational, not structural.\nRecommendation: fix hours and delivery first; they are the cheapest levers with the fastest measurable response.`
  };

  const { data, source } = await AI.json(
    AGENTS.competitor.prompt + modeSuffix(state.mode),
    `Return {"recommendations":["4 short counter-moves"],"summary":"3 short lines ending with a Recommendation: line"}\n\n` +
    `SUBJECT:\n${JSON.stringify(slim(b))}\n\nCOMPETITORS:\n${JSON.stringify(b.competitors)}`,
    mock, { maxTokens: 600 });

  $('#compRecs').innerHTML = (data.recommendations || mock.recommendations)
    .map(r => `<li>${escapeHTML(String(r).replace(/^[-\u2022]\s*/, ''))}</li>`).join('');
  await typeInto(out, data.summary || mock.summary, source);
  btn.disabled = false; btn.textContent = 'Re-run simulation';
}

/* ============================================================
   AI DETECTIVE \u2014 multi-agent pipeline
   ============================================================ */
const PIPELINE = ['research', 'economic', 'competitor', 'risk', 'summary'];

function renderPipelineShell() {
  $('#detPipeline').innerHTML = PIPELINE.map((k, i) => `
    <div class="stage" data-k="${k}">
      <span class="num">${i + 1}</span>
      <div class="sb"><b>${AGENTS[k].name}</b><p class="muted">${AGENTS[k].task}</p></div>
    </div>`).join('');
}

function detChips() {
  $('#detChips').innerHTML = DETECTIVE_SUGGESTIONS.map(q => `<button>${q}</button>`).join('');
  $$('#detChips button').forEach(b => b.addEventListener('click', () => {
    $('#detQ').value = b.textContent; runDetective();
  }));
}

const DET_MOCK = {
  research: 'Nine coffee shops operate within 400m of the Downtown core; three closed in the last twelve months.\nDowntown rent is $5.60/sqft against a city median of $3.80.\nDaytime population is flat at +2.1% while three new entrants opened in 90 days.\nHarbor Coffee Roasters shows a hiring freeze and \u221222% review velocity.',
  economic: 'Rent burden is the dominant variable: Downtown operators pay a 47% premium for flat demand.\nHousehold income of $104k is healthy, but the spend is happening near workplaces in North San Jose, not Downtown.\nOutdoor dining permit fees rose 40%, adding fixed cost to exactly the format that drove differentiation.\nUnit economics only work above roughly 340 covers a day, which most independents no longer reach.',
  competitor: 'Three national-brand entrants arrived in 90 days with mobile ordering and better supply chains.\nIndependents compete on atmosphere, which is the least defensible axis against a chain.\nBean Theory opening at 5:30am captured the commuter block that independents never served.\nCompetitive density is now roughly one shop per 1,100 daytime residents \u2014 well past saturation.',
  risk: 'The biggest risk is that this is structural, not cyclical: supply grew while demand did not.\nParking complaints, up 20%, historically precede a rating drop by about six weeks.\nAny operator without a wholesale or catering contract has no buffer for a rent reset.\nExpect two to four further Downtown closures within two quarters absent a demand shock.',
  summary: 'Downtown is not losing coffee shops because people stopped drinking coffee.\nIt is losing them because supply expanded into flat demand while rent rose 47% above the city median.\nNational entrants took the commuter and mobile-order segments that independents never contested.\nThe permit fee increase then taxed the one format that gave independents an edge.\nTwo to four more closures are likely within two quarters unless the residential pipeline lands first.\nRecommendation: treat Downtown as a defensive coffee market and deploy new capital into Berryessa or North San Jose, where the employment base is growing and rent is 40% lower.'
};

async function runDetective() {
  const q = $('#detQ').value.trim();
  if (!q) return;
  const btn = $('#detRun');
  btn.disabled = true; btn.textContent = 'Investigating\u2026';
  $('#detOut').hidden = true;
  renderPipelineShell();

  const ctx = JSON.stringify({
    question: q,
    districts: DISTRICTS,
    businesses: BUSINESSES.map(slim),
    news: NEWS.map(n => n.title),
    events: EVENTS.map(e => e.name),
    weather: 'Dry season, 6 days above 35C in the last month',
    permits: 'Downtown +2 new food permits, -3 surrendered; Berryessa +7'
  });

  const findings = [];
  for (const k of PIPELINE) {
    const stage = $(`.stage[data-k="${k}"]`);
    stage.classList.add('on');
    stage.querySelector('.sb').insertAdjacentHTML('beforeend', '');
    stage.insertAdjacentHTML('beforeend', '<span class="spin"></span>');

    const upstream = findings.length
      ? `\n\nUPSTREAM AGENT FINDINGS:\n${findings.map(f => f.name + ':\n' + f.text).join('\n\n')}`
      : '';
    const p = stage.querySelector('p');
    p.classList.remove('muted');
    p.textContent = '';

    const { text, source } = await aiInto(p,
      AGENTS[k].prompt + modeSuffix(state.mode),
      `QUESTION: ${q}\n\nCONTEXT:\n${ctx}${upstream}`,
      { mock: DET_MOCK[k], maxTokens: k === 'summary' ? 700 : 400 });

    stage.querySelector('.spin')?.remove();
    p.querySelector('.ai-src')?.remove();
    stage.classList.remove('on');
    stage.classList.add('done');
    findings.push({ name: AGENTS[k].name, text });

    if (k === 'summary') typeInto($('#detOut'), text, source);
  }

  btn.disabled = false; btn.textContent = 'Investigate';
}
$('#detRun').addEventListener('click', runDetective);

/* ============================================================
   OPPORTUNITY HEATMAP
   ============================================================ */
function renderHeatmap() {
  drawHeatmap($('#heatCanvas'), state.category);
  if (!state.district) {
    $('#heatSide').innerHTML = `<div class="empty">${icon('map', 26)}
      <b>Select a district</b><span class="small" style="display:block;margin-top:6px">Click any block on the map to generate a siting analysis.</span></div>`;
  }
}

$('#heatCategory').addEventListener('change', e => {
  state.category = e.target.value;
  renderHeatmap();
  if (state.district) selectDistrict(state.district, true);
});

const heatCv = $('#heatCanvas');
heatCv.addEventListener('mousemove', e => {
  const d = heatHitTest(heatCv, e);
  const tip = $('#heatTip');
  if (!d) { tip.hidden = true; HEAT.hot = null; drawHeatmap(heatCv, state.category); return; }
  if (HEAT.hot !== d.id) { HEAT.hot = d.id; drawHeatmap(heatCv, state.category); }
  const rect = heatCv.getBoundingClientRect();
  tip.hidden = false;
  tip.style.left = Math.min(rect.width - 210, e.clientX - rect.left + 14) + 'px';
  tip.style.top = (e.clientY - rect.top + 14) + 'px';
  tip.innerHTML = `<b>${d.name}</b>Score ${districtScore(d, state.category)} \u00b7 ${d.saturation} density<br>
    Pop ${d.pop} \u00b7 ${d.income} \u00b7 ${d.rent}`;
});
heatCv.addEventListener('mouseleave', () => {
  $('#heatTip').hidden = true; HEAT.hot = null; drawHeatmap(heatCv, state.category);
});
heatCv.addEventListener('click', e => {
  const d = heatHitTest(heatCv, e);
  if (d) selectDistrict(d.id);
});

async function selectDistrict(id, silent) {
  const d = DISTRICTS.find(x => x.id === id);
  state.district = id;
  HEAT.sel = id;
  drawHeatmap(heatCv, state.category);
  const score = districtScore(d, state.category);

  $('#heatSide').innerHTML = `
    <div class="card-head"><h3>${d.name}</h3>
      <span class="chip" style="color:${scoreColor(score)};border-color:${scoreColor(score)}55">${score}</span></div>
    <div class="kv">Category<b>${state.category}</b></div>
    <div class="kv">Population<b>${d.pop}</b></div>
    <div class="kv">Median income<b>${d.income}</b></div>
    <div class="kv">Commercial rent<b>${d.rent}</b></div>
    <div class="kv">Saturation<b>${d.saturation}</b></div>
    <button class="btn btn-primary w-full" id="heatAsk" style="margin-top:14px">Should I open here?</button>
    <div class="ai-out" id="heatOut" hidden></div>`;
  $('#heatAsk').addEventListener('click', () => analyseDistrict(d, score));
  if (!silent) analyseDistrict(d, score);
}

async function analyseDistrict(d, score) {
  const out = $('#heatOut');
  loading(out, 'Opportunity agent analysing');
  const mock =
`${d.name} scores ${score} for ${state.category.toLowerCase()}. ${d.note}
Rent at ${d.rent} against ${d.income} median income sets the break-even ticket size.
Saturation is ${d.saturation}, so the entry window is ${score >= 70 ? 'open but closing as others notice' : 'narrow and contested'}.
Recommendation: ${score >= 70 ? 'move now and secure a lease before rents reprice.' : score >= 45 ? 'enter only with a differentiated format and a rent concession.' : 'avoid this district for this category.'}`;
  const { text, source } = await AI.text(
    BASE_ROLE + ' You are the OPPORTUNITY AGENT. Judge whether to open this category here, using ' +
    'population, income, rent and saturation. End with a Recommendation: line.' + modeSuffix(state.mode),
    `Category: ${state.category}\nDistrict: ${JSON.stringify(d)}\nComputed opportunity score: ${score}\n\nAll districts for comparison:\n${JSON.stringify(DISTRICTS)}`,
    { mock, maxTokens: 450 });
  typeInto(out, text, source);
}

/* ============================================================
   SHOCKWAVE SIMULATION
   ============================================================ */
async function runSim() {
  const scenario = $('#simEvent').value;
  const chain = SIM_SCENARIOS[scenario];
  const btn = $('#simRun');
  btn.disabled = true; btn.textContent = 'Simulating\u2026';

  runShockwave($('#simCanvas'), chain.map(c => c.t));
  $('#simChain').innerHTML = chain.map(c =>
    `<li><b>${c.t}</b>${c.d}</li>`).join('');
  $$('#simChain li').forEach((li, i) => setTimeout(() => li.classList.add('show'), 220 * i));

  const out = $('#simOut');
  loading(out, 'Chain reaction engine propagating effects');
  const mock =
`${scenario} triggers a six-stage chain reaction across the local economy.
First-order effects hit within one quarter; second-order effects on rent and property values take four to eight quarters.
The net employment effect is positive in count but negative in average wage.
The businesses most exposed are those with a single demand channel and no pricing power.
Recommendation: operators within 800m should renegotiate lease terms before the effect is priced in by landlords.`;
  const { text, source } = await AI.text(
    BASE_ROLE + ' You are the CHAIN REACTION ENGINE. Predict cascading first, second and third-order ' +
    'effects across businesses, traffic, property values and employment.' + modeSuffix(state.mode),
    `Scenario: ${scenario}\n\nKnown chain:\n${JSON.stringify(chain)}\n\nCity context:\n${JSON.stringify({ districts: DISTRICTS, businesses: BUSINESSES.map(slim) })}`,
    { mock, maxTokens: 600 });
  typeInto(out, text, source);
  btn.disabled = false; btn.textContent = 'Simulate';
}
$('#simRun').addEventListener('click', runSim);

/* ============================================================
   AI DEBATE
   ============================================================ */
async function runDebate() {
  const q = $('#debQ').value.trim();
  if (!q) return;
  const btn = $('#debRun');
  btn.disabled = true; btn.textContent = 'Debating\u2026';
  $('#debVerdict').hidden = true;
  loading($('#debYes'), 'Agent A building the case for');
  loading($('#debNo'), 'Agent B building the case against');

  const ctx = JSON.stringify({ districts: DISTRICTS, businesses: BUSINESSES.map(slim) });
  const forMock =
`Willow Glen has $131k median income and family density, the exact customer profile Rosetta already converts.
Rent at $3.80/sqft is 32% cheaper than the current Downtown site, so break-even arrives faster.
Community trust of 96 travels with the brand; there is no artisan bakery within a mile.
Hiring is already up 34%, which means the operating team can staff a second site without a rebuild.`;
  const againstMock =
`Expansion potential is 83, but stability is only 72 \u2014 the current site has not proven it can run unattended.
Parking complaints are up 20% at the existing location; replicating operations replicates the flaw.
Two competitors already improved their lunch pricing, and a second site splits management attention.
Downtown's contraction shows how quickly a strong local brand can lose a market it does not defend.`;

  const [a, b] = await Promise.all([
    AI.text(BASE_ROLE + ' You are DEBATE AGENT A. Argue YES, forcefully but only with evidence from ' +
      'the context. 4 short lines.' + modeSuffix(state.mode),
      `QUESTION: ${q}\n\nCONTEXT:\n${ctx}`, { mock: forMock, maxTokens: 400, temp: 0.85 }),
    AI.text(BASE_ROLE + ' You are DEBATE AGENT B. Argue NO, forcefully but only with evidence from ' +
      'the context. 4 short lines.' + modeSuffix(state.mode),
      `QUESTION: ${q}\n\nCONTEXT:\n${ctx}`, { mock: againstMock, maxTokens: 400, temp: 0.85 })
  ]);

  await Promise.all([
    typeInto($('#debYes'), a.text, a.source),
    typeInto($('#debNo'), b.text, b.source)
  ]);

  const vMock =
`Maybe \u2014 but not yet, and not blindly.
The demand case for Willow Glen is the strongest in the city for this category, and the rent gap is real.
The weakness is operational: stability of 72 and rising complaints say the first site is not yet self-running.
Recommendation: fix the parking and service issues at the flagship this quarter, sign a Willow Glen lease option now to hold the rent, and open in two quarters.`;
  const v = await AI.text(
    BASE_ROLE + ' You are the JUDGE. You have heard both sides. Deliver a verdict of 3-4 short lines. ' +
    'Start with YES, NO, or MAYBE on its own opening phrase, then justify, then end with a ' +
    'Recommendation: line.' + modeSuffix(state.mode),
    `QUESTION: ${q}\n\nCASE FOR:\n${a.text}\n\nCASE AGAINST:\n${b.text}`,
    { mock: vMock, maxTokens: 450 });

  const vd = $('#debVerdict');
  vd.hidden = false;
  vd.innerHTML = '<b>Final verdict</b><div id="vdText"></div>';
  typeInto($('#vdText'), v.text, v.source);
  btn.disabled = false; btn.textContent = 'Run debate';
}
$('#debRun').addEventListener('click', runDebate);

/* ============================================================
   NEWS FUSION
   ============================================================ */
function renderNews() {
  $('#newsGrid').innerHTML = NEWS.map((n, i) => `
    <div class="card news-card">
      <img class="news-img" src="${n.img}" alt="" onerror="this.style.display='none'" />
      <h3>${n.title}</h3>
      <div class="news-src">${n.src}</div>
      <div class="muted small">Likely affected</div>
      <div class="impact">${n.affected.map(a => {
        const col = a.v >= 0 ? C.green : C.red;
        return `<div><span style="min-width:112px">${a.n}</span>
          <span class="b"><i style="width:${Math.min(100, Math.abs(a.v) * 2)}%;background:${col}"></i></span>
          <span class="p" style="color:${col}">${a.v > 0 ? '+' : ''}${a.v}%</span></div>`;
      }).join('')}</div>
      <button class="btn btn-soft w-full" data-news="${i}">Fuse with city data</button>
      <div class="ai-out" id="newsOut${i}" hidden></div>
    </div>`).join('');

  $$('[data-news]').forEach(b => b.addEventListener('click', () => fuseNews(Number(b.dataset.news))));
}

async function fuseNews(i) {
  const n = NEWS[i];
  const out = $('#newsOut' + i);
  loading(out, 'Fusing headline with local records');
  const worst = n.affected.slice().sort((a, b) => a.v - b.v)[0];
  const best = n.affected.slice().sort((a, b) => b.v - a.v)[0];
  const mock =
`This headline is not neutral \u2014 it redistributes demand rather than creating or destroying it.
${worst.n} absorb the damage at ${worst.v}%, while ${best.n} gain ${best.v > 0 ? '+' : ''}${best.v}%.
The named businesses most exposed in our index are those with a single demand channel inside the affected radius.
Recommendation: exposed operators should lock pricing and shift marketing spend toward the gaining segment within 30 days.`;
  const { text, source } = await AI.text(
    BASE_ROLE + ' You are the NEWS FUSION AGENT. Connect a news event to specific local businesses ' +
    'and categories in the index, and quantify the likely impact.' + modeSuffix(state.mode),
    `HEADLINE: ${n.title}\nSOURCE: ${n.src}\nMODELLED IMPACT: ${JSON.stringify(n.affected)}\n\n` +
    `BUSINESS INDEX:\n${JSON.stringify(BUSINESSES.map(slim))}\n\nDISTRICTS:\n${JSON.stringify(DISTRICTS)}`,
    { mock, maxTokens: 450 });
  typeInto(out, text, source);
}

/* ============================================================
   EVENT INTELLIGENCE
   ============================================================ */
function renderEvents() {
  $('#eventsGrid').innerHTML = EVENTS.map((e, i) => `
    <div class="card">
      <img class="news-img" src="${e.img}" alt="" onerror="this.style.display='none'" />
      <div class="event-when">${e.when}</div>
      <h3 style="margin:6px 0 4px">${e.name}</h3>
      <div class="muted small">Expected attendance ${e.attendance}</div>
      <div class="effects">${e.effects.map(x =>
        `<div class="effect">${x.n}<b class="${x.d}">${x.v}</b></div>`).join('')}</div>
      <button class="btn btn-soft w-full" data-evt="${i}" style="margin-top:12px">Brief me</button>
      <div class="ai-out" id="evtOut${i}" hidden></div>
    </div>`).join('');
  $$('[data-evt]').forEach(b => b.addEventListener('click', () => briefEvent(Number(b.dataset.evt))));
}

async function briefEvent(i) {
  const e = EVENTS[i];
  const out = $('#evtOut' + i);
  loading(out, 'Event agent modelling demand');
  const mock =
`${e.name} puts ${e.attendance} people into a constrained radius in a single window.
Food and hotels capture the upside; anything that depends on parking or routine commuters loses.
The swing is concentrated in a three-hour block, so staffing, not inventory, is the binding constraint.
Recommendation: restaurants within 600m should add one shift and pre-batch prep; coffee shops should shift staff to the following morning instead.`;
  const { text, source } = await AI.text(
    BASE_ROLE + ' You are the EVENT INTELLIGENCE AGENT. Predict hyperlocal demand shifts around a ' +
    'local event and give operators a staffing and inventory instruction.' + modeSuffix(state.mode),
    `EVENT: ${JSON.stringify(e)}\n\nNEARBY BUSINESSES:\n${JSON.stringify(BUSINESSES.map(slim))}`,
    { mock, maxTokens: 420 });
  typeInto(out, text, source);
}

/* ============================================================
   AI ALERTS
   ============================================================ */
function renderAlerts() {
  $('#alertCount').textContent = state.alerts.length;
  $('#alertsList').innerHTML = state.alerts.map(a => `
    <div class="alert sev-${a.sev}">
      <div class="ai" style="color:${a.sev === 'high' ? C.red : a.sev === 'med' ? C.orange : C.blue}">${icon(a.ic, 17)}</div>
      <div style="flex:1;min-width:0">
        <h3>${escapeHTML(a.title)}</h3>
        <div class="lbl">Reason</div><p>${escapeHTML(a.reason)}</p>
        <div class="lbl">Recommendation</div><p>${escapeHTML(a.rec)}</p>
      </div>
    </div>`).join('');
}

$('#alertGen').addEventListener('click', async () => {
  const btn = $('#alertGen');
  btn.disabled = true; btn.textContent = 'Generating\u2026';
  const mock = {
    sev: 'med', title: 'Margin compression \u2014 Green Grocer Market',
    reason: 'Parking complaints are up 21 while review velocity fell 9% and a warehouse club filed nearby.',
    rec: 'Lock in supplier terms now and pivot merchandising toward fresh and prepared foods, where a warehouse club cannot compete on convenience.'
  };
  const { data } = await AI.json(
    BASE_ROLE + ' You are the ALERTS AGENT. Generate one new, specific, non-duplicate intelligent alert ' +
    'about a real business or district in the index.',
    `Return {"sev":"high|med|low","title":"...","reason":"one sentence with numbers","rec":"one actionable sentence"}\n\n` +
    `INDEX:\n${JSON.stringify({ businesses: BUSINESSES.map(slim), districts: DISTRICTS })}\n\n` +
    `EXISTING ALERTS (do not repeat):\n${state.alerts.map(a => a.title).join('\n')}`,
    mock, { temp: 0.9, maxTokens: 400 });
  state.alerts.unshift({ ic: data.sev === 'high' ? 'alert' : data.sev === 'low' ? 'shield' : 'trendDown', ...data });
  state.alerts = state.alerts.slice(0, 8);
  renderAlerts();
  btn.disabled = false; btn.textContent = 'Generate new alert';
});

/* ============================================================
   ASK ANYTHING
   ============================================================ */
function renderAskChips() {
  $('#askChips').innerHTML = ASK_SUGGESTIONS.map(q => `<button>${q}</button>`).join('');
  $$('#askChips button').forEach(b => b.addEventListener('click', () => {
    $('#askQ').value = b.textContent; ask();
  }));
}

function bubble(cls, html) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.innerHTML = html;
  $('#chat').appendChild(d);
  $('#chat').scrollTop = $('#chat').scrollHeight;
  return d;
}

function mockAnswer(q) {
  const l = q.toLowerCase();
  if (l.includes('grocer')) return 'Green Grocer Market is the clearest decliner: health 57 and falling, review velocity \u22129%, foot traffic \u221211% YoY, and a warehouse club filing 1.4km away.\nNo other grocery in the index is contracting, so this is site-specific rather than a category collapse.\nRecommendation: watch its parking complaint curve \u2014 at 21 and rising it usually precedes a rating drop by six weeks.';
  if (l.includes('engineer') || l.includes('hir')) return 'Nova Robotics leads decisively with 41 new roles in 90 days and a new 40,000 sqft lease in North San Jose.\nRosetta Bakery is second in relative terms at +34%, though from a much smaller base.\nEverything else in the index is flat or contracting on headcount.\nRecommendation: food, fitness and childcare operators should scout North San Jose leases before rents reprice.';
  if (l.includes('invest') || l.includes('opportunit')) return 'The strongest hidden opportunity is North San Jose at 92, where employment is growing 6.8% against $3.20/sqft rent.\nBerryessa at 81 is the second: new transit access with almost no grab-and-go supply.\nWillow Glen at 86 is the safest for food specifically, given $131k median income and no artisan bakery within a mile.\nRecommendation: North San Jose for scale, Willow Glen for certainty.';
  if (l.includes('underserved')) return 'Pharmacies in Japantown: two locations serve roughly 18,000 residents with income rising 4.4%.\nEvening sushi city-wide: the three highest-rated restaurants all close before 8 PM.\nGrab-and-go breakfast in Berryessa, where new transit created demand ahead of supply.\nRecommendation: Japantown pharmacy is the highest-confidence gap in the index.';
  if (l.includes('fastest') || l.includes('changing')) return 'North San Jose is changing fastest: +6.8% population, the largest hiring surge, and the lowest rent of any growth district.\nBerryessa follows at +5.2%, driven by transit access rather than employment.\nAlum Rock is moving fastest in the wrong direction at \u22120.4% with two anchor closures.\nRecommendation: treat North San Jose as the growth allocation and Alum Rock as the avoid list.';
  return 'Across the index, growth is concentrated in employment-adjacent districts while Downtown discretionary retail contracts.\nHiring, review velocity and foot traffic are moving together, which historically makes the signal reliable.\nRecommendation: allocate to North San Jose and Berryessa, and defend rather than expand Downtown positions.';
}

/* Executes a tool call the model chose to make. Returns a human label for
   the confirmation bubble, or null if the call was not recognised. */
function runUITool(call) {
  const a = call.args || {};
  switch (call.name) {
    case 'open_business': {
      if (!byId(a.business_id)) return null;
      openBusiness(a.business_id);
      return byId(a.business_id).name;
    }
    case 'show_view': {
      const views = ['pulse','business','detective','heatmap','simulate','debate','news','events','alerts','ask','architecture'];
      if (!views.includes(a.view)) return null;
      go(a.view);
      if (a.view === 'heatmap') renderHeatmap();
      return 'the ' + a.view + ' view';
    }
    case 'run_simulation': {
      if (!a.scenario) return null;
      go('simulate');
      $('#simEvent').value = a.scenario;
      runSim();
      return 'a shockwave simulation';
    }
    case 'investigate': {
      if (!a.question) return null;
      go('detective');
      $('#detQ').value = a.question;
      runDetective();
      return 'the detective pipeline';
    }
    default: return null;
  }
}

async function ask() {
  const q = $('#askQ').value.trim();
  if (!q) return;
  $('#askQ').value = '';
  bubble('user', escapeHTML(q));
  const out = bubble('bot', 'Reasoning<span class="cursor"></span>');

  /* OpenAI function calling: the model may decide to operate the terminal
     itself rather than only answering. */
  const routed = await AI.tools(
    'You are the command router for LOCAL RADAR, a city business intelligence terminal. ' +
    'If the analyst is asking to open, show, simulate or investigate something, call the matching ' +
    'function. If they are only asking a question that needs a written answer, call nothing.',
    q, UI_TOOLS, { maxTokens: 120 });

  const performed = routed.calls.map(runUITool).filter(Boolean);
  if (performed.length) {
    out.innerHTML = escapeHTML('Opening ' + performed.join(' and ') + ' for you.') + srcBadge('openai');
    out.classList.add('bot');
    $('#chat').scrollTop = $('#chat').scrollHeight;
    return;
  }

  const { text, source } = await aiInto(out,
    AGENTS.summary.prompt + modeSuffix(state.askMode),
    `QUESTION: ${q}\n\nFULL CITY INDEX:\n${JSON.stringify({
      city: CITIES[state.city].name,
      pulse: PULSE_STATS,
      businesses: BUSINESSES.map(b => ({ ...slim(b), dna: b.dna, closeRisk: b.closeRisk, timeline: b.timeline })),
      districts: DISTRICTS,
      news: NEWS.map(n => ({ title: n.title, affected: n.affected })),
      events: EVENTS.map(e => ({ name: e.name, effects: e.effects })),
      insights: state.insights
    })}`,
    { mock: mockAnswer(q), maxTokens: 700 });

  out.classList.add('bot');
  $('#chat').scrollTop = $('#chat').scrollHeight;
}
$('#askRun').addEventListener('click', ask);
$('#askQ').addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
$('#detQ').addEventListener('keydown', e => { if (e.key === 'Enter') runDetective(); });
$('#debQ').addEventListener('keydown', e => { if (e.key === 'Enter') runDebate(); });

/* ============================================================
   ARCHITECTURE VIEW
   ============================================================ */
function renderArch() {
  const node = (t, s, a) => `<div class="arch-node ${a ? 'accent' : ''}"><b>${t}</b><small>${s}</small></div>`;
  const arrow = '<div class="arch-arrow">\u2193</div>';
  $('#arch').innerHTML = [
    node('Hyperlocal Data Sources', 'permits \u00b7 reviews \u00b7 job posts \u00b7 foot traffic \u00b7 rent \u00b7 closures \u00b7 weather \u00b7 events'),
    arrow,
    node('Data Cleaning &amp; Normalization', 'one structured record per business and district'),
    arrow,
    node('Vector Store / Semantic Index', 'embedded records, retrievable by natural language'),
    arrow,
    node('Retrieval Layer', 'selects only the records relevant to the question'),
    arrow,
    node('OpenAI Reasoning Engine', AI.cfg.model + ' \u00b7 5 specialised agent prompts', true),
    arrow,
    `<div class="arch-fan">
      ${node('Forecast', 'closure risk, 12-month outlook')}
      ${node('Risk', 'fragility, leading indicators')}
      ${node('Opportunity', 'siting, expansion, gaps')}
    </div>`,
    arrow,
    node('Visualization Dashboard', 'this terminal')
  ].join('');

  $('#snippet').textContent = `// Every panel in LOCAL RADAR routes through this one client.
// OpenAI API key (sk-...) + ${AI.cfg.model}.

const MODEL = '${AI.cfg.model}';
const URL   = 'https://api.openai.com/v1/chat/completions';
const HEAD  = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + API_KEY
};

// 1. REAL TOKEN STREAMING (server-sent events)
async function stream(system, user, onToken) {
  const r = await fetch(URL, { method: 'POST', headers: HEAD,
    body: JSON.stringify({
      model: MODEL, stream: true, seed: 7,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user }
      ]
    })
  });
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const p = line.slice(5).trim();
      if (p === '[DONE]') continue;
      const d = JSON.parse(p).choices[0].delta.content;
      if (d) { full += d; onToken(d); }
    }
  }
  return full;
}

// 2. STRUCTURED OUTPUTS - decoding is constrained to the schema,
//    so the shape is guaranteed rather than merely requested.
response_format: {
  type: 'json_schema',
  json_schema: { name: 'health', strict: true, schema: HEALTH_SCHEMA }
}

// 3. LOGPROBS - the model's own token probabilities become the
//    confidence number shown on every forecast.
logprobs: true, top_logprobs: 5
// mean(exp(logprob)) over the answer -> 0-100% confidence

// 4. EMBEDDINGS - the retrieval layer is real, not a diagram.
POST /v1/embeddings  { model: 'text-embedding-3-small', input: corpus }
// cosine(query, corpus) ranks omnisearch semantically

// 5. FUNCTION CALLING - the model operates the terminal itself.
tools: [ open_business, show_view, run_simulation, investigate ]

// The multi-agent pipeline is just five prompts over the same model,
// each one receiving the previous agent's findings as context:
//   Research -> Economic -> Competitor -> Risk -> Summary

const PIPELINE = ['research','economic','competitor','risk','summary'];
let findings = [];
for (const stage of PIPELINE) {
  const out = await stream(
    AGENTS[stage].prompt,
    'QUESTION: ' + question +
    '\\n\\nCONTEXT:\\n' + JSON.stringify(cityIndex) +
    '\\n\\nUPSTREAM:\\n' + findings.join('\\n\\n')
  );
  findings.push(AGENTS[stage].name + ':\\n' + out);
}`;
}

/* ============================================================
   OMNISEARCH
   ============================================================ */
const omni = $('#omni');
omni.addEventListener('input', () => {
  const q = omni.value.trim().toLowerCase();
  const box = $('#omniResults');
  if (!q) { box.hidden = true; return; }
  const biz = BUSINESSES.filter(b => b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q));
  const dis = DISTRICTS.filter(d => d.name.toLowerCase().includes(q));
  const rows = [
    ...biz.map(b => `<button data-go="biz:${b.id}">${b.emoji} ${b.name}<small>${b.category}</small></button>`),
    ...dis.map(d => `<button data-go="dis:${d.id}">\u{1F5FA} ${d.name}<small>district</small></button>`),
    `<button data-go="ask:${encodeURIComponent(omni.value)}">\u2728 Ask LOCAL RADAR \u201c${escapeHTML(omni.value)}\u201d<small>AI</small></button>`
  ];
  box.innerHTML = rows.join('');
  box.hidden = false;
  $$('button', box).forEach(b => b.addEventListener('click', () => {
    const [k, v] = b.dataset.go.split(':');
    box.hidden = true; omni.value = '';
    if (k === 'biz') openBusiness(v);
    if (k === 'dis') { go('heatmap'); renderHeatmap(); selectDistrict(v); }
    if (k === 'ask') { go('ask'); $('#askQ').value = decodeURIComponent(v); ask(); }
  }));
});
/* ---- semantic search over the embedded corpus (OpenAI embeddings) ----
   Substring matching only finds what you already know how to spell. With a
   live key the same box also ranks the corpus by cosine similarity, so
   "where can I get a coffee near students" finds the right district. */
function bindOmniButtons(box) {
  $$('button', box).forEach(b => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      const [k, v] = b.dataset.go.split(':');
      box.hidden = true; omni.value = '';
      if (k === 'biz') openBusiness(v);
      if (k === 'dis') { go('heatmap'); renderHeatmap(); selectDistrict(v); }
      if (k === 'ask') { go('ask'); $('#askQ').value = decodeURIComponent(v); ask(); }
    });
  });
}

let semTimer = null;
omni.addEventListener('input', () => {
  clearTimeout(semTimer);
  const q = omni.value.trim();
  if (!AI.indexed || q.length < 4) return;
  semTimer = setTimeout(async () => {
    const hits = await AI.semanticSearch(q, 4);
    if (!hits || omni.value.trim() !== q) return;
    const box = $('#omniResults');
    const have = new Set([...box.querySelectorAll('button')].map(b => b.dataset.go));
    const rows = hits
      .filter(h => h.score > 0.25 && !have.has(h.go))
      .map(h => `<button data-go="${h.go}">${h.label}<small>${Math.round(h.score * 100)}% semantic match</small></button>`);
    if (!rows.length) return;
    box.insertAdjacentHTML('beforeend', rows.join(''));
    box.hidden = false;
    bindOmniButtons(box);
  }, 260);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.omnisearch')) $('#omniResults').hidden = true;
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
    e.preventDefault(); omni.focus();
  }
  if (e.key === 'Escape') { closeModal(); $('#omniResults').hidden = true; }
});

/* ============================================================
   DEMO STORY TOUR
   ============================================================ */
const TOUR = [
  { t: 'A bakery owner wants to expand. We start at the City Pulse \u2014 one score for the whole city, generated daily.', a: () => go('pulse') },
  { t: 'We search for a real business in the active city \u2014 real address, real rating, real review count.', a: () => openBusiness(BUSINESSES[0].id) },
  { t: 'Generate the Health Score. The model reasons over hiring, reviews, traffic and complaints \u2014 not just displaying data.', a: () => { go('business'); genHealth(); } },
  { t: 'Business DNA gives the company an AI-generated identity across six axes. Community trust of 96 is the moat.', a: () => explainDNA() },
  { t: 'Now the question: where should they open a second location? The Opportunity Heatmap ranks every district.', a: () => { go('heatmap'); renderHeatmap(); } },
  { t: 'Willow Glen scores highest for bakery \u2014 high income, family density, no artisan bakery within a mile.', a: () => { go('heatmap'); selectDistrict('willow'); } },
  { t: 'We simulate the shockwave of a major nearby opening to stress-test the decision.', a: () => { go('simulate'); runSim(); } },
  { t: 'Two agents argue both sides, and a judge delivers the verdict with a concrete recommendation. That is the executive report.', a: () => { go('debate'); runDebate(); } }
];
let tourI = -1;
function tourNext() {
  tourI++;
  if (tourI >= TOUR.length) return tourExit();
  $('#tour').hidden = false;
  $('#tourStep').textContent = `${tourI + 1} / ${TOUR.length}`;
  $('#tourText').textContent = TOUR[tourI].t;
  $('#tourNext').textContent = tourI === TOUR.length - 1 ? 'Finish' : 'Next';
  TOUR[tourI].a();
}
function tourExit() { tourI = -1; $('#tour').hidden = true; }
$('#tourBtn').addEventListener('click', () => { tourI = -1; tourNext(); });
$('#tourNext').addEventListener('click', tourNext);
$('#tourExit').addEventListener('click', tourExit);

/* ============================================================
   CLOCK + CITY
   ============================================================ */
setInterval(() => {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('en-US', { hour12: false });
}, 1000);

/* Rebuilds the simulation dropdown from the active city's real scenarios. */
function rebuildSimOptions() {
  const sel = $('#simEvent');
  if (!sel) return;
  sel.innerHTML = Object.keys(SIM_SCENARIOS).map(s => '<option>' + escapeHTML(s) + '</option>').join('');
}

/* Corpus for omnisearch, rebuilt whenever the city changes. */
function buildCorpus() {
  return [
    ...BUSINESSES.map(b => ({
      go: 'biz:' + b.id,
      label: b.emoji + ' ' + b.name,
      text: [b.name, b.category, b.hood, b.addr || '',
             'health ' + b.healthHint, 'rating ' + b.rating].join(' \u00b7 ')
    })),
    ...DISTRICTS.map(d => ({
      go: 'dis:' + d.id,
      label: '\u{1F5FA} ' + d.name,
      text: [d.name, 'district', 'opportunity score ' + d.score, d.note || ''].join(' \u00b7 ')
    }))
  ];
}

/* Switching city swaps the whole hydrated dataset, then re-renders every view. */
function switchCity(key) {
  if (!setActiveCity(key)) return;
  state.city = key;
  if ($('#citySelect').value !== key) $('#citySelect').value = key;
  state.business = BUSINESSES[0].id;
  state.district = null;
  state.insights = SEED_INSIGHTS.slice();
  state.alerts = SEED_ALERTS.slice();

  renderTicker();
  renderPulse();
  renderBizList($('#bizFilter') ? $('#bizFilter').value : '');
  renderBizDetail();
  detChips();
  renderAskChips();
  rebuildSimOptions();
  renderHeatmap();
  renderNews();
  renderEvents();
  renderAlerts();

  const sc = $('#simChain'); if (sc) sc.innerHTML = '';
  const so = $('#simOut'); if (so) so.hidden = true;

  if (typeof AI !== 'undefined' && AI.live()) {
    AI.buildIndex(buildCorpus()).catch(() => {});
  }
}

$('#citySelect').addEventListener('change', e => switchCity(e.target.value));

/* ============================================================
   BOOT
   ============================================================ */
/* The key is embedded, so it is probed once on load and the result is made
   impossible to miss: the sidebar pill reports live / error, and a rejected
   key is logged with Google's own message. Panels keep working either way,
   because AI.text() falls back to the mock engine on failure. */
async function verifyEngine() {
  const pip = $('#enginePip'), name = $('#engineName'), sub = $('#engineSub');

  if (!AI.live()) {
    name.textContent = 'Mock engine';
    sub.textContent = 'no key in js/openai.js';
    console.warn('[Local Radar] No key found. Paste one into EMBEDDED_KEY at the top ' +
                 'of js/openai.js to make every panel live. Running on the mock engine.');
    return;
  }
  if (!AI.keyLooksValid) {
    console.warn('[Local Radar] The embedded key does not look like an OpenRouter or OpenAI key (expected "sk-...").');
  }

  name.textContent = 'Checking engine';
  sub.textContent = AI.cfg.model;

  try {
    const ms = await AI.test();
    pip.classList.add('live');
    name.textContent = 'OpenRouter live';
    sub.textContent = AI.cfg.model + ' \u00b7 ' + ms + ' ms';

    // Build the vector index once the key is known good.
    AI.buildIndex(buildCorpus()).catch(err => console.warn('[Local Radar] index failed:', err.message));
  } catch (err) {
    pip.classList.remove('live');
    name.textContent = AI.fileOrigin ? 'Open over http' : 'Engine error';
    sub.textContent = AI.fileOrigin
      ? 'file:// blocks the API call'
      : (err.status ? 'HTTP ' + err.status + ' \u00b7 mock engine' : 'offline \u00b7 mock engine');
    sub.title = err.message;
    console.error('[Local Radar] OpenRouter call failed:', err.message);
  }
}

/* Live token + cost accounting. OpenAI returns exact usage on every call,
   including on streamed responses via stream_options. */
document.addEventListener('ai:usage', e => {
  const u = e.detail;
  const set = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
  set('#uCalls', u.calls);
  set('#uTokens', (u.promptTokens + u.completionTokens).toLocaleString());
  set('#uCost', '$' + u.cost.toFixed(4));
});
document.addEventListener('ai:index', e => {
  const el = $('#uIndex'); if (el) el.textContent = e.detail.count + ' rows';
});
document.addEventListener('ai:model', () => refreshEngineUI());

function boot() {
  hydrateIcons();
  initTheme();
  $('#citySelect').value = state.city;
  rebuildSimOptions();
  refreshEngineUI();
  verifyEngine();
  renderTicker();
  renderPulse();
  renderBizList();
  renderBizDetail();
  renderPipelineShell();
  detChips();
  renderHeatmap();
  renderNews();
  renderEvents();
  renderAlerts();
  renderAskChips();
  renderArch();
  bubble('bot', 'LOCAL RADAR is online. I can reason over every business, district, headline and event in the index.\nAsk me anything, or pick one of the suggestions below.');
}
boot();
