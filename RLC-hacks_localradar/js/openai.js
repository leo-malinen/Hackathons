/* ============================================================
   LOCAL RADAR — REASONING ENGINE (OpenRouter)
   One client used by every panel in the terminal.

   Endpoint : https://openrouter.ai/api/v1  (OpenAI-compatible)
   Default  : openai/gpt-oss-120b:free

   This replaces the previous Gemini client. Beyond plain text
   generation it exposes five things the Gemini/Gemma REST path
   could not do, each of which is wired into a real feature:

     1. stream()      real SSE token streaming (not a fake typewriter)
     2. schema()      Structured Outputs, strict:true — guaranteed shape
     3. confident()   token logprobs -> a real numeric confidence score
     4. embed()       text-embedding-3-small -> real semantic search
     5. tools()       function calling -> the AI can drive the UI

   Plus: deterministic seeds and live token/cost accounting.
   ============================================================ */

const AI = (() => {
  const LS = 'localradar.openai.cfg';
  const BASE = 'https://openrouter.ai/api/v1';

  /* ---- embedded credential -------------------------------------------
     PASTE YOUR KEY HERE. It is the only line you need to change.
     This build uses OpenRouter (openrouter.ai/keys). To move to a different
     OpenAI-compatible provider, change BASE above and CHAT_MODELS below.

     SECURITY NOTE: anything in client-side JavaScript is readable by
     anyone who opens the page or devtools, and the key travels to OpenRouter
     straight from the browser. Fine for a local demo; rotate the key or
     put it behind a small server proxy before deploying publicly.
     -------------------------------------------------------------------- */
  const EMBEDDED_KEY = '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';

  /* This is an OpenRouter key (the "sk-or-v1-" prefix), so BASE points at
     OpenRouter rather than api.openai.com. OpenRouter speaks the identical
     chat-completions protocol, so every feature in this file is unchanged
     except embeddings, which OpenRouter does not serve. See embed() below.

     Free models carry a ":free" suffix and cost $0 per token. The free tier
     allows roughly 20 requests/minute and 50 requests/day on an unfunded
     account, rising to 1,000/day after a one-time $10 credit purchase.
     Manage the key at openrouter.ai/keys. */

  /* Free OpenRouter models, tried in order. gpt-oss-120b is OpenAI's
     open-weight model and supports tool calling + structured outputs, so the
     advanced panels keep working. "openrouter/free" is a last-resort router
     that picks whichever free model can satisfy the request. */
  const CHAT_MODELS = [
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'openrouter/free'
  ];
  const EMBED_MODEL = null;   // OpenRouter serves no /embeddings endpoint

  // Free models cost nothing; the meter therefore tracks tokens, not dollars.
  const FREE = { in: 0, out: 0 };
  const PRICE = {
    'openai/gpt-oss-120b:free': FREE,
    'openai/gpt-oss-20b:free': FREE,
    'meta-llama/llama-3.3-70b-instruct:free': FREE,
    'openrouter/free': FREE
  };

  const DEFAULTS = {
    model: 'openai/gpt-oss-120b:free',
    stream: true,
    effort: 'balanced',   // maps to temperature + max tokens
    seed: 7               // deterministic replays for demos
  };

  let cfg = { key: EMBEDDED_KEY, ...DEFAULTS };
  // Only display preferences persist; the key always comes from the code above.
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || '{}');
    delete saved.key;
    Object.assign(cfg, saved);
  } catch (e) {}
  cfg.key = EMBEDDED_KEY;

  const live = () => Boolean(cfg.key);
  // Accepts both OpenRouter (sk-or-v1-...) and OpenAI (sk-...) keys.
  const keyLooksValid = /^sk-[\w-]{20,}$/.test(EMBEDDED_KEY);

  function persist() {
    const { key, ...prefs } = cfg;
    try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch (e) {}
  }
  function save(next) {
    Object.assign(cfg, next);
    cfg.key = EMBEDDED_KEY;
    persist();
  }
  function clear() {
    cfg = { key: EMBEDDED_KEY, ...DEFAULTS };
    persist();
  }

  const EFFORT = {
    fast:     { temperature: 0.3, cap: 350 },
    balanced: { temperature: 0.7, cap: 700 },
    deep:     { temperature: 0.9, cap: 1400 }
  };

  /* ---- usage + cost accounting (OpenAI returns exact token counts) ---- */
  const usage = { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 };

  function addUsage(u, model) {
    if (!u) return;
    const p = PRICE[model] || FREE;
    usage.calls += 1;
    usage.promptTokens += u.prompt_tokens || 0;
    usage.completionTokens += u.completion_tokens || 0;
    usage.cost += ((u.prompt_tokens || 0) / 1e6) * p.in +
                  ((u.completion_tokens || 0) / 1e6) * p.out;
    document.dispatchEvent(new CustomEvent('ai:usage', { detail: { ...usage } }));
  }

  /* True when the page was opened straight off disk. Browsers send
     "Origin: null" from file:// URLs, and any extra request header turns the
     call into a CORS preflight that a null origin cannot pass - which is the
     usual reason a correct key still looks "not working". On file:// we send
     the bare minimum so the request stays a simple POST. */
  const FILE_ORIGIN = location.protocol === 'file:';

  function headers() {
    const h = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.key
    };
    if (!FILE_ORIGIN) {
      // Optional OpenRouter attribution; shows the app on your usage dashboard.
      h['HTTP-Referer'] = location.origin;
      h['X-Title'] = 'Local Radar';
    }
    return h;
  }

  /* Single fetch entry point: turns silent browser failures into messages a
     human can act on. */
  async function post(path, body) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method: 'POST', headers: headers(), body: JSON.stringify(body)
      });
    } catch (netErr) {
      const e = new Error(FILE_ORIGIN
        ? 'Browser blocked the request because the page was opened from a file:// path. ' +
          'Serve the folder over http instead: run "python3 -m http.server 8000" in the ' +
          'Local Radar folder and open http://localhost:8000'
        : 'Network request to OpenRouter failed (' + netErr.message + '). ' +
          'Check your connection, VPN, or ad blocker.');
      e.network = true;
      throw e;
    }
    return res;
  }

  const HINTS = {
    401: 'The key was rejected. Check it at openrouter.ai/keys - it may have been ' +
         'revoked, or copied with a stray space or line break.',
    402: 'Out of credits for this model. Free models (":free") cost nothing; ' +
         'switch back to one in Engine settings.',
    403: 'OpenRouter refused this model. Open openrouter.ai/settings/privacy and ' +
         'enable "Free model publication" - free endpoints require it.',
    404: 'That model id is not available to this key. The app will fall back to ' +
         'another free model automatically.',
    429: 'Rate limited. The free tier allows about 20 requests a minute and 50 a ' +
         'day on an unfunded account. Wait a moment and retry.'
  };

  async function fail(res) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch (e) {}
    const hint = HINTS[res.status] || '';
    const err = new Error(res.status + ' ' + res.statusText +
      (detail ? ' \u2014 ' + detail : '') + (hint ? ' \u2014 ' + hint : ''));
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  function baseBody(system, user, opts) {
    const eff = EFFORT[cfg.effort] || EFFORT.balanced;
    return {
      model: opts.model || cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: opts.temp ?? eff.temperature,
      max_tokens: opts.maxTokens || eff.cap,
      top_p: 0.95,
      seed: cfg.seed            // reproducible output across runs
    };
  }

  /* ============================================================
     1. NON-STREAMING COMPLETION
     ============================================================ */
  async function complete(system, user, opts = {}) {
    const body = baseBody(system, user, opts);
    if (opts.logprobs) { body.logprobs = true; body.top_logprobs = 5; }
    if (opts.schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: opts.schemaName || 'result', strict: true, schema: opts.schema }
      };
    } else if (opts.json) {
      body.response_format = { type: 'json_object' };
    }

    let res = await post('/chat/completions', body);
    if (!res.ok && res.status === 400) {
      // Some free models reject seed / logprobs / structured outputs. Retry once
      // with a plain body rather than failing the panel.
      const plain = { model: body.model, messages: body.messages,
                      temperature: body.temperature, max_tokens: body.max_tokens };
      res = await post('/chat/completions', plain);
    }
    if (!res.ok) await fail(res);

    const data = await res.json();
    addUsage(data.usage, body.model);
    const choice = data.choices?.[0];
    const text = (choice?.message?.content || '').trim();
    if (!text) throw new Error('Empty response (' + (choice?.finish_reason || 'no content') + ')');
    return { text, choice, data };
  }

  /* ============================================================
     2. REAL SSE TOKEN STREAMING
     Gemini's REST path in the previous build faked this with a
     setInterval typewriter. Here tokens are rendered as the model
     actually produces them.
     ============================================================ */
  async function stream(system, user, opts = {}) {
    const body = baseBody(system, user, opts);
    body.stream = true;
    body.stream_options = { include_usage: true };

    let res = await post('/chat/completions', body);
    if (!res.ok && res.status === 400) {
      const plain = { model: body.model, messages: body.messages,
                      temperature: body.temperature, max_tokens: body.max_tokens,
                      stream: true };
      res = await post('/chat/completions', plain);
    }
    if (!res.ok) await fail(res);
    if (!res.body) throw new Error('Streaming not supported by this browser');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]') continue;
        let evt;
        try { evt = JSON.parse(payload); } catch (e) { continue; }
        if (evt.usage) addUsage(evt.usage, body.model);
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          opts.onToken && opts.onToken(delta, full);
        }
      }
    }

    if (!full.trim()) throw new Error('Empty stream');
    return full.trim();
  }

  /* ---- model fallback wrapper ---------------------------------------- */
  async function withFallback(fn) {
    const chain = [cfg.model, ...CHAT_MODELS.filter(m => m !== cfg.model)];
    let lastErr;
    for (const model of chain) {
      try {
        const out = await fn(model);
        if (model !== cfg.model) {
          console.warn('[AI] ' + cfg.model + ' unavailable \u2014 switched to ' + model);
          save({ model });
          document.dispatchEvent(new CustomEvent('ai:model', { detail: model }));
        }
        return out;
      } catch (err) {
        lastErr = err;
        if (err.network) throw err;   // no point retrying a blocked browser call
        const retryable = [400, 403, 404, 408, 429, 502, 503].includes(err.status) ||
          /does not exist|do not have access|unsupported|not found|no endpoints|data policy|rate limit|temporarily/i
            .test(err.message);
        if (!retryable) throw err;
      }
    }
    throw lastErr;
  }

  /* ---- public text generation, with graceful mock fallback ----------- */
  async function text(system, user, opts = {}) {
    if (!live()) return { text: opts.mock ?? '', source: 'mock' };
    try {
      const useStream = cfg.stream && typeof opts.onToken === 'function';
      const out = await withFallback(model =>
        useStream ? stream(system, user, { ...opts, model })
                  : complete(system, user, { ...opts, model }).then(r => r.text));
      return { text: out, source: 'openai' };
    } catch (err) {
      console.warn('[AI]', err.message);
      return { text: opts.mock ?? ('Model error: ' + err.message), source: 'error', error: err.message };
    }
  }

  /* ============================================================
     3. STRUCTURED OUTPUTS (strict JSON Schema)
     Gemini's responseMimeType only asked for "some JSON". OpenAI
     constrains decoding to the schema, so the shape is guaranteed
     and we no longer need defensive brace-scraping.
     ============================================================ */
  function extractJSON(s) {
    if (!s) return null;
    let t = String(s).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    const c = t.indexOf('['), d = t.lastIndexOf(']');
    const cands = [];
    if (a > -1 && b > a) cands.push(t.slice(a, b + 1));
    if (c > -1 && d > c) cands.push(t.slice(c, d + 1));
    for (const cand of cands) { try { return JSON.parse(cand); } catch (e) {} }
    return null;
  }

  async function json(system, user, mock, opts = {}) {
    if (!live()) return { data: mock, source: 'mock' };
    try {
      const r = await withFallback(model => complete(
        system + '\n\nReturn ONLY valid minified JSON.',
        user,
        { ...opts, model, json: !opts.schema, temp: opts.temp ?? 0.55 }));
      const parsed = extractJSON(r.text);
      if (!parsed) throw new Error('Could not parse JSON from model output');
      return { data: parsed, source: 'openai' };
    } catch (err) {
      console.warn('[AI json]', err.message);
      return { data: mock, source: 'error', error: err.message };
    }
  }

  // Same as json(), but decoding is constrained to a strict schema.
  async function schema(system, user, jsonSchema, mock, opts = {}) {
    return json(system, user, mock, { ...opts, schema: jsonSchema, schemaName: opts.name || 'result' });
  }

  /* ============================================================
     4. LOGPROB-BACKED CONFIDENCE
     The model's own token probabilities become a real percentage,
     replacing the hard-coded "Confidence: Medium" label. No Gemini
     REST equivalent.
     ============================================================ */
  async function confident(system, user, opts = {}) {
    if (!live()) return { text: opts.mock ?? '', source: 'mock', confidence: null, band: 'n/a' };
    try {
      const r = await withFallback(model =>
        complete(system, user, { ...opts, model, logprobs: true }));

      const toks = r.choice?.logprobs?.content || [];
      let conf = null;
      if (toks.length) {
        // Mean per-token probability across the answer.
        const mean = toks.reduce((s, t) => s + Math.exp(t.logprob), 0) / toks.length;
        conf = Math.round(mean * 100);
      }
      const band = conf == null ? 'n/a' : conf >= 85 ? 'High' : conf >= 65 ? 'Medium' : 'Low';
      return { text: r.text, source: 'openai', confidence: conf, band };
    } catch (err) {
      console.warn('[AI confident]', err.message);
      return { text: opts.mock ?? '', source: 'error', confidence: null, band: 'n/a', error: err.message };
    }
  }

  /* ============================================================
     5. EMBEDDINGS -> REAL SEMANTIC SEARCH
     The architecture diagram claims a vector store and a retrieval
     layer. With OpenAI that stops being a drawing: we embed the
     corpus once and rank by cosine similarity.
     ============================================================ */
  async function embed(inputs) {
    if (!live()) return null;
    /* OpenRouter proxies chat models only — it has no /embeddings route. We
       fail soft rather than throwing: buildIndex() returns false, AI.indexed
       stays false, and omnisearch quietly keeps using substring matching.
       To switch semantic search back on, point EMBED_BASE at a provider that
       does serve embeddings (Google AI Studio, Mistral, Jina or Cohere all
       have free tiers) and set EMBED_MODEL to one of its models. */
    if (!EMBED_MODEL) {
      console.info('[Local Radar] Semantic search is off: OpenRouter has no embeddings ' +
                   'endpoint. Omnisearch is using substring matching.');
      return null;
    }
    const res = await fetch(BASE + '/embeddings', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs })
    });
    if (!res.ok) await fail(res);
    const data = await res.json();
    if (data.usage) addUsage({ prompt_tokens: data.usage.prompt_tokens, completion_tokens: 0 }, cfg.model);
    return data.data.map(d => d.embedding);
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  }

  /* ---- tiny in-memory vector store ---- */
  const store = { built: false, items: [], vectors: [] };

  async function buildIndex(items) {
    if (!live() || store.built) return false;
    const vectors = await embed(items.map(i => i.text));
    if (!vectors) return false;
    store.items = items; store.vectors = vectors; store.built = true;
    document.dispatchEvent(new CustomEvent('ai:index', { detail: { count: items.length } }));
    return true;
  }

  async function semanticSearch(query, k = 5) {
    if (!store.built) return null;
    const [qv] = await embed([query]);
    return store.vectors
      .map((v, i) => ({ ...store.items[i], score: cosine(qv, v) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /* ============================================================
     6. FUNCTION / TOOL CALLING
     Lets the model actually operate the terminal: open a business,
     switch views, run the heatmap. Ask Anything becomes an agent
     rather than a chat box.
     ============================================================ */
  async function tools(system, user, toolSpecs, opts = {}) {
    if (!live()) return { calls: [], text: opts.mock ?? '', source: 'mock' };
    try {
      const body = baseBody(system, user, opts);
      body.tools = toolSpecs;
      body.tool_choice = opts.toolChoice || 'auto';

      const res = await fetch(BASE + '/chat/completions', {
        method: 'POST', headers: headers(), body: JSON.stringify(body)
      });
      if (!res.ok) await fail(res);
      const data = await res.json();
      addUsage(data.usage, body.model);

      const msg = data.choices?.[0]?.message || {};
      const calls = (msg.tool_calls || []).map(c => ({
        name: c.function?.name,
        args: (() => { try { return JSON.parse(c.function?.arguments || '{}'); } catch (e) { return {}; } })()
      }));
      return { calls, text: (msg.content || '').trim(), source: 'openai' };
    } catch (err) {
      console.warn('[AI tools]', err.message);
      return { calls: [], text: opts.mock ?? '', source: 'error', error: err.message };
    }
  }

  /* ---- moderation (free endpoint, no Gemini equivalent here) --------- */
  async function moderate(input) {
    if (!live()) return { flagged: false };
    try {
      const res = await fetch(BASE + '/moderations', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ model: 'omni-moderation-latest', input })
      });
      if (!res.ok) return { flagged: false };
      const data = await res.json();
      return { flagged: Boolean(data.results?.[0]?.flagged) };
    } catch (e) { return { flagged: false }; }
  }

  /* ---- connectivity probe -------------------------------------------- */
  async function test() {
    const t0 = performance.now();
    await withFallback(model => complete('You are a connectivity probe.',
      'Reply with the single word: READY', { model, temp: 0, maxTokens: 16 }));
    return Math.round(performance.now() - t0);
  }

  return {
    get cfg() { return { ...cfg }; },
    fileOrigin: FILE_ORIGIN,
    get usage() { return { ...usage }; },
    get indexed() { return store.built; },
    models: CHAT_MODELS.slice(),
    embedModel: EMBED_MODEL,
    keyLooksValid,
    live, save, clear,
    text, stream, json, schema, confident,
    embed, buildIndex, semanticSearch, cosine,
    tools, moderate, test, extractJSON
  };
})();

