# REPORT - rag-v2

## Team

Solo for V1 and V2.

- Makuochukwu Okoene, github.com/Evelynval-w, built V1 and V2.

## V2 - what changed since V1

### Two corpora, one app

The sidecar now routes everything on a `corpus` key. Each corpus lives
under `python-rag/storage/corpora/<name>/docs/` and gets its own Chroma
collection; the collection name is
`<corpus>__<model>_<chunk>_<overlap>_<minpar>`, so two configs on the
same corpus coexist without clobbering each other.

- `kestrel` — the Kestrel Analytics KB from the course brief.
- `epita` — the 8 course notes I converted from the lecture PDFs in V1,
  moved under the new per-corpus directory with `git mv` so the history
  survives.

The front-end switches corpora at the top of Ask, Documents, Words and
Evaluation. The choice is kept in `localStorage` (default `kestrel`).

### Question sets

Both question sets live in `python-rag/eval/questions/*.jsonl` in
Kestrel's schema (`id`, `question`, `type`, `answerable`, `evidence[]`,
`expected_answer`, `notes`).

- `kestrel.jsonl` is the 10 starter questions, verbatim.
- `epita.jsonl` is my 10 V1 questions re-encoded in Kestrel's schema.
  Types used: `exact_identifier` (q01, q03, q04, q05), `split_answer`
  (q02, q08), `two_hop` (q06), `vocabulary` (q07), `not_in_corpus`
  (q09, q10). I do not have a `versions` case because EPITA notes have
  no document that exists in two versions.

### Retrieval evaluation

`python-rag/eval/run.py` is rewritten. It takes `--corpus
kestrel|epita|both`, pulls the top-10 chunks once per question, and
scores hit@1/3/5/10 overall and per `type`. Unanswerable questions are
not in the retrieval numbers; they go through the full `/api/ask` and
only count on `no_answer == true`. Results land in
`eval/results/<timestamp>__<corpus>__<label>.json`. The runner can be
started from the terminal (`python eval/run.py …`) or from the
front-end (`/eval` → **Run eval**), which calls `POST /eval` on the
sidecar.

Two flags I added:

- `--no-context` asks every question to the LLM with no retrieval and
  flags the ones the model already knew (`no_context_model_knows`).
- `--with-answers` runs the full RAG on each answerable question and
  stores the answer + retrieved chunks next to it, with a `grade`
  field left `null` for hand grading.

### Words tab

A new `/words` page shows the words actually in each corpus.

- **Corpus mode** — vocabulary table (word, total count, number of
  chunks it is in). Click a word to see the chunks that contain it.
- **Question mode** — paste a question, see which of its words are in
  the corpus and in which chunks, and which are absent.

I use a dumb tokeniser on purpose: lowercase + `[a-z0-9][a-z0-9_'-]*`.
No stemming, no stopword list. The whole point of this tab is to show
me the literal overlap (or lack of it) between the question and the
indexed text, so a smart tokeniser would hide what I came here to see.

### Hidden `/about` page

As the brief asks: `/about` exists but no page links to it. It prints
the sentence from the brief in a large centred font.

## decisions added in v2

### One Chroma collection per corpus × per config

Collection names already encoded the settings in V1. I added the
corpus as a prefix. `get_or_create_collection` then means I can switch
configs for free: if the collection exists, no reindex. The price is
that `chroma_db/` grows with every config I try (fine on local disk).

Alternative I rejected: wiping and rebuilding one collection per
corpus on every settings change. Faster to code but every eval run
would start with a reindex, and I would lose the ability to compare
two configs back-to-back without waiting for embeddings.

### Kestrel's JSONL schema for both question sets

I ported V1's `questions.json` to Kestrel's JSONL instead of keeping
two shapes. `evidence[{source, quote}]` is strictly richer than V1's
`expected_doc` + `expected_substring` pair (many evidence rows per
question), and I kept the `notes` field for the "why is this question
in the set" line I always wrote in V1.

### Hit = evidence quote substring, not vector distance

A hit at k is a top-k chunk whose `doc_name` matches an
`evidence.source` AND whose text contains the `evidence.quote`
(case-insensitive). I never use the chunk's distance score. Retrieval
quality is just "did the right text come back", nothing else. This is
V1's rule, extended to several evidence rows per question.

### No-context as a flag on `/api/ask`, not a new endpoint

