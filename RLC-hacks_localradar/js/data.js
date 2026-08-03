/* ============================================================
   HYPERLOCAL DATA LAYER
   Real US cities, real neighbourhoods, real businesses, real
   venues and real news anchors live in js/cities*.js as the
   CITY_DATA atlas. This file hydrates the active city into the
   exact structured JSON shape the reasoning engine consumes.

   Places are real. Scores, timelines and signals are
   deterministic simulations derived from each record, so the
   same city always produces the same numbers.
   ============================================================ */

/* ---------- deterministic helpers ---------- */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seeded(seed, i, min, max) {
  return min + (hashStr(seed + ':' + i) % (max - min + 1));
}
function pickFrom(seed, i, arr) { return arr[hashStr(seed + ':' + i) % arr.length]; }

const PHOTO_POOL = {
  bakery:   'photo-1509440159596-0249088772ff',
  coffee:   'photo-1495474472287-4d71bcdd2085',
  pizza:    'photo-1513104890138-7c749659a591',
  retail:   'photo-1491933382434-500287f9b54b',
  tech:     'photo-1531297484001-80022131f5a1',
  grocery:  'photo-1542838132-92c53300491e',
  road:     'photo-1545459720-aac8509eb02c',
  office:   'photo-1518770660439-4636190af475',
  dining:   'photo-1414235077428-338989a2e8c0',
  store:    'photo-1578916171728-46686eac8d58',
  arena:    'photo-1580692475446-c2fabbbe4a02',
  market:   'photo-1533174072545-7a4b6ad7a6c3',
  conf:     'photo-1540575467063-178a50c2df87'
};
const img = (k, w) => 'https://images.unsplash.com/' + PHOTO_POOL[k] + '?w=' + (w || 600) + '&q=70';

function photoFor(cat) {
  const c = (cat || '').toLowerCase();
  if (/bak|pastr|bagel|dough/.test(c))              return img('bakery');
  if (/coffee|cafe|espresso|tea/.test(c))           return img('coffee');
  if (/pizza|italian|noodle|pasta/.test(c))         return img('pizza');
  if (/retail|store|shop|market|grocer/.test(c))    return img('grocery');
  if (/tech|robot|startup|software/.test(c))        return img('tech');
  if (/bar|honky|brew|tap|lounge|club/.test(c))     return img('dining');
  return img('dining');
}

/* ---------- trend + signal derivation ---------- */
const TREND_MAP = { rising: 'rising', stable: 'flat', declining: 'falling' };

function rentNum(str) { const m = /([\d.]+)/.exec(str || ''); return m ? Number(m[1]) : 3.5; }

function deriveSignals(b, district, seed) {
  const t = TREND_MAP[b.trend] || 'flat';
  const up = t === 'rising', down = t === 'falling';
  const rent = district ? rentNum(district.rent) : 3.8;
  const frozen = down && b.closeRisk >= 20;

  const hire = up   ? '+' + seeded(seed, 1, 8, 38) + '%'
             : down ? (frozen ? '-100% (freeze)' : '-' + seeded(seed, 2, 4, 18) + '%')
             : '0%';
  const revVel = up ? '+' + seeded(seed, 3, 6, 24) + '%'
               : down ? '-' + seeded(seed, 4, 5, 26) + '%'
               : '+' + seeded(seed, 5, 0, 4) + '%';
  const rating = up ? '+0.' + seeded(seed, 6, 1, 4)
               : down ? '-0.' + seeded(seed, 7, 1, 5) : '0.0';
  const foot = up ? '+' + seeded(seed, 8, 6, 27) + '% YoY'
             : down ? '-' + seeded(seed, 9, 4, 22) + '% YoY'
             : '+' + seeded(seed, 10, 0, 3) + '% YoY';

  return {
    hiringChange90d: hire,
    reviewVelocity: revVel,
    avgRatingChange: rating,
    footTraffic: foot,
    permitsFiled: up ? seeded(seed, 11, 1, 4) : 0,
    complaints: {
      parking: Math.round(seeded(seed, 12, 2, 14) + (rent > 5 ? 18 : 0) + (b.reviews > 5000 ? 12 : 0)),
      noise: seeded(seed, 13, 0, 4)
    },
    nearbyOpenings90d: down ? seeded(seed, 14, 2, 4) : seeded(seed, 15, 0, 2),
    rentPerSqFt: rent,
    instagramMentions: up ? '+' + seeded(seed, 16, 20, 140) + '%' : down ? '-' + seeded(seed, 17, 8, 34) + '%' : '+' + seeded(seed, 18, 1, 9) + '%'
  };
}

