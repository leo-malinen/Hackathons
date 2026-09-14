## Inspiration

Ask any AI assistant whether a claim is true and it will tell you. Confidently,
in one paragraph, with no sources, and in exactly the same tone whether it is
certain or guessing.

That is the wrong shape for this problem. The hard part was never producing a
verdict, it was inspecting the evidence behind one. And the claims that
actually spread online are rarely false in a way a TRUE/FALSE checker catches.
They are true-ish. They take a real study and stretch it.

My test case became this sentence:

> *"Scientists have proven that drinking coffee increases lifespan by 20%."*

There is real research here. Large cohort studies do find lower mortality among
coffee drinkers. But "17% lower mortality risk" is not "20% longer lifespan",
an association is not proof, and a binary checker has nowhere to put that
distinction. It has to answer TRUE or FALSE, and both answers are wrong.

I wanted to build the thing that gets that case right.

## What it does

You give Reality Check a claim, an article URL, or a screenshot. It runs a
structured investigation and shows you the whole thing while it happens.

- **Splits content into atomic claims.** One viral sentence usually contains
  three or four separately checkable assertions. Opinions get separated out
  rather than forced into a verdict.
- **Sends two agents searching in opposite directions.** A Researcher looks for
  evidence. A Skeptic looks specifically for evidence *against*, using the
  vocabulary of disagreement: "failed to replicate", "no association",
  "overstated". They run at the same time, so confirmation bias never gets
  baked into retrieval.
- **Retrieves from five real sources** — OpenAlex, Europe PMC, Crossref,
  Wikipedia and the open web. Around 80 to 110 documents per claim, filtered to
  the strongest dozen.
- **Detects source independence.** Ten articles about one study are one piece
  of evidence, not ten. Documents are clustered by shared DOI, citation chains,
  overlapping reference lists, duplicate titles and publisher.
- **Scores every source on five axes** — authority, evidence quality,
  relevance, recency, independence. Only relevance comes from a model; the rest
  is computed from metadata, so a persuasive page cannot talk its own score up.
- **Returns one of six verdicts**, not two: SUPPORTED, PARTIALLY SUPPORTED,
  MISLEADING, CONTRADICTED, INCONCLUSIVE, NOT CHECKABLE.
- **Draws an interactive evidence graph** — claim at the top, evidence grouped
  by what it does to that claim, verdict at the bottom. Every node opens.
- **Attacks its own verdict.** Press **Prove Me Wrong** and the system builds
  the strongest case that it is wrong, runs a fresh adversarial search for
  evidence that would overturn it, and revises if the evidence warrants it.

Two real runs:

| Claim | Verdict | Confidence | Time |
|---|---|---|---|
| *"Humans only use 10% of their brains"* | CONTRADICTED | 67% | 29s |
| *"Scientists have proven coffee increases lifespan by 20%"* | MISLEADING | — | 137s |

On the brain claim it noted, unprompted, that widespread imaging activity does
not mean every neuron fires at once, and that the evidence rejects the 10%
figure without establishing an alternative one.

## How I built it

**Frontend** — Next.js 16, React 19, TypeScript, Tailwind CSS, and
`@xyflow/react` for the evidence graph. The investigation streams over
server-sent events, so the timeline fills in as the work happens instead of
spinning and then producing an answer from nowhere.

**Backend** — Python, FastAPI, Pydantic v2, async SQLAlchemy over SQLite. Seven
specialised agents, each constrained to a strict JSON schema: Claim Extractor,
Normalizer, Search Planner, Source Critic, Reasoner, Devil's Advocate, Editor.

**Evidence** — five providers, all free and **all keyless**. That was
deliberate. The scholarly APIs give structured metadata a scraped search page
cannot: DOIs, dates, citation counts, peer-review status, and in OpenAlex's
case the reference list itself. That last field is what makes real independence
detection possible, because you cannot spot a citation chain in a search
snippet.

The decision that shaped everything: **the model does not decide the verdict.**
A language model asked "how confident are you" produces a number shaped by
tone, not evidence — confidence tracks how fluent the sources sound rather than
how much they weigh. So verdict and confidence are arithmetic, computed from
evidence mass, source quality and independence. The Reasoner may move that
verdict by one step, and only with a stated reason.

## Challenges I ran into

**The coffee claim came back INCONCLUSIVE.** Every retrieved study landed as
CONTEXTUALIZES. Each was true, none directly refuted the sentence, so decisive
evidence mass was zero and the engine said "nothing settles this" — technically
consistent, completely wrong. The fix became the most interesting idea in the
project: once the Reasoner establishes that a claim overstates its own
evidence, sources reporting a real-but-smaller effect stop being neutral,
because they are precisely what demonstrates the overstatement. Then a test
caught the overcorrection, where it started returning CONTRADICTED. A real
effect stretched out of shape is not a false one, so the verdict is now capped
at MISLEADING when the contradiction comes mostly from turned context.

