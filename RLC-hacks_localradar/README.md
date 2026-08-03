# Local Radar

**A Bloomberg Terminal for your city.** Instead of tracking companies, Local Radar
continuously answers the questions a city analyst actually asks: which businesses
are about to become popular, which neighborhoods are growing, where to open a
restaurant, who is hiring, who is expanding, and who is quietly failing.

Plain **HTML, CSS and JavaScript**. No build step, no framework, no dependencies.
Open `index.html` in a browser.

---

## 1. The key

A working **OpenRouter** key is already embedded in `js/openai.js`, so the app is
live the moment you open `index.html`. To swap it, change the one constant at the
top of that file:

```js
const EMBEDDED_KEY = 'sk-or-v1-...';
```

Manage keys at **openrouter.ai/keys**. Free models carry a `:free` suffix and cost
$0 per token; the free tier allows roughly 20 requests/minute and 50 requests/day
on an unfunded account, rising to 1,000/day after a one-time $10 credit purchase.

The status pill at the bottom of the sidebar tells you what happened, and clicking
it opens Engine settings (the old top-right key button has been removed):

| Pill | Meaning |
|---|---|
| `OpenRouter live · gpt-oss-120b:free · 420 ms` | Key accepted, round-trip time measured |
| `Engine error · key rejected` | Refused — check the browser console for the exact message |
| `Mock engine · no key in js/openai.js` | No key set; deterministic demo data |

### Using a different provider

The client speaks the standard OpenAI chat-completions protocol, so any
OpenAI-compatible provider works by changing two things: `BASE` and `CHAT_MODELS`.

| Provider | `BASE` |
|---|---|
| OpenRouter (current) | `https://openrouter.ai/api/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Cerebras | `https://api.cerebras.ai/v1` |

If a call ever fails the app silently falls back to the mock engine, so a demo
never dies on stage.

> **Security:** a key in client-side JavaScript is readable by anyone who opens
> the page or devtools. Fine for a local demo. Rotate the key or put it behind a
> small server proxy before deploying publicly.

---

## 2. What OpenAI unlocks that the Gemini/Gemma REST path could not

These are not cosmetic — each one replaces something that was previously faked.

### Real token streaming
The old client rendered a `setInterval` typewriter over an already-complete
response. `AI.stream()` now parses server-sent events and paints tokens as the
model produces them. Used by the Detective pipeline and Ask Anything.

### Structured Outputs (`strict: true`)
Gemini's `responseMimeType` asked for "some JSON". OpenAI constrains decoding to
a JSON Schema, so the shape is *guaranteed*. See `HEALTH_SCHEMA` and `DNA_SCHEMA`,
used through `AI.schema()`. No more defensive brace-scraping.

### Logprob-backed confidence
The forecast panel used to print a hard-coded "Confidence: Medium". It now sends
`logprobs: true`, averages `exp(logprob)` across the generated answer, and shows a
real percentage with a High / Medium / Low band. This is the model's own
uncertainty, not a label.

### Embeddings → a real retrieval layer *(currently inactive)*
The code embeds the business and district corpus on startup and ranks omnisearch
by cosine similarity, labelling each hit with its score. **OpenRouter does not
serve an `/embeddings` endpoint**, so this fails soft: `AI.indexed` stays false
and omnisearch falls back to substring matching. No errors, no broken UI.

To switch it on, set `EMBED_MODEL` in `js/openai.js` and point the embedding call
at a provider that serves them — Google AI Studio, Mistral, Jina and Cohere all
have free embedding tiers.

### Function calling → the AI drives the UI
Ask Anything is no longer a chat box. Four tools are exposed — `open_business`,
`show_view`, `run_simulation`, `investigate` — so "show me the riskiest business"
actually navigates the terminal instead of describing it.

### Deterministic replay and cost accounting
Every request pins `seed`, so the same demo question produces the same answer
twice in a row. OpenAI returns exact token counts (including on streamed calls via
`stream_options`), which drive the live **calls / tokens / est. cost** meter in
Engine settings.