function deriveDNA(b, district, seed) {
  const t = TREND_MAP[b.trend] || 'flat';
  const clamp = n => Math.max(8, Math.min(99, Math.round(n)));
  const satScore = { 'very low': 22, low: 38, medium: 58, high: 80, 'very high': 93 }[district ? district.sat : 'medium'] || 58;
  const scale = b.reviews > 6000 ? 14 : b.reviews > 2000 ? 8 : 0;
  return {
    Growth: clamp(b.health + (t === 'rising' ? 10 : t === 'falling' ? -26 : -6) + seeded(seed, 21, -4, 4)),
    Stability: clamp(100 - b.closeRisk * 1.6 + scale + seeded(seed, 22, -4, 4)),
    Competition: clamp(satScore + seeded(seed, 23, -6, 8)),
    Innovation: clamp(b.health - 18 + (t === 'rising' ? 14 : 0) + seeded(seed, 24, -6, 8)),
    'Community Trust': clamp((b.rating / 5) * 100 + (b.reviews > 3000 ? 6 : 0) + seeded(seed, 25, -3, 3)),
    'Expansion Potential': clamp(b.health - b.closeRisk * 0.7 + (t === 'rising' ? 12 : 0) + seeded(seed, 26, -4, 4))
  };
}

function deriveTimeline(b, sig) {
  const t = TREND_MAP[b.trend] || 'flat';
  const end = b.health;
  const start = t === 'rising' ? Math.max(30, end - 17) : t === 'falling' ? Math.min(96, end + 28) : end + 3;
  const at = f => Math.round(start + (end - start) * f);
  const hireEnd = parseInt(String(sig.hiringChange90d).replace(/[^\-\d]/g, ''), 10) || 0;
  const revEnd = parseInt(String(sig.reviewVelocity).replace(/[^\-\d]/g, ''), 10) || 0;
  const compEnd = sig.nearbyOpenings90d;
  const cmpEnd = sig.complaints.parking;
  const step = (v, f) => Math.round(v * f);
  return {
    January: { hiring: 0, reviews: 0, complaints: 0, competition: 0, health: at(0) },
    March:   { hiring: step(hireEnd, .32), reviews: step(revEnd, .28), complaints: step(cmpEnd, .3), competition: step(compEnd, .34), health: at(.34) },
    May:     { hiring: step(hireEnd, .68), reviews: step(revEnd, .62), complaints: step(cmpEnd, .66), competition: step(compEnd, .67), health: at(.7) },
    July:    { hiring: hireEnd, reviews: revEnd, complaints: cmpEnd, competition: compEnd, health: end }
  };
}

function hydrateBusiness(b, districts) {
  const district = districts.find(d => d.name === b.hood) || districts[0];
  const seed = b.id + '|' + b.name;
  const signals = deriveSignals(b, district, seed);
  return {
    id: b.id, name: b.name, emoji: b.emoji, category: b.category, hood: b.hood,
    addr: b.addr, rating: b.rating, reviews: b.reviews, employees: b.employees,
    priceTier: b.priceTier, photo: photoFor(b.category),
    trend: TREND_MAP[b.trend] || 'flat',
    healthHint: b.health, closeRisk: b.closeRisk,
    dna: deriveDNA(b, district, seed),
    signals: signals,
    timeline: deriveTimeline(b, signals),
    competitors: (b.comp || []).map(c => ({ name: c[0], strengths: c[1].split('|') }))
  };
}

