# rag-v2

RAG web app for the EPITA BCS S5 AI Systems Integration and Operations
course. V2 adds a second corpus, a repeatable retrieval evaluation, a
Words tab that explores the corpus vocabulary, and the no-context test
that flags questions the model already knew.

V1 of this project is at git tag `v1`; the deliverables for V2 live at
git tag `v2`.

## Structure

- `web/` is the Next.js 16 app (ask, documents, words, evaluation,
  settings pages and the API routes).
- `python-rag/` is a FastAPI sidecar that owns the index. Chroma for
  storage, `all-MiniLM-L6-v2` as the default embedding model.
- `python-rag/storage/corpora/<name>/docs/` holds the `.md` and `.txt`
  files of each corpus. V2 ships two:
  - `kestrel/` — the Kestrel Analytics knowledge base from the course
    (billing policies, product guide, error runbook, service catalog).
  - `epita/` — the 8 EPITA course notes I converted from the PDFs.
- `python-rag/eval/questions/{kestrel,epita}.jsonl` are the two question
  sets (Kestrel starter set and my own 10, in the Kestrel JSONL schema).
- `python-rag/eval/run.py` is the retrieval + answer runner.
- `python-rag/eval/results/` is where each run writes its results file.
- `REPORT.md` has the decision log, known failures, and the V2 numbers.

## Run

Needs Python 3.10+, Node 20+, and a Google AI Studio key.

Sidecar first:

```sh
cd python-rag
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8033 --reload
```

Web app in another terminal:

```sh
cd web
cp .env.example .env.local      # add GOOGLE_API_KEY
npm install
npm run dev
```

Open http://localhost:3044. The first ask may be slow because Chroma
downloads the embedding model.

Before you ask a question for the first time, go to the Documents page,
pick each corpus from the switcher, and click **Rebuild index**. V2
indexes every corpus into its own Chroma collection so you have to do
this once per corpus.

## Pages

- `/` ask a question, see the answer and references. The corpus is
  chosen at the top; the choice is remembered in localStorage.
- `/docs` list, add, delete, and reindex documents for the chosen
  corpus.
- `/words` the Words tab. Corpus mode (vocabulary and word → chunks)
  and Question mode (type a question and see which of its words exist
  in the corpus and in which chunks).
- `/eval` evaluation UI. Pick a corpus, optional config label, and the
  no-context / with-answers flags, then **Run eval**.
- `/settings` change chunk size, overlap, min paragraph length, top-k
  and embedding model.

## Env vars

`web/.env.local`:

```
GOOGLE_API_KEY=...
LLM_MODEL=gemini-3.5-flash-lite
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
PYTHON_RAG_URL=http://127.0.0.1:8033
```

## Checks

```sh
cd web
npm run typecheck
npm run build
```

## Evaluation

The evaluation runs each question of a question set against the current
sidecar configuration and writes a results file under
`python-rag/eval/results/`. It can be started two ways.

From the terminal:

```sh
cd python-rag
source .venv/bin/activate
# both corpora at the current settings
python eval/run.py
# one corpus, with a label that will show up in the filename
python eval/run.py --corpus kestrel --config-label minilm_800_k5
# add the no-context test (ask every question without retrieval)
python eval/run.py --no-context
# also generate the answers so you can hand-grade them
python eval/run.py --with-answers --corpus kestrel
```

From the front-end: open `/eval`, pick a corpus, a (optional) label,
tick the flags you want, click **Run eval**.

What the runner measures:

- for every answerable question, retrieve top-10 chunks once, then
  score hit@1, @3, @5, @10. A hit at k is at least one chunk in the top
  k whose doc_name is one of the question's `evidence` sources and
  whose text contains the evidence quote (case-insensitive).
- unanswerable questions are excluded from the retrieval numbers; they
  are asked through the full `/api/ask` and we check `no_answer == true`.
- with `--no-context`, each question is also asked to the LLM without
  retrieval; the result file flags which ones the model already knew.
- with `--with-answers`, each answerable question is also sent to the
  full RAG and the answer + the retrieved chunks are stored next to the
  question for hand grading (`grade` field, left `null` for you to fill).

## Hidden `/about` page

Per the V2 spec, `/about` holds a sentence that must not be linked from
anywhere else. It is reachable only by typing the URL.