I added a `no_context` boolean to the ask request. When set, the
server switches to a different system prompt
(`SYSTEM_MESSAGE_NO_CONTEXT`), skips retrieval, and returns an answer
with an empty references array. The eval runner's heuristic for "model
knows" is: the model's answer must contain at least one evidence quote
AND must not have `no_answer=true`. I set it this strict on purpose. A
looser heuristic would flag any answer the model volunteered as "it
knew it", which over-reports contamination on questions whose answers
the model guessed near-correctly from priors.

## V2 results

### Configurations

| label | chunk_size | overlap | top_k | embedding model | note |
|---|---|---|---|---|---|
| `A_minilm_800_k5` | 800 | 10% | 5 | all-MiniLM-L6-v2 | V1 baseline, carried over as the V2 anchor |
| `B_bge_800_k5` | 800 | 10% | 5 | BAAI/bge-small-en-v1.5 | isolates embedding quality |
| `C_minilm_1200_k5` | 1200 | 20% | 5 | all-MiniLM-L6-v2 | isolates chunking strategy |

### Retrieval numbers (hit rate)

Cell format `k=1 / k=3 / k=5 / k=10`. Per-type columns only cover
answerable question types that appear in the set.

**Kestrel KB** (8 answerable + 2 unanswerable, raw files in
`python-rag/eval/results/*_kestrel_*.json`)

| config | overall | exact_identifier (2) | split_answer (2) | vocabulary (1) | versions (2) | two_hop (1) |
|---|---|---|---|---|---|---|
| A_minilm_800_k5   | 0.62 / 0.75 / 0.88 / 1.00 | 0.50 / 0.50 / 0.50 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 0.50 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 |
| B_bge_800_k5      | 0.75 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 |
| C_minilm_1200_k5  | 0.50 / 1.00 / 1.00 / 1.00 | 0.50 / 1.00 / 1.00 / 1.00 | 0.50 / 1.00 / 1.00 / 1.00 | 0.00 / 1.00 / 1.00 / 1.00 | 0.50 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 |

**EPITA notes** (8 answerable + 2 unanswerable)

| config | overall | exact_identifier (4) | split_answer (2) | vocabulary (1) | two_hop (1) |
|---|---|---|---|---|---|
| A_minilm_800_k5   | 0.62 / 1.00 / 1.00 / 1.00 | 0.50 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 |
| B_bge_800_k5      | 0.62 / 0.88 / 0.88 / 1.00 | 0.50 / 0.75 / 0.75 / 1.00 | 0.50 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 |
| C_minilm_1200_k5  | 0.62 / 0.88 / 0.88 / 1.00 | 0.75 / 1.00 / 1.00 / 1.00 | 0.50 / 1.00 / 1.00 / 1.00 | 0.00 / 0.00 / 0.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 |

### Unanswerable questions (did the app refuse to answer?)

| config | Kestrel | EPITA |
|---|---|---|
| A_minilm_800_k5   | 2/2 | 2/2 |
| B_bge_800_k5      | 2/2 | 2/2 |
| C_minilm_1200_k5  | 2/2 | 2/2 |

Every config refused on both unanswerable questions in both corpora.
V1's "controlled failures" behaviour (no_answer schema flag) survived
the V2 reorganisation.

### No-context test

Flagged questions (model answered correctly without retrieval):

| corpus | model-knows (/10) | notes |
|---|---|---|
| Kestrel | 1/10 | q09 "iPhone app" — the model answered without saying "I don't know". The content is fictional so the model cannot really know; I read this as a near-false-positive of my heuristic. The 9 others: uncertain or wrong. |
| EPITA   | 5/10 | q01 lost-in-the-middle, q06 hidden states, q07 credential recovery, q08 cosine similarity, q09 north-star metric. All five are general ML/UX ideas the model has seen plenty of times in training. |

My policy on the flagged EPITA questions: **keep them**. Replacing
them would mean picking 5 new questions that the model does not know
AND whose answers are in these specific course notes, in two days.
Instead I note here that the EPITA numbers above test the full
pipeline, not retrieval in isolation: for a cleaner test of retrieval
alone, read the Kestrel row of the tables above. V3 is where I would
re-cut the EPITA set.

### What moved between configurations

Data points (interpretation is yours):