/* ---------- scenario chain generation ---------- */
function chainFor(kind, ctx) {
  const { best, worst, top, risk, city } = ctx;
  if (kind === 'bigbox') return [
    { t: 'Nearby grocers lose basket volume', d: `Independent grocers in ${best.name} absorb an estimated \u221228% to \u221241% of weekly basket volume within six months.` },
    { t: 'Vehicle traffic increases',        d: `Roughly 4,100 additional weekday trips through ${best.name}, peaking Saturday 11:00\u201315:00.` },
    { t: 'Property values increase',         d: `Commercial parcels within 800m appreciate an estimated 5\u20139% over 24 months, against ${best.rent} asking rent today.` },
    { t: 'Restaurants benefit',              d: `Quick-service and casual dining within 500m gain +17% covers from spillover trips.` },
    { t: 'Gas stations improve',             d: 'Fuel volume rises 22\u201330% if a fuel station is included in the site plan.' },
    { t: 'Employment shifts',                d: '+230 retail jobs created, \u221255 to \u221290 lost at displaced independents \u2014 net positive, lower average wage.' }
  ];
  if (kind === 'closure') return [
    { t: 'Nearby operators absorb demand', d: `Two independents within 300m capture +34% and +21% of the released volume respectively.` },
    { t: 'Foot traffic redistributes',     d: `Arrivals shift roughly 90m toward the remaining anchors on the ${risk.hood} strip.` },
    { t: 'Retail neighbours dip',          d: 'Adjacent storefronts see \u22126% weekday walk-ins for one quarter.' },
    { t: 'Property terms soften',          d: 'The landlord likely offers 3\u20136 months abatement to backfill the unit.' },
    { t: 'Employment',                     d: `\u2212${risk.employees} roles, with about 60% reabsorbed locally inside eight weeks.` },
    { t: 'Category demand settles',        d: `Net ${risk.category.toLowerCase()} demand in ${city} is unchanged \u2014 this is redistribution, not contraction.` }
  ];
  if (kind === 'transit') return [
    { t: 'Access degrades during works', d: 'Drive-time along the affected corridor rises 7\u201311 minutes at peak for the duration of construction.' },
    { t: 'Commuter formats lose volume', d: 'Gas stations \u221234%, cafes \u221218% and roadside retail \u221222%; commuter-dependent formats are hit hardest.' },
    { t: 'Hotels gain',                  d: '+11% from contractor and crew bookings across the corridor.' },
    { t: 'Delivery economics worsen',    d: 'Courier times rise 4\u20136 minutes, squeezing delivery-only kitchens.' },
    { t: 'Long-run access improves',     d: `On completion, ${best.name} gains the largest accessibility uplift in ${city}.` },
    { t: 'Recovery',                     d: 'Comparable projects recovered 80\u201390% of traffic within two quarters of reopening.' }
  ];
  return [
    { t: 'Resident base grows',          d: `+640 residents, skewing 25\u201339 with above-median discretionary spend, on top of ${best.pop} district growth.` },
    { t: 'Grab-and-go demand rises',     d: 'Breakfast and evening convenience formats gain +26% within a 400m radius.' },
    { t: 'Weak categories recover',      d: `Daytime volume rises roughly +14%, partly offsetting the contraction seen around ${worst.name}.` },
    { t: 'Parking pressure intensifies', d: 'Street parking complaints projected +35%, a leading indicator of rating drops.' },
    { t: 'Rents reprice upward',         d: `Ground-floor asking rent rises 6\u201312% within 18 months from ${best.rent}.` },
    { t: 'Net verdict',                  d: `Structurally positive for food and convenience, negative for parking-dependent formats. ${top.name} is best placed to capture it.` }
  ];
}

/* ---------- static language config ---------- */
const EXPLAIN_MODES = ['Professional','Investor','Child','City planner','Small business owner','Developer'];

const MODE_STYLE = {
  'Professional':        'Write as a senior market analyst. Precise, neutral, evidence-first. No hype.',
  'Investor':            'Write for a capital allocator. Lead with risk, return, timing and downside. Use ranges.',
  'Child':               'Explain like the reader is five. Very short sentences, simple words, one friendly comparison.',
  'City planner':        'Write for municipal planning. Focus on zoning, permits, density, equity and public infrastructure.',
  'Small business owner':'Write for an owner-operator. Practical, direct, action-first. Talk about cost, staff and hours.',
  'Developer':           'Write for a software engineer. Terse, structured, mention the data fields and signals used.'
};

const BASE_INSIGHTS = [
  'Businesses that answered more than 60% of their reviews grew foot traffic 2.3x faster than those that ignored them.',
  'Parking complaints predict a rating drop about six weeks before the rating actually falls.',
  'Restaurants within 200m of a new gym gained 14% in lunch traffic within one quarter.',
  'Four of the five fastest-growing businesses this year opened in tracts with falling, not rising, retail rent.',
  'Every operator that survived the last rent cycle had a second revenue line; none of the closures did.'
];