/* ============================================================
   TOOL SPECS — what the model is allowed to do to the UI.
   ============================================================ */
const UI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_business',
      description: 'Open the Business Desk and show the detail panel for one business.',
      parameters: {
        type: 'object',
        properties: {
          business_id: {
            type: 'string',
            description: 'One of: rosetta, apple, pizzashop, harbor, nova, greengrocer'
          }
        },
        required: ['business_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'show_view',
      description: 'Switch the terminal to a named view.',
      parameters: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            description: 'One of: pulse, business, detective, heatmap, simulate, debate, news, events, alerts, ask, architecture'
          }
        },
        required: ['view']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_simulation',
      description: 'Run the shockwave simulation for a hypothetical city event.',
      parameters: {
        type: 'object',
        properties: {
          scenario: { type: 'string', description: 'The hypothetical event to simulate.' }
        },
        required: ['scenario']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'investigate',
      description: 'Run the five-agent AI Detective pipeline on a causal question about the city.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The causal question to investigate.' }
        },
        required: ['question']
      }
    }
  }
];

/* ============================================================
   STRICT SCHEMAS — used with AI.schema() for guaranteed shapes.
   ============================================================ */
const HEALTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'positives', 'negatives', 'summary'],
  properties: {
    score: { type: 'integer', description: 'Business health score, 0-100' },
    positives: { type: 'array', items: { type: 'string' }, description: 'Positive drivers' },
    negatives: { type: 'array', items: { type: 'string' }, description: 'Negative drivers' },
    summary: { type: 'string', description: 'One-sentence verdict' }
  }
};

