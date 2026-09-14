# Reality Check

**Don't just believe it. Check it.**

Paste a claim, a link, or a screenshot. Reality Check breaks it into separate
checkable statements, searches five real databases for evidence for *and*
against each one, scores how trustworthy the sources are, and shows you the
evidence before it shows you a verdict.

It answers with one of six verdicts, not just true or false:

`SUPPORTED` · `PARTIALLY SUPPORTED` · `MISLEADING` · `CONTRADICTED` ·
`INCONCLUSIVE` · `NOT CHECKABLE`

There's also a **Prove Me Wrong** button, which makes it go looking for
evidence that would overturn its own answer.

---

## What you need

- **Python 3.11 or newer**
- **Node.js 20 or newer**
- **An OpenRouter API key** — free at [openrouter.ai/keys](https://openrouter.ai/keys)

That's it. The five evidence sources (OpenAlex, Europe PMC, Crossref,
Wikipedia, DuckDuckGo) are all free and need no keys.

---

## Setup

**1. Install everything**

```powershell
.\scripts\setup.ps1
```

On macOS or Linux: `./scripts/setup.sh`

This creates a Python virtual environment, installs both sets of dependencies,
and copies `.env.example` to `.env`. It takes a couple of minutes.

**2. Add your API key**

Open `.env` and fill in the first line:

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

**3. Start it**

```powershell
.\scripts\dev.ps1
```

On macOS or Linux: `./scripts/dev.sh`

Then open **http://localhost:3000**.

You should see a green **online** dot in the top right. If it's red, the API
key is missing or wrong.

Press `Ctrl+C` in the terminal to stop both servers.

---

## Try it

Paste any of these into the box and hit **Analyze**:

| Claim | What you should get |
|---|---|
| Humans only use 10% of their brains. | CONTRADICTED |
| Eating carrots dramatically improves your night vision. | MISLEADING |
| Scientists have proven coffee increases lifespan by 20%. | MISLEADING |
| Honestly, this is the worst AI product ever made. | NOT CHECKABLE (it's an opinion) |

A run takes 30 to 140 seconds depending on the depth setting. The timeline
shows you what it's doing while it works.

There are three depth settings above the input box:

- **Quick** — 1 claim, fastest, good for testing
- **Standard** — 2 claims, the default
- **Deep** — 3 claims, most thorough

---

## Save runs for offline demos

The free API tier only allows **50 requests per day**, and one investigation
uses several. So you can record a real run and replay it later with **no API
calls at all** — useful if you're demoing and don't want to depend on the
internet.

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.capture --all       # record the whole demo set
.\.venv\Scripts\python.exe -m app.capture --list      # see what you've saved
```

To record one specific claim, including its Prove Me Wrong round:

```powershell
.\.venv\Scripts\python.exe -m app.capture "your claim here" --slug myclaim --challenge
```

Saved runs show up as green buttons above the input box. Clicking one replays
the real investigation — same sources, same scores, same verdict — and the page
labels it as a replay so nobody is misled.

**Record these before demo day.**

---

## Settings

Everything lives in `.env`. The ones you might actually change:

| Setting | What it does |
|---|---|
| `OPENROUTER_API_KEY` | Your key. Required. |
| `MODEL_REASONING` | Which AI model to use. Default is a free one. |
| `MAX_SOURCES_PER_CLAIM` | How many sources to examine per claim (default 14) |
| `RETRIEVAL_CONTACT_EMAIL` | Your email, so the research databases know who's asking |

If you add credits to OpenRouter, you can point `MODEL_REASONING` at a stronger
model for better results on the tricky "misleading" cases.

---

## If something goes wrong

**"Model quota reached"**
You've used your 50 free requests for the day. Wait for the reset (midnight
UTC), or add $10 of credits at
[openrouter.ai/credits](https://openrouter.ai/credits) to get 1000 per day.
Saved replays keep working either way.

**The red dot / "no key"**
`.env` is missing `OPENROUTER_API_KEY`, or the key has a typo. Restart after
fixing it.

**"Port already in use"**
Something else is on 3000 or 8000. Either close it, or run
`.\scripts\dev.ps1 -WebPort 3001`.

**SSL or certificate errors**
Usually corporate antivirus or a VPN intercepting HTTPS. The app already
handles this by using your operating system's certificate store, but if it
persists, try without the VPN.

**It says INCONCLUSIVE a lot**
That's often the honest answer for vague claims. Try a more specific one —
claims with a number, a date, or a named study give it more to work with.

---

## Running the tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

45 tests covering the parts that have to be right no matter what the AI says:
source scoring, duplicate detection, verdict maths, and the defences against
web pages that try to manipulate the system.

---

## Where things are

```
reality-check/
├── backend/          Python API, the AI agents, and the scoring logic
├── frontend/         The web interface
├── scripts/          setup and dev scripts
└── docs/
    ├── ABOUT.md          project write-up
    ├── ARCHITECTURE.md   how it works and why it's built this way
    └── DEMO.md           a 2-3 minute demo script
```

---

## A note on what this is and isn't

Reality Check evaluates **claims, not people**. It doesn't decide absolute
truth — it assesses the evidence it managed to find, which is why it always
shows you that evidence. When the evidence is thin, it says so instead of
guessing.

It is not a substitute for journalism, peer review, or medical, legal or
financial advice.

---

MIT licence.