/* ---------- city registry ---------- */
const CITY_KEYS = Object.keys(CITY_DATA).sort((a, b) => CITY_DATA[a].rank - CITY_DATA[b].rank);

const CITIES = {};
CITY_KEYS.forEach(k => {
  CITIES[k] = { name: CITY_DATA[k].name + ', ' + CITY_DATA[k].state, pulse: CITY_DATA[k].pulse, rank: CITY_DATA[k].rank, pop: CITY_DATA[k].pop };
});

/* ---------- mutable per-city state ---------- */
let ACTIVE_CITY = CITY_KEYS[0];
/* The heatmap grid is 9 x 6. Authored district rectangles are kept when they
   fit without collisions; anything that overlaps is relocated to the nearest
   free slot of the same size, so every city packs cleanly. */
function packDistricts(list, cols, rows) {
  cols = cols || 9; rows = rows || 6;
  const grid = [];
  for (let y = 0; y < rows; y++) grid.push(new Array(cols).fill(false));
  const free = (x, y, w, h) => {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j][i]) return false;
    return true;
  };
  const claim = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = true;
  };
  return list.map(d => {
    let w = Math.max(1, Math.min(cols, d.w || 1));
    let h = Math.max(1, Math.min(rows, d.h || 1));
    let x = d.x, y = d.y;
    if (!free(x, y, w, h)) {
      let placed = false;
      for (let j = 0; j < rows && !placed; j++) {
        for (let i = 0; i < cols && !placed; i++) {
          if (free(i, j, w, h)) { x = i; y = j; placed = true; }
        }
      }
      if (!placed) {
        w = 1; h = 1;
        for (let j = 0; j < rows && !placed; j++) {
          for (let i = 0; i < cols && !placed; i++) {
            if (free(i, j, 1, 1)) { x = i; y = j; placed = true; }
          }
        }
      }
    }
    claim(x, y, w, h);
    return Object.assign({}, d, { x: x, y: y, w: w, h: h });
  });
}

let PULSE_STATS = [], TICKER = [], BUSINESSES = [], DISTRICTS = [], NEWS = [], EVENTS = [];
let SEED_ALERTS = [], SEED_INSIGHTS = [], EXTRA_INSIGHTS = [], SIM_SCENARIOS = {};
let ASK_SUGGESTIONS = [], DETECTIVE_SUGGESTIONS = [];

