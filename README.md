# rag-v1

V1 of the RAG assignment for the EPITA BCS S5 AI Systems Integration and
Operations course. A small web app that answers questions from a corpus,
with references.

I kept this version naive on purpose. V2 is where I plan to improve the
retrieval.

## Structure

- `web/` is the Next.js 16 app (ask page, documents page, settings page,
  API routes).
- `python-rag/` is a FastAPI sidecar that owns the index. It uses Chroma
  for storage and `all-MiniLM-L6-v2` for the embeddings, same stack as the
  class `norag-rag` reference.
- `python-rag/storage/docs/` holds the `.md` and `.txt` files. On start-up
  this is already filled with the 8 EPITA course notes I converted from
  the PDFs.
- `python-rag/eval/` is the retrieval evaluation (questions + runner).
- `REPORT.md` has the decision log, known failures and the baseline
  numbers.

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

To build the index, go to the Documents page and click Rebuild index.

## Pages

- `/` ask a question, see the answer and references.
- `/docs` list documents, add or delete, rebuild the index.
- `/settings` change chunk size, overlap, min paragraph length, top-k
  and embedding model.

## Settings I started with

| setting | value | why |
|---|---|---|
| chunk_size | 800 chars | ~190 tokens, fits the embedding model's 256 limit |
| overlap_percent | 10 | 80 chars overlap so sentences do not get cut |
| min_paragraph_length | 20 | drops headings and one-line fragments |
| top_k | 5 | enough to cover a two-hop question |
| embedding_model | `all-MiniLM-L6-v2` | matches the class reference |

These are also the defaults the sidecar writes back to `settings.json`
if the file is missing.

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

```sh
cd python-rag
source .venv/bin/activate
python eval/run.py
```

Numbers for this run are in `REPORT.md` under Evaluation baseline.
