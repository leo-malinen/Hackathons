/* ==========================================================================
   The language service: summarise, simplify, explain.

   The rules this file exists to keep, from the product brief:
     - it runs only when somebody asks, never because a page loaded
     - it sends the passage and nothing else, never the page, never the URL
     - it never sends a form value, a password, or a payment field
     - fenced areas need an explicit confirmation before a single word moves
     - every rewrite ships with its original and a note that detail can drop
     - the key lives in this browser, and is never written into the site

   The key is pasted by the person using it and kept in their own browser.
   Nothing here is baked into the source, because a static site hands its
   source to everybody who visits.
   ========================================================================== */

(function () {
  'use strict';

  var STORE = 'acp.lang.v1';
  var ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  var MAX_CHARS = 4000;

  var MODELS = [
    ['anthropic/claude-haiku-4.5', 'Fast and cheap', 'about a third of a penny a rewrite'],
    ['anthropic/claude-sonnet-5', 'Slower and better', 'about four times the price']
  ];

  var state = { key: '', model: MODELS[0][0], spent: 0, calls: 0 };

  try {
    var raw = localStorage.getItem(STORE);
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) { /* storage blocked; the service still works for this visit */ }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* blocked */ }
  }

  /* --- What may never be sent ---------------------------------------------- */

  var FENCE_SELECTOR = '.s-fenced, [data-cp-fence], form, fieldset';
  var FIELD_SELECTOR = 'input, textarea, select, [contenteditable]';

  /* Returns null when the passage is safe, or a reason when it is not. */
  function fenceReason(node) {
    if (!node) return null;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    if (el.closest(FIELD_SELECTOR)) {
      return 'That is something you typed, or a box you are about to type into. ' +
        'The Copilot never reads a form value, so this one cannot be sent at all.';
    }
    var fenced = el.closest(FENCE_SELECTOR);
    if (fenced) {
      return 'This sits in a fenced area: payment, sign-in, legal, medical, or emergency wording, ' +
        'or a form. Rewriting any of it can change what you are agreeing to.';
    }
    return null;
  }

  function hardBlocked(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest(FIELD_SELECTOR));
  }

  /* --- The call ------------------------------------------------------------ */

  function hasKey() { return !!state.key; }

  function ask(system, user, maxTokens) {
    if (!state.key) return Promise.reject(new Error('no key'));
    var body = {
      model: state.model,
      max_tokens: maxTokens || 700,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user.slice(0, MAX_CHARS) }
      ]
    };
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + state.key,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'Accessibility Copilot'
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.error) {
          throw new Error((j.error && j.error.message) || ('The service answered ' + r.status + '.'));
        }
        if (j.usage && typeof j.usage.cost === 'number') {
          state.spent += j.usage.cost;
          state.calls += 1;
          save();
        }
        var text = j.choices && j.choices[0] && j.choices[0].message.content;
        return (text || '').trim();
      });
    });
  }

  /* Models sometimes open with a heading or a preamble however firmly you ask.
     Stripping it here is cheaper than another round trip. */
  function clean(t) {
    return t
      .replace(/^#+\s.*\n+/, '')
      .replace(/^(here('s| is)[^\n:]*:|plain (language|english)( version)?:?)\s*/i, '')
      .replace(/^["“]|["”]$/g, '')
      .trim();
  }

  var PLAIN_RULES =
    'You rewrite web text into plain, clear English for someone who finds the original hard. ' +
    'Keep every fact, every number, every date, and every condition. Change nothing about what it means. ' +
    'Do not add advice, opinion, encouragement, or anything the source does not say. ' +
    'Do not drop a caveat that changes the meaning. Short sentences. Everyday words. ' +
    'Reply with the rewritten text only: no heading, no preamble, no markdown, no quotation marks.';

  var EXPLAIN_RULES =
    'You explain what a passage of web text means, for someone who found it hard to follow. ' +
    'Two or three short sentences. Say only what the passage itself says. ' +
    'Invent no facts and give no advice. If the passage is genuinely ambiguous, say which part and why. ' +
    'Reply with the explanation only: no heading, no preamble, no markdown.';

  var SUMMARY_RULES =
    'You summarise a web page for someone deciding whether to read it. ' +
    'Reply with JSON only, no markdown fence, in this shape: ' +
    '{"points":["..."],"actions":["..."]}. ' +
    'points: three to five short lines, the things the page actually says, in the page\'s own terms. ' +
    'actions: anything the page asks the reader to do or decide, each as a short line. ' +
    'Use an empty array when there are none. Invent nothing.';

  function simplify(text) {
    return ask(PLAIN_RULES, text, 800).then(function (t) {
      return {
        text: clean(t),
        original: text,
        note: 'A rewrite can drop detail. The original is one press away, and it is the one that counts.'
      };
    });
  }

  function explain(text) {
    return ask(EXPLAIN_RULES, text, 400).then(function (t) {
      return {
        text: clean(t),
        original: text,
        note: 'This explains the passage above and nothing else. It is not advice, and the original wording is what binds.'
      };
    });
  }

  function summarise(text) {
    var words = text.trim().split(/\s+/).length;
    var minutes = Math.max(1, Math.round(words / 220));
    return ask(SUMMARY_RULES, text, 700).then(function (t) {
      var data = { points: [], actions: [] };
      try {
        data = JSON.parse(t.replace(/^```(json)?/i, '').replace(/```$/, '').trim());
      } catch (e) {
        data.points = t.split('\n').map(function (l) {
          return l.replace(/^[-*\d.\s]+/, '').trim();
        }).filter(Boolean).slice(0, 5);
      }
      return {
        points: data.points || [],
        actions: data.actions || [],
        minutes: minutes,
        words: words,
        note: 'A summary leaves things out by design. It sits beside the page, never instead of it.'
      };
    });
  }

  /* Page text for a summary: the readable content, with every form value,
     fenced area, and decoration left behind. */
  function pageText(root) {
    root = root || document.querySelector('main') || document.body;
    var out = [];
    root.querySelectorAll('h1, h2, h3, p, li').forEach(function (el) {
      if (el.closest(FENCE_SELECTOR)) return;
      if (el.closest('[aria-hidden="true"], .vh, .cp-panel, nav, footer')) return;
      if (el.querySelector('h1, h2, h3, p, li')) return;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 2) out.push((/^H[123]$/.test(el.tagName) ? '\n## ' : '') + t);
    });
    return out.join('\n').slice(0, MAX_CHARS);
  }

  window.CopilotLanguage = {
    models: MODELS,
    hasKey: hasKey,
    setKey: function (k) { state.key = (k || '').trim(); save(); },
    clearKey: function () { state.key = ''; state.spent = 0; state.calls = 0; save(); },
    getModel: function () { return state.model; },
    setModel: function (m) { state.model = m; save(); },
    spent: function () { return { total: state.spent, calls: state.calls }; },
    fenceReason: fenceReason,
    hardBlocked: hardBlocked,
    simplify: simplify,
    explain: explain,
    summarise: summarise,
    pageText: pageText
  };
})();