Also available: `AI.moderate()` against the free `omni-moderation-latest` endpoint.

---

## 3. Models

Default is `openai/gpt-oss-120b:free` — OpenAI's open-weight model, which supports
tool calling and structured outputs, so the advanced panels keep working. If it is
rate-limited or unavailable the client walks the chain
`gpt-oss-120b:free → gpt-oss-20b:free → llama-3.3-70b:free → openrouter/free`
and remembers whichever answered.

Because free models cost nothing, the usage meter tracks calls and tokens with an
estimated cost of $0.00.

**Reasoning depth** maps to sampling settings:

| Depth | Temperature | Max tokens |
|---|---|---|
| Fast | 0.3 | 350 |
| Balanced | 0.7 | 700 |
| Deep | 0.9 | 1400 |

---

## 4. Views

| View | What it does |
|---|---|
| **City Pulse** | Daily city score, six live indicators, explain-like-I'm-five modes |
| **Business Desk** | Health Score, Business DNA radar, closure forecast, memory timeline, competitor simulator |
| **AI Detective** | Five-agent pipeline: Research → Economic → Competitor → Risk → Summary |
| **Opportunity Map** | Interactive heatmap — great opportunity / saturated / avoid |
| **Shockwave Sim** | "What if Costco opens here?" animated chain reaction |
| **AI Debate** | Agent A argues yes, Agent B argues no, a third returns the verdict |
| **News Fusion** | Headline → which business categories it will hit |
| **Event Intel** | Local events and their measured effect on trade |
| **AI Alerts** | Generated risk alerts with reason and recommendation |
| **Ask Anything** | Agentic chat that can operate the terminal |
| **Architecture** | The reasoning pipeline, and the live client code |

---

## 5. Theme

Ported from the **MaterialM** Tailwind admin template into plain CSS — same
tokens, same 24px cards, same `#00a1ff` primary, same Inter type. Light by
default; the moon button toggles MaterialM's dark ramp and the choice persists.
Canvas charts repaint on theme change.

---

## 6. Files

```
index.html        markup for all eleven views
styles.css        MaterialM theme, light + dark
js/openai.js      the OpenAI client + agent prompts + tool specs + schemas
js/data.js        the synthetic city: businesses, districts, news, events
js/icons.js       inline lucide-style icon set
js/charts.js      hand-drawn canvas gauge, radar, heatmap, shockwave
js/app.js         views, rendering, state, tool execution
```

---

## 7. Demo story

1. A bakery owner wants to expand. Search **Rosetta Bakery**.
2. Generate the **Health Score** — 91, with the reasons that produced it.
3. Read the **Business DNA** radar: trust 96, competition 61.
4. Ask: *"Where should they open a second location?"*
5. Open the **Opportunity Map** — Willow Glen and North San Jose light up.
6. **Simulate** a competitor opening next door.
7. Run the **AI Debate** on whether to expand now.
8. Ask Anything for the executive summary.

## Cities

Local Radar ships with **20 real U.S. cities**, ranked by city-proper population
(U.S. Census Bureau estimates for July 1, 2025).

**Top 10:** New York NY, Los Angeles CA, Chicago IL, Houston TX, Phoenix AZ,
Philadelphia PA, San Antonio TX, San Diego CA, Dallas TX, Jacksonville FL.

**11-20:** Fort Worth TX, Austin TX, San Jose CA, Columbus OH, Charlotte NC,
Indianapolis IN, San Francisco CA, Seattle WA, Denver CO, Nashville TN.

Each city carries 8 real neighborhoods, 6 real businesses (with real addresses,
categories and neighborhoods), 2 real news anchors, 2 real recurring events,
4 simulation scenarios and 3 city-specific insights.

The city files are:

- `js/cities.js`   - ranks 1-10 (`const CITY_DATA = { ... }`)
- `js/cities-b.js` - ranks 11-15 (`Object.assign(CITY_DATA, { ... })`)
- `js/cities-c.js` - ranks 16-20 (`Object.assign(CITY_DATA, { ... })`)

