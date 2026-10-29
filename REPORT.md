# REPORT - rag-v1

## Team

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