**A full investigation took 456 seconds.** Rather than guess, I benchmarked the
candidate models on this pipeline's own source-criticism task. The result was
decisive: the mini model returned *identical* stance classifications to the pro
model in **5.0 seconds against 40.3**. The larger model was spending nearly its
whole budget on reasoning tokens for a task that did not need them.
Investigations dropped from 456s to 29s.

**Retrieval was finding prestigious papers about the wrong things.** My first
pre-filter ranked candidates on authority, peer-review status and citations.
For the brain claim it surfaced highly cited neuroscience papers with nothing
to do with the question and exactly one usable source out of nine. Topical
overlap now outweighs authority roughly two to one, and the Skeptic's finds get
a reserved share of the shortlist so an authority-ordered cut cannot quietly
delete the contrary evidence it was sent to find. Same investigation: six
usable sources across six independent groups.

**The evidence graph drew nodes but no edges, and logged nothing.** React Flow
keeps nodes hidden until it measures them with a ResizeObserver. I eventually
tested that observer directly and found it never fired, on an element that was
demonstrably 220 by 50 pixels. No measurement meant no handle bounds, no handle
bounds meant no edge geometry, and nothing anywhere reported a problem. The fix
was to stop depending on it: this graph is a static layered DAG whose geometry
I already compute, so the edges are now drawn from known positions.

**The free-tier quota nearly ate the demo.** 50 model requests a day, and a
standard investigation uses about 13. I found out by exhausting it mid-build,
and the failure mode was ugly — every agent retried into the same wall and the
Reasoner died silently, collapsing verdicts to INCONCLUSIVE with no visible
error. Now a global limiter backs off the whole pipeline when one call is
rejected, quota exhaustion aborts with an explanation instead of a stack trace,
and a structural fallback recovers overstatement detection when the Reasoner is
unavailable.

## Accomplishments that I'm proud of

- **It gets the hard case right.** Coffee returns MISLEADING with an
  explanation that separates mortality risk from lifespan and flags the
  correlation/causation swap. That distinction is the whole reason this exists.
- **Every citation is real.** Nothing is retrieved by the model. Any quote it
  produces is string-matched against the retrieved text before display, so a
  fabricated quotation never reaches the screen.
- **It says "I don't know" and means it.** Confidence is capped when there are
  too few independent sources, when source quality is mediocre, or when
  evidence is thin — with the reason shown.
- **Prompt injection is handled structurally, not by asking nicely.** Ten
  attack patterns are detected, redacted and fenced behind a nonce, and a page
  that tried to steer the checker keeps 25% of its evidence weight. The attempt
  becomes evidence about the source, which is what it is.
- **45 tests over the deterministic core**, including the one that matters
  most: eight syndicated articles cannot outvote three independent studies.
- **It can demo without the internet.** Any real investigation can be captured
  and replayed with zero API calls, clearly labelled as a replay.

## What I learned

**Ask models for judgements, not numbers.** Everywhere I let a model produce a
score, the score drifted toward tone. Everywhere I computed it from retrieved
facts, it held. Models are good at "does this source address this claim, and
does it overstate it" and bad at "how sure should you be". Split the system
along that line.

**Benchmark before optimising.** I assumed the bigger model was better. Fifteen
minutes of measurement showed identical outputs at one eighth the latency, and
that single finding is what made the product demoable.

**Retrieval quality beats model quality.** The biggest accuracy gain came from
changing how candidates were ranked *before* any model saw them. One usable
source became six, with no prompt changes at all.

**Silent degradation is worse than a crash.** The scariest bug was the Reasoner
dying under rate limits and every verdict quietly becoming INCONCLUSIVE. It
looked plausible, which is what made it dangerous.

## What's next for Reality Check

- **Claim-level caching**, so the same claim does not re-retrieve everything.
- **An evaluation harness** — measured claim-extraction accuracy and evidence
  relevance against a labelled set, to turn tuning from judgement into
  measurement.
- **Non-English retrieval**, which is a correctness gap rather than a coverage
  one. For many claims the primary source simply is not in English.
- **A browser extension.** Select any sentence on any page, right click, check
  it. This is what the architecture was always pointed at.

The long version is an **evidence layer for the internet**: not a fact-checking
site you visit, but something you can ask "what's the evidence?" anywhere, and
get back sources, contradictions, context and an honest confidence instead of
one more confident paragraph.