`js/data.js` hydrates whatever is in `CITY_DATA`: it derives health signals, the
six-axis Business DNA, the Jan/Mar/May/Jul memory timeline, the ticker, pulse
indicators, alerts and chain-reaction steps. Derivation is seeded from the
record itself, so the same city always produces the same numbers.

### Adding a 21st city

Append one entry to any of the city files:

```js
Object.assign(CITY_DATA, {
  'oklahoma-city': {
    rank: 21, name: 'Oklahoma City', state: 'OK', pop: 712919, pulse: 80,
    stats: [ ['Economy', 84, 'up', 'green'], /* 6 tuples */ ],
    districts: [ { id, name, x, y, w, h, pop, income, rent, score, sat, note }, /* x8 */ ],
    businesses: [ { id, name, emoji, category, hood, addr, rating, reviews,
                    employees, priceTier, trend, health, closeRisk,
                    comp: [ ['Rival', 'strength|strength'] ] }, /* x6 */ ],
    news: [ { title, src, kind, affected: [ ['Label', 31, 'up'] ] }, /* x2 */ ],
    events: [ { name, when, attendance, effects: [ ['Label', '+45%', 'up'] ] }, /* x2 */ ],
    scenarios: [ ['Costco opens in Bricktown', 'bigbox'] /* 4 */ ],
    insights: [ 'three strings' ]
  }
});
```

Then add one `<option value="oklahoma-city">` to `#citySelect` in `index.html`.
District rectangles live on a 9x6 grid; overlapping rectangles are
automatically re-packed at runtime, so approximate coordinates are fine.

### Accuracy note

Neighborhoods, businesses, addresses, venues and news anchors are real. Health
scores, DNA axes, forecasts, timelines and foot-traffic signals are
**deterministic simulations** derived from those records - Local Radar is not
wired to a live municipal data feed.

## Running it so the API key actually works

The OpenRouter key is already embedded in `js/openai.js` (`EMBEDDED_KEY`, line 35).
Nothing to paste, nothing to configure.

**But you must open the app over http, not by double-clicking `index.html`.**
A page loaded from a `file://` path sends `Origin: null`, and the browser blocks
the call to OpenRouter before it ever leaves your machine. The key looks broken
when the real problem is the page's origin.

```bash
cd local-radar
python3 -m http.server 8000
# then open http://localhost:8000
```

On macOS you can double-click `start-server.command` instead (run
`chmod +x start-server.command` once if it will not launch).

The status chip in the bottom-left corner tells you exactly where you stand:

| Chip | Meaning |
| --- | --- |
| `OpenRouter live` | Key accepted, model responding, latency shown |
| `Open over http` | Page is on `file://` - start the local server |
| `Engine error - HTTP 401` | Key revoked or mistyped, check openrouter.ai/keys |
| `Engine error - HTTP 403` | Enable "Free model publication" at openrouter.ai/settings/privacy |
| `Engine error - HTTP 429` | Free-tier rate limit, wait and retry |
| `Engine error - offline` | No network reached OpenRouter |

Hover the chip to see the full error text.

### Free-tier notes

- Free models carry a `:free` suffix and cost nothing.
- An unfunded account gets roughly 20 requests/minute and 50 requests/day;
  a one-time $10 credit purchase raises the daily cap to 1,000.
- Free endpoints require **Free model publication** to be enabled under
  openrouter.ai/settings/privacy, otherwise every free model returns 403.
- If a model is unavailable the app steps down the chain automatically:
  `openai/gpt-oss-120b:free` -> `openai/gpt-oss-20b:free` ->
  `meta-llama/llama-3.3-70b-instruct:free` -> `openrouter/free`.
- Requests that a free model rejects (seed, logprobs, strict JSON schema) are
  retried once with a plain body instead of failing the panel.
- OpenRouter serves no `/embeddings` endpoint, so semantic omnisearch falls back
  to substring matching. Everything else is live.

**Security:** a key in client-side JavaScript is readable by anyone who opens
devtools. Rotate this one before putting the site anywhere public, or move the
call behind a small server proxy.