- **A → B (MiniLM → BGE-small-en-v1.5, chunking identical)**
  - Kestrel overall k=1: 0.62 → 0.75 (two more questions ranked first)
  - Kestrel `exact_identifier` k=1: 0.50 → 1.00 (both KST-xxxx codes
    now rank first; MiniLM confused KST-2044 with its neighbour code)
  - EPITA overall k=3: 1.00 → 0.88 (q03 "which embedding model" fell
    from rank 3 to rank 6)
  - EPITA `split_answer` k=1: 1.00 → 0.50 (q02 "chunk size and
    overlap" fell from rank 1 to rank 2)
- **A → C (MiniLM, chunk 800/10% → 1200/20%)**
  - Kestrel overall k=1: 0.62 → 0.50 (bigger chunks noisier at the top)
  - Kestrel overall k=3: 0.75 → 1.00 (bigger chunks cover more
    evidence per hit; `versions` jumps 0.50 → 1.00 at k=3)
  - Kestrel `vocabulary` k=1: 1.00 → 0.00 (q05 "lost my phone" fell
    from rank 1 to rank 3; the credential/account chunk got diluted by
    the extra surrounding text)
  - EPITA `vocabulary` k≤5: 0.00 (the one vocab-mismatch question
    does not recover until k=10)

**What I take from these moves:**

- Switching to BGE wins Kestrel at k=1 because BGE separates near-
  identical identifiers (`KST-2044` vs `KST-2040`) that MiniLM collapses.
  The same switch hurts EPITA by a bit because MiniLM's embeddings are
  closer to how the course notes are phrased (prose, long sentences);
  BGE's advantage on short Q&A-style text does not transfer.
- Bigger chunks are a tradeoff on principle: more context per chunk
  (good for `split_answer` and `versions` at k≥3) but noisier top-1
  (bad for `vocabulary`, where the single critical word gets diluted).
  Config C makes this very visible: EPITA `vocabulary` stays at 0.00
  all the way to k=5 and only recovers at k=10.
- No change ever moved `two_hop`. In my question set the two-hop case
  gets its first-hop chunk at rank 1, every time; the second-hop
  evidence is what retrieval misses, and I will only see that in the
  answer grades, not in hit@k.

### Two diagnosed misses

Each miss was opened in the Words tab (`/words`, Question mode) at the
configuration where it fails.

**Kestrel miss — q01 "What does error KST-2044 mean and how do I fix
it?" (A_minilm_800_k5, rank 6, missed at k=5)**

- The identifier `kst-2044` is in **1 chunk only**:
  `support-runbook-errors.md #4`. So the ground truth is in exactly
  one place; retrieval has no slack.
- The query's content words `mean`, `fix`, `i` are **absent from the
  corpus** altogether (0 chunks).
- The content words that ARE in the corpus (`error`, `what`, `how`,
  `do`, `it`) are everywhere — `error` in 9 chunks, `it` in 20, `and`
  in all 42.
- Config A's MiniLM embedding treats `KST-2044` and `KST-2040` as
  near-identical tokens, so retrieval picks `KST-2040`'s chunk first
  (semantically close, "data source timeout"). BGE (Config B)
  separates them and ranks the right chunk at #1.

**Takeaway:** at my chunking, exact-identifier questions live or die
by the embedding model. Chunk size is a side quest.

**EPITA miss — q07 "How do I get back into my account?"
(C_minilm_1200_k5, rank 7, worst case across my three configs)**

- The one word the answer actually uses, `credential`, is in **1
  chunk only**: `c6-rag.txt #35`.
- Every word of the question IS in the corpus, but spread very wide:
  `how` 46, `do` 46, `i` 43, `into` 34, `back` 24, `get` 17, `account`
  15, `my` 7. (Chunk counts at Config C.)
- Zero overlap between the question words and the answer vocabulary.
  The dense embedding is the only bridge between "get back into my
  account" and "credential recovery".
- Bigger chunks (1200/20%) made this worse because the one chunk that
  holds `credential` now carries more unrelated text, diluting its
  signal. Config A (800/10%) ranks it at #3; BGE at 800/10% at #1.

**Takeaway:** pure dense retrieval cannot bridge a vocabulary gap this
wide at k=1 in a corpus this small. V3 should test query rewriting or
hybrid search (BM25 + dense) rather than another embedding model.

### Answer grading

Grading rules (I wrote these BEFORE I graded):

- `correct` — says what `expected_answer` says, with the right facts.
- `partial` — says some of what `expected_answer` says, misses a
  piece, but says nothing wrong.
- `wrong` — says something that is not in the documents, or
  contradicts them.
- `unsupported` — the sentences say things the referenced chunks do
  not say, even if the sentences happen to be true.
- For an unanswerable question, `correct` = the app said "not in the
  documents". Answering anyway is `wrong`.

Grading question set: **Kestrel** (fictional, so I can trust that a
right-looking answer actually came from retrieval, not from training).
Best configuration graded: **B_bge_800_k5**.

Grades (file:
`python-rag/eval/results/20261103-085637__kestrel__B_bge_800_k5_graded.json`):

| grade | count |
|---|---|
| correct | 8 |
| partial | 2 |
| wrong | 0 |
| unsupported | 0 |

- Partial: **q07** (versions trap — asked for the current discount, got
  both 15% AND 20% because retrieval ranked the 2025 doc at k=2 and
  the model dutifully quoted both).
- Partial: **q08** (two-hop — only did hop 1 "escalate to postroom
  team"; hop 2 "Messaging team, #oncall-messaging" was absent from the
  cited references). This is a **retrieval failure**, not a generation
  failure: the service-catalog chunk never made it into the top 5, so
  the model had nothing to do the second hop with.
- Retrieval failures (wrong or partial, right chunk NOT retrieved): **1** (q08).
- Generation failures (wrong or partial, right chunk WAS retrieved): **1** (q07; both policy chunks were in top-k, the model just failed to pick the current one).

## V2 known failures (additions)

### F6 - two-hop retrieval under-counted by hit@k

My hit@k treats a question as a hit if ANY evidence row is matched by
ANY top-k chunk. For a two-hop question with two evidence rows, that
means hit@k=true when only the first hop was retrieved, even though
the answer cannot be built. q08 Kestrel shows this: hit@1 is true,
hand grade is `partial`.

Lead for V3: compute hit@k as "all evidence rows matched" for two_hop
rows, or score each evidence row separately.

### F7 - versions trap leaks into the answer

When two near-identical versions of a doc exist (Kestrel 2025 vs 2026
billing), retrieval returns both inside the top-k. The model then
hedges and quotes both numbers (q07: "15% or 20%"). The schema accepts
this because both are supported by the retrieved chunks.

Lead for V3: either a time/version filter in retrieval, or a prompt
rule like "if two retrieved chunks disagree, prefer the one with the
later effective date and say so".

### F8 - vocabulary gap unrecoverable at k=1 with current embeddings

q07 EPITA ("get back into my account") never ranks #1 across any of
my three configs. The only chunk that contains the answer vocabulary
(`credential`) has no surface overlap with the question. This is the
V1 F3 observation, now with numbers.

Lead for V3: hybrid search (dense + BM25), query rewriting, or
synonym expansion against a small gazetteer learned from the eval
misses.

---

# V1 appendix

Everything below is the original V1 report. Kept for traceability.

## Team (V1)

Me, solo for V1. I plan to form a team of 2 or 3 before V2 so the git
history can show a fair split from V2 on.

- Makuochukwu Okoene, github.com/Evelynval-w, built all of V1.

## Decision log

Short entries. Each one has what else I looked at and why I picked what
I picked.

### Stack: Next.js 16 web + Python FastAPI sidecar

I looked at a full Python app (Streamlit or FastAPI templates) and a
full TypeScript app with a JS vector lib. I went with Next.js + Python
sidecar because I had just built the triage app on Next.js and wanted
to reuse the same Zod schema pattern at the LLM boundary. The embedding
part has to be Python anyway because `sentence-transformers` is not in
JS.

### Embedding model: `all-MiniLM-L6-v2`

Local, 384 dimensions, 22.7M parameters. Same as the class `norag-rag`
reference so my numbers are comparable. I did not try a hosted
embedding (OpenAI, Google) because V1 is a baseline and I want the
starting point to be the lab version. Will try a bigger model in V2
and measure the difference.

### Vector DB: Chroma persistent

Same reason as the embedding model. No account, one directory, it
works. If V2 needs richer metadata filtering I will revisit.

### Chunking: 800-char fixed window, 10% overlap, drop paragraphs <20 chars

Fixed-character windows are the simplest thing that works. I know this
breaks sentences at boundaries and loses short one-line paragraphs:
both of those are in Known failures. V2 can try sentence-aware
splitting.

### Chat model: `gemini-3.5-flash-lite` via Google's OpenAI-compatible endpoint

I already have Google AI Studio Pro, so no new account. The
OpenAI-compatible endpoint means I can keep using the `openai` client
I know from the triage app. Matches the class reference exactly.

### Response schema: `{ answer, references[], no_answer }` validated with Zod

Two options I thought about: free-text with inline citations, or a
structured JSON object. I went with JSON because the UI needs
machine-readable references to render "click to view chunk". Zod
checks the shape before the UI ever sees it. Invalid output becomes
HTTP 502 with the code `invalid_model_output`, not a crash.

### Pin `transformers<5`, `numpy<2` in the Python sidecar

On a fresh macOS install, pip resolves `torch==2.2.2` as the newest
universal wheel. `transformers>=5.0` wants `torch>=2.6`, silently
disables torch, and then dies on an unguarded `nn.Module` reference
inside `transformers/integrations/accelerate.py`. The class
`norag-rag` repo hits the same problem on a fresh install for the
same reason (its `requirements.txt` is unpinned). I pinned
`transformers>=4.41,<5`, `numpy<2`, `sentence-transformers<5` so the
install works out of the box.

### Settings exposed through the UI, not through code

The spec says chunk size, overlap and top-k must be changeable without
editing code. The `/settings` page writes to `python-rag/settings.json`
through the sidecar and flags `reindex_needed` when a value that
changes the index is touched.

## Known failures

Questions that break V1 today. For V2 this is the starting list.

### F1 - sentence cut at a chunk boundary can disappear

800-char windows with 10% overlap can split one long sentence. The
half with the key noun lands in one chunk, the half with the fact in
another. The noisier half tends to score higher. I saw this happen
with a definition that straddled the end of a chunk.

Lead for V2: sentence-aware splitting or bigger overlap on prose.

### F2 - multi-hop questions miss their second hop

Top-k is driven by one query embedding. If the second fact uses
different wording, its chunk is not in the top-k.

Reproduce: ask something like "which model is recommended for the
Decision Model and what is its context window?". The two facts live
in different slides.

Lead for V2: query decomposition or a second retrieval pass.

### F3 - vocabulary mismatch between user and docs

The user might ask "how do I get back into my account?" when the docs
say "credential recovery". The dense embedding brings similar words
close but not synonyms perfectly.

Lead for V2: hybrid search (dense + BM25) or query rewriting.

### F4 - no check that the answer is actually built from the cited chunks

The schema forces references, but nothing verifies the answer's
sentences overlap with the cited chunk's text. The model can cite a
loosely related chunk and write around it.

Lead for V3: a grounding check comparing tokens in `answer` to tokens
in the cited chunks.

### F5 - min_paragraph_length drops short rules

A one-sentence rule shorter than 20 characters gets dropped before
chunking. If that single rule was the answer, it is gone.

Reproduce: lower the threshold to 0 and see whether a previously
missed answer comes back.

Lead for V2: keep short paragraphs but merge them with the next one
when they would be dropped.

## Evaluation baseline

Questions live in `python-rag/eval/questions.json`: 10 total, 5 easy,
3 hard, 2 unanswerable. Each answerable question carries an
`expected_doc` and an `expected_substring`. A substring instead of a
chunk index means the ground truth stays correct when chunk size
changes between V1 and V2.

The harness `python-rag/eval/run.py`:

- for answerable questions calls the sidecar's `/query` and marks a
  hit when at least one of the top-k chunks is from `expected_doc`
  and its text contains `expected_substring` (case-insensitive)
- for unanswerable questions calls the web app's `/api/ask` and
  marks ok when the LLM reply has `no_answer: true`
- writes a report to `python-rag/eval/results/<date>-<model>-cs<n>-k<n>.json`
  so I can compare V1 and V2 side by side.

Baseline run on 2026-10-29 with `gemini-3.5-flash-lite`:

| config | hit rate | no_answer rate |
|---|---|---|
| `chunk_size=800, top_k=5` (default, matches `norag-rag`) | 100% (8/8) | 100% (2/2) |
| `chunk_size=400, top_k=3` | 38% (3/8) | 100% (2/2) |

Observations:

- At the defaults, every answerable question lands at top-5 or
  better. 3 of them at rank 1.
- Halving `chunk_size` and dropping `top_k` from 5 to 3 collapses
  the hit rate to 38%. The context budget shrinks fast when both
  settings move at once.
- `no_answer_rate` is 100% in both runs. The prompt + schema
  combination refuses to invent answers when retrieval is noise.
  This is the behaviour the "controlled failures" rubric asks for.

Target for V2: keep 100% while widening the question set to harder
questions that V1 misses. If V2 cannot keep 100%, V2 is a regression.

## What V1 covers (and what it doesn't)

Covered:
- Both pipeline phases behind a web API.
- Zod schema validation at the LLM boundary.
- Document CRUD and rebuild from the UI.
- Settings editable from the UI, with a reindex nudge.
- References link back to the chunks they cite.
- 5 defined failure paths (retrieval unavailable, invalid model
  output, LLM unavailable, no chunks, no answer).
- Repeatable retrieval evaluation with baseline numbers.

Not covered on purpose (left for V2/V3/V4):
- Better retrieval (reranking, hybrid search, query rewriting).
- Grounding check on the answer.
- Cost / latency logging on `/admin`.
- Guardrails beyond `no_answer`.