function setActiveCity(key) {
  const c = CITY_DATA[key];
  if (!c) return false;
  ACTIVE_CITY = key;

  DISTRICTS = packDistricts(c.districts, 9, 6).map(d => ({
    id: d.id, name: d.name, x: d.x, y: d.y, w: d.w, h: d.h,
    pop: d.pop, income: d.income, rent: d.rent, score: d.score,
    saturation: d.sat, note: d.note
  }));

  BUSINESSES = c.businesses.map(b => hydrateBusiness(b, c.districts));

  PULSE_STATS = c.stats.map(s => ({ label: s[0], value: s[1], dir: s[2], color: s[3] }));

  const NEWS_IMG = { housing: 'office', transit: 'road', bigbox: 'store', closure: 'dining' };
  NEWS = c.news.map(n => ({
    title: n.title, src: n.src, img: img(NEWS_IMG[n.kind] || 'dining'),
    affected: n.affected.map(a => ({ n: a[0], v: a[1], d: a[2] }))
  }));

  EVENTS = c.events.map((e, i) => ({
    name: e.name, when: e.when, attendance: e.attendance,
    img: img(i === 0 ? 'arena' : 'market'),
    effects: e.effects.map(x => ({ n: x[0], v: x[1], d: x[2] }))
  }));

  /* movers, ranked */
  const byHealth = BUSINESSES.slice().sort((a, b) => b.healthHint - a.healthHint);
  const top = byHealth[0];
  const risk = BUSINESSES.slice().sort((a, b) => b.closeRisk - a.closeRisk)[0];
  const byScore = DISTRICTS.slice().sort((a, b) => b.score - a.score);
  const best = byScore[0], worst = byScore[byScore.length - 1];

  /* ticker: real names, separated values */
  TICKER = [];
  BUSINESSES.slice(0, 4).forEach(b => {
    const v = b.trend === 'rising' ? '+' + (Math.round(b.healthHint / 7) + 3) + '.' + (b.healthHint % 10) + '%'
            : b.trend === 'falling' ? '-' + (Math.round(b.closeRisk / 4) + 1) + '.' + (b.closeRisk % 10) + '%'
            : '0.' + (b.healthHint % 9) + '%';
    TICKER.push({ n: b.name, v: v, d: b.trend === 'rising' ? 'up' : b.trend === 'falling' ? 'down' : 'flat' });
  });
  TICKER.push({ n: best.name + ' opportunity', v: best.score + '/100', d: 'up' });
  TICKER.push({ n: worst.name + ' saturation', v: worst.saturation, d: 'down' });
  TICKER.push({ n: DISTRICTS[0].name + ' rent', v: DISTRICTS[0].rent, d: 'flat' });
  TICKER.push({ n: c.name + ' pulse', v: c.pulse + '/100', d: c.pulse >= 80 ? 'up' : 'flat' });
  TICKER.push({ n: 'Permits filed 90d', v: '+' + (18 + (c.rank * 3)), d: 'up' });
  TICKER.push({ n: 'Closures 90d', v: String(6 + (c.rank % 11)), d: 'down' });

  /* scenarios */
  SIM_SCENARIOS = {};
  c.scenarios.forEach(s => {
    SIM_SCENARIOS[s[0]] = chainFor(s[1], { best: best, worst: worst, top: top, risk: risk, city: c.name });
  });

  /* alerts */
  SEED_ALERTS = [
    { sev: 'high', ic: 'alert', title: 'Business risk rising \u2014 ' + risk.name,
      reason: `${risk.signals.nearbyOpenings90d} nearby competitor(s) opened within 90 days while hiring is ${risk.signals.hiringChange90d} and review velocity is ${risk.signals.reviewVelocity}.`,
      rec: `Match opening hours to real demand in ${risk.hood}, launch a loyalty offer, and open rent negotiations before renewal.` },
    { sev: 'med', ic: 'trendDown', title: 'Category pressure \u2014 ' + worst.name,
      reason: `Saturation is ${worst.saturation} at ${worst.rent} with an opportunity score of ${worst.score}. ${worst.note}`,
      rec: `Treat ${worst.name} as a defensive market and redirect new capital toward ${best.name}.` },
    { sev: 'med', ic: 'users', title: 'Expansion window \u2014 ' + best.name,
      reason: `Opportunity score ${best.score}, population ${best.pop}, median income ${best.income}, rent ${best.rent}. ${best.note}`,
      rec: 'Food, fitness and childcare operators should scout leases now, before rents reprice.' },
    { sev: 'low', ic: 'shield', title: 'Strength confirmed \u2014 ' + top.name,
      reason: `Health ${top.healthHint} with ${top.rating}\u2605 across ${top.reviews.toLocaleString()} reviews and foot traffic ${top.signals.footTraffic}.`,
      rec: `${top.name} is the best-positioned operator in ${c.name} to take a second site in ${best.name}.` }
  ];

  /* insights */
  SEED_INSIGHTS = c.insights.slice();
  EXTRA_INSIGHTS = BASE_INSIGHTS.concat([
    `${best.name} scores ${best.score} on opportunity while ${worst.name} scores ${worst.score}; the rent gap between them is the single biggest lever in ${c.name}.`,
    `${top.name} and ${risk.name} sit in the same city with a ${top.healthHint - risk.healthHint} point health gap, and the difference is almost entirely review velocity.`
  ]);

  /* suggestions built from real local names */
  ASK_SUGGESTIONS = [
    `Where should I open a bakery in ${c.name}?`,
    `Is ${best.name} or ${DISTRICTS[1].name} the better bet right now?`,
    `Which businesses in ${c.name} are struggling?`,
    `What is underserved in ${worst.name}?`,
    `Which ${c.name} neighborhoods are changing fastest?`
  ];
  DETECTIVE_SUGGESTIONS = [
    `Why is ${worst.name} underperforming ${best.name}?`,
    `Why is ${risk.name} losing customers?`,
    `Why are rents rising fastest in ${DISTRICTS[0].name}?`,
    `Why did independents cluster in ${best.name} instead of downtown ${c.name}?`
  ];

  return true;
}

setActiveCity(ACTIVE_CITY);

const byId = id => BUSINESSES.find(b => b.id === id);