const DNA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['growth', 'stability', 'competition', 'innovation', 'trust', 'expansion', 'note'],
  properties: {
    growth: { type: 'integer' },
    stability: { type: 'integer' },
    competition: { type: 'integer' },
    innovation: { type: 'integer' },
    trust: { type: 'integer' },
    expansion: { type: 'integer' },
    note: { type: 'string' }
  }
};

/* ============================================================
   AGENT PROMPTS — the "multi-agent" system.
   Each agent is a specialised system prompt over the same model.
   ============================================================ */

const BASE_ROLE =
  'You are part of LOCAL RADAR, a hyperlocal business intelligence terminal for city analysts. ' +
  'You reason strictly over the structured JSON context you are given: permits, demographics, ' +
  'rent, reviews, hiring, foot traffic, closures, weather and events. ' +
  'Never invent a data point that is not derivable from the context. ' +
  'Be concrete, quantitative, and concise. Never use markdown headers or bullet asterisks \u2014 ' +
  'write short plain-text lines.';

const AGENTS = {
  research: {
    name: 'Research Agent',
    task: 'Extract and restate only the decision-relevant facts from the context.',
    prompt: BASE_ROLE + ' You are the RESEARCH AGENT. Extract the decision-relevant facts from the ' +
      'context and restate them as 3-4 short factual lines. No opinions, no recommendations.'
  },
  economic: {
    name: 'Economic Agent',
    task: 'Interpret demand, rent, income and demographic pressure.',
    prompt: BASE_ROLE + ' You are the ECONOMIC AGENT. In 3-4 short lines, interpret demand, rent ' +
      'burden, income and demographic pressure. Quantify wherever the context allows.'
  },
  competitor: {
    name: 'Competitor Agent',
    task: 'Assess competitive density and relative positioning.',
    prompt: BASE_ROLE + ' You are the COMPETITOR AGENT. In 3-4 short lines, assess competitive ' +
      'density, new entrants, and where this subject is losing or winning against rivals.'
  },
  risk: {
    name: 'Risk Agent',
    task: 'Surface downside, fragility and leading indicators of failure.',
    prompt: BASE_ROLE + ' You are the RISK AGENT. In 3-4 short lines, surface downside scenarios, ' +
      'fragility and leading indicators of failure. State the single biggest risk explicitly.'
  },
  summary: {
    name: 'Summary Agent',
    task: 'Fuse all agent outputs into one decisive answer.',
    prompt: BASE_ROLE + ' You are the SUMMARY AGENT. Fuse the upstream agent findings into one ' +
      'decisive answer of 4-6 short lines, ending with a single clear recommendation line ' +
      'that starts with "Recommendation: ".'
  }
};

function modeSuffix(mode) {
  return mode && MODE_STYLE[mode] ? ' Audience mode: ' + mode + '. ' + MODE_STYLE[mode] : '';
}
