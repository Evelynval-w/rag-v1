"""RAG sidecar for rag-v2. FastAPI around Chroma + sentence-transformers.

V2 change: the sidecar is now corpus-aware. Each corpus lives under
storage/corpora/<corpus>/docs/ and gets its own Chroma collection per
settings config.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

HERE = Path(__file__).parent
STORAGE = HERE / "storage"
CORPORA_DIR = STORAGE / "corpora"
CHROMA_DIR = STORAGE / "chroma_db"
SETTINGS_FILE = HERE / "settings.json"

CORPORA_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {".md", ".txt"}

# Simple word tokeniser for the Words tab. Kept the same across endpoints so
# the UI numbers and the API numbers match. Lowercase, letters+digits only,
# minimum length 2 to drop single-letter noise.
WORD_RE = re.compile(r"[a-z0-9][a-z0-9_'-]*")


# Settings

class Settings(BaseModel):
    chunk_size: int = Field(ge=100, le=4000, default=800)
    overlap_percent: int = Field(ge=0, le=50, default=10)
    min_paragraph_length: int = Field(ge=0, le=200, default=20)
    top_k: int = Field(ge=1, le=20, default=5)
    embedding_model: str = "all-MiniLM-L6-v2"


def load_settings() -> Settings:
    if not SETTINGS_FILE.exists():
        s = Settings()
        SETTINGS_FILE.write_text(s.model_dump_json(indent=2))
        return s
    return Settings.model_validate_json(SETTINGS_FILE.read_text())


def save_settings(s: Settings) -> None:
    SETTINGS_FILE.write_text(s.model_dump_json(indent=2))


# Corpora

def known_corpora() -> list[str]:
    return sorted(
        p.name for p in CORPORA_DIR.iterdir()
        if p.is_dir() and (p / "docs").is_dir()
    )


def docs_dir(corpus: str) -> Path:
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", corpus or ""):
        raise HTTPException(400, "corpus must match [a-z0-9][a-z0-9_-]*")
    d = CORPORA_DIR / corpus / "docs"
    if not d.is_dir():
        raise HTTPException(404, f"no such corpus: {corpus}")
    return d


# Chroma

_client = chromadb.PersistentClient(path=str(CHROMA_DIR))


def collection_name(corpus: str, s: Settings) -> str:
    model = re.sub(r"[^a-zA-Z0-9]", "_", s.embedding_model)
    return f"{corpus}__{model}_{s.chunk_size}_{s.overlap_percent}_{s.min_paragraph_length}"


def get_collection(corpus: str, s: Settings):
    ef = SentenceTransformerEmbeddingFunction(model_name=s.embedding_model)
    return _client.get_or_create_collection(
        name=collection_name(corpus, s),
        embedding_function=ef,
    )


# Chunking

def split_into_chunks(text: str, s: Settings) -> list[str]:
    paragraphs = [
        p.strip()
        for p in text.split("\n\n")
        if len(p.strip()) >= s.min_paragraph_length
    ]
    joined = "\n\n".join(paragraphs)
    overlap = s.chunk_size * s.overlap_percent // 100
    step = max(1, s.chunk_size - overlap)
    return [joined[i : i + s.chunk_size] for i in range(0, len(joined), step)]


def index_file(path: Path, s: Settings, coll) -> int:
    text = path.read_text(encoding="utf-8")
    chunks = split_into_chunks(text, s)
    if not chunks:
        return 0
    ids = [f"{path.name}#chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {"doc_name": path.name, "chunk_index": i} for i in range(len(chunks))
    ]
    coll.add(documents=chunks, ids=ids, metadatas=metadatas)
    return len(chunks)


def reindex_corpus(corpus: str, s: Settings) -> dict[str, int]:
    coll = get_collection(corpus, s)
    try:
        _client.delete_collection(name=coll.name)
    except Exception:
        pass
    coll = get_collection(corpus, s)
    counts: dict[str, int] = {}
    for path in sorted(docs_dir(corpus).iterdir()):
        if path.suffix.lower() not in ALLOWED_EXT:
            continue
        counts[path.name] = index_file(path, s, coll)
    return counts


# API

# disable the built-in Swagger UI so it does not shadow the GET /docs endpoint
app = FastAPI(title="rag-v2 sidecar", docs_url=None, redoc_url=None, openapi_url=None)


class DocIn(BaseModel):
    name: str
    text: str


class QueryIn(BaseModel):
    corpus: str
    question: str
    doc_names: list[str] | None = None
    top_k: int | None = None


class ChunkOut(BaseModel):
    id: str
    doc_name: str
    chunk_index: int
    text: str
    score: float


@app.get("/health")
def health() -> dict[str, Any]:
    s = load_settings()
    corpora = known_corpora()
    return {
        "status": "ok",
        "settings": s.model_dump(),
        "corpora": [
            {
                "name": c,
                "collection": collection_name(c, s),
                "chunks_indexed": get_collection(c, s).count(),
            }
            for c in corpora
        ],
    }


@app.get("/corpora")
def list_corpora() -> list[str]:
    return known_corpora()


@app.get("/docs")
def list_docs(corpus: str = Query(...)) -> list[dict[str, Any]]:
    out = []
    for p in sorted(docs_dir(corpus).iterdir()):
        if p.suffix.lower() in ALLOWED_EXT:
            out.append({"name": p.name, "bytes": p.stat().st_size})
    return out


@app.post("/docs")
def add_doc(doc: DocIn, corpus: str = Query(...)) -> dict[str, Any]:
    name = Path(doc.name).name
    if Path(name).suffix.lower() not in ALLOWED_EXT:
        raise HTTPException(400, "only .md and .txt files are allowed")
    target = docs_dir(corpus) / name
    target.write_text(doc.text, encoding="utf-8")
    s = load_settings()
    coll = get_collection(corpus, s)
    added = index_file(target, s, coll)
    return {"corpus": corpus, "name": name, "chunks_added": added}


@app.delete("/docs/{name}")
def delete_doc(name: str, corpus: str = Query(...)) -> dict[str, Any]:
    name = Path(name).name
    path = docs_dir(corpus) / name
    if not path.exists():
        raise HTTPException(404, "no such document")
    path.unlink()
    s = load_settings()
    coll = get_collection(corpus, s)
    coll.delete(where={"doc_name": name})
    return {"corpus": corpus, "name": name, "removed": True}


@app.get("/settings")
def get_settings() -> dict[str, Any]:
    return load_settings().model_dump()


@app.put("/settings")
def put_settings(new: Settings) -> dict[str, Any]:
    old = load_settings()
    save_settings(new)
    reindex_needed = (
        new.chunk_size != old.chunk_size
        or new.overlap_percent != old.overlap_percent
        or new.min_paragraph_length != old.min_paragraph_length
        or new.embedding_model != old.embedding_model
    )
    return {"settings": new.model_dump(), "reindex_needed": reindex_needed}


@app.post("/reindex")
def reindex(corpus: str = Query(...)) -> dict[str, Any]:
    s = load_settings()
    counts = reindex_corpus(corpus, s)
    total = sum(counts.values())
    return {
        "corpus": corpus,
        "collection": collection_name(corpus, s),
        "total_chunks": total,
        "per_doc": counts,
    }


@app.post("/query")
def query(q: QueryIn) -> dict[str, Any]:
    s = load_settings()
    coll = get_collection(q.corpus, s)
    k = q.top_k or s.top_k
    where = {"doc_name": {"$in": q.doc_names}} if q.doc_names else None
    res = coll.query(query_texts=[q.question], n_results=k, where=where)
    docs = res["documents"][0] if res["documents"] else []
    ids = res["ids"][0] if res["ids"] else []
    metas = res["metadatas"][0] if res["metadatas"] else []
    dists = res["distances"][0] if res.get("distances") else [0.0] * len(docs)
    chunks = [
        ChunkOut(
            id=ids[i],
            doc_name=metas[i].get("doc_name", "unknown"),
            chunk_index=int(metas[i].get("chunk_index", 0)),
            text=docs[i],
            score=1.0 - float(dists[i]),
        ).model_dump()
        for i in range(len(docs))
    ]
    return {"corpus": q.corpus, "question": q.question, "top_k": k, "chunks": chunks}


# Words tab

def tokenize(text: str) -> list[str]:
    return WORD_RE.findall(text.lower())


def _corpus_chunks(corpus: str, s: Settings) -> list[dict[str, Any]]:
    coll = get_collection(corpus, s)
    data = coll.get(include=["documents", "metadatas"])
    out = []
    for i, text in enumerate(data["documents"]):
        m = data["metadatas"][i] or {}
        out.append({
            "id": data["ids"][i],
            "doc_name": m.get("doc_name", "unknown"),
            "chunk_index": int(m.get("chunk_index", 0)),
            "text": text,
        })
    out.sort(key=lambda c: (c["doc_name"], c["chunk_index"]))
    return out


@app.get("/words/vocab")
def words_vocab(corpus: str = Query(...)) -> dict[str, Any]:
    s = load_settings()
    chunks = _corpus_chunks(corpus, s)
    total: Counter[str] = Counter()
    chunks_with: dict[str, set[str]] = {}
    for c in chunks:
        toks = tokenize(c["text"])
        total.update(toks)
        for w in set(toks):
            chunks_with.setdefault(w, set()).add(c["id"])
    rows = [
        {"word": w, "total": total[w], "chunks": len(chunks_with[w])}
        for w in total
    ]
    rows.sort(key=lambda r: (-r["total"], r["word"]))
    return {
        "corpus": corpus,
        "chunks_total": len(chunks),
        "vocab_size": len(rows),
        "rows": rows,
    }


@app.get("/words/by-word")
def words_by_word(corpus: str = Query(...), word: str = Query(...)) -> dict[str, Any]:
    s = load_settings()
    target = word.lower().strip()
    hits = []
    for c in _corpus_chunks(corpus, s):
        toks = tokenize(c["text"])
        count = toks.count(target)
        if count:
            hits.append({
                "id": c["id"],
                "doc_name": c["doc_name"],
                "chunk_index": c["chunk_index"],
                "count": count,
                "text": c["text"],
            })
    return {"corpus": corpus, "word": target, "chunks": hits}


# Evaluation (triggered from the front-end)

@app.post("/eval")
def eval_endpoint(
    corpus: str = Query("both"),
    no_context: bool = Query(False),
    with_answers: bool = Query(False),
    config_label: str | None = Query(None),
) -> dict[str, Any]:
    """Run the eval runner inline and return every corpus's result dict."""
    # Imported lazily to avoid a hard dependency when the sidecar boots.
    import sys as _sys
    _sys.path.insert(0, str(HERE / "eval"))
    import run as _runner  # type: ignore
    s = load_settings()
    label = config_label or (
        f"{s.embedding_model.replace('/', '_')}_cs{s.chunk_size}_"
        f"ov{s.overlap_percent}_k{s.top_k}"
    )
    corpora = ["kestrel", "epita"] if corpus == "both" else [corpus]
    results = []
    for c in corpora:
        results.append(_runner.run_corpus(c, label, no_context, with_answers))
    return {"corpora": corpora, "config_label": label, "results": results}


@app.get("/words/question")
def words_question(corpus: str = Query(...), q: str = Query(...)) -> dict[str, Any]:
    s = load_settings()
    chunks = _corpus_chunks(corpus, s)
    q_tokens = tokenize(q)
    # token presence index: word -> list of {id, doc_name, chunk_index, count}
    index: dict[str, list[dict[str, Any]]] = {}
    for c in chunks:
        toks = tokenize(c["text"])
        counts = Counter(toks)
        for w in set(q_tokens) & set(counts.keys()):
            index.setdefault(w, []).append({
                "id": c["id"],
                "doc_name": c["doc_name"],
                "chunk_index": c["chunk_index"],
                "count": counts[w],
            })
    rows = []
    seen = set()
    for w in q_tokens:
        if w in seen:
            continue
        seen.add(w)
        hits = index.get(w, [])
        rows.append({
            "word": w,
            "in_corpus": bool(hits),
            "chunks": sorted(hits, key=lambda h: -h["count"]),
        })
    return {"corpus": corpus, "question": q, "words": rows}
