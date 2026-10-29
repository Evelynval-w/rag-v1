"""RAG sidecar for rag-v1. FastAPI around Chroma + sentence-transformers."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

HERE = Path(__file__).parent
STORAGE = HERE / "storage"
DOCS_DIR = STORAGE / "docs"
CHROMA_DIR = STORAGE / "chroma_db"
SETTINGS_FILE = HERE / "settings.json"

DOCS_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {".md", ".txt"}


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


# Chroma

_client = chromadb.PersistentClient(path=str(CHROMA_DIR))


def collection_name(s: Settings) -> str:
    model = re.sub(r"[^a-zA-Z0-9]", "_", s.embedding_model)
    return f"corpus_{model}_{s.chunk_size}_{s.overlap_percent}_{s.min_paragraph_length}"


def get_collection(s: Settings):
    ef = SentenceTransformerEmbeddingFunction(model_name=s.embedding_model)
    return _client.get_or_create_collection(
        name=collection_name(s),
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


def reindex_all(s: Settings) -> dict[str, int]:
    coll = get_collection(s)
    try:
        _client.delete_collection(name=coll.name)
    except Exception:
        pass
    coll = get_collection(s)
    counts: dict[str, int] = {}
    for path in sorted(DOCS_DIR.iterdir()):
        if path.suffix.lower() not in ALLOWED_EXT:
            continue
        counts[path.name] = index_file(path, s, coll)
    return counts


# API

# disable the built-in Swagger UI so it does not shadow the GET /docs endpoint
app = FastAPI(title="rag-v1 sidecar", docs_url=None, redoc_url=None, openapi_url=None)


class DocIn(BaseModel):
    name: str
    text: str


class QueryIn(BaseModel):
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
    coll = get_collection(s)
    return {
        "status": "ok",
        "settings": s.model_dump(),
        "collection": coll.name,
        "chunks_indexed": coll.count(),
    }


@app.get("/docs")
def list_docs() -> list[dict[str, Any]]:
    out = []
    for p in sorted(DOCS_DIR.iterdir()):
        if p.suffix.lower() in ALLOWED_EXT:
            out.append({"name": p.name, "bytes": p.stat().st_size})
    return out


@app.post("/docs")
def add_doc(doc: DocIn) -> dict[str, Any]:
    name = Path(doc.name).name
    if Path(name).suffix.lower() not in ALLOWED_EXT:
        raise HTTPException(400, "only .md and .txt files are allowed")
    (DOCS_DIR / name).write_text(doc.text, encoding="utf-8")
    s = load_settings()
    coll = get_collection(s)
    added = index_file(DOCS_DIR / name, s, coll)
    return {"name": name, "chunks_added": added}


@app.delete("/docs/{name}")
def delete_doc(name: str) -> dict[str, Any]:
    name = Path(name).name
    path = DOCS_DIR / name
    if not path.exists():
        raise HTTPException(404, "no such document")
    path.unlink()
    s = load_settings()
    coll = get_collection(s)
    coll.delete(where={"doc_name": name})
    return {"name": name, "removed": True}


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
def reindex() -> dict[str, Any]:
    s = load_settings()
    counts = reindex_all(s)
    total = sum(counts.values())
    return {"collection": collection_name(s), "total_chunks": total, "per_doc": counts}


@app.post("/query")
def query(q: QueryIn) -> dict[str, Any]:
    s = load_settings()
    coll = get_collection(s)
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
    return {"question": q.question, "top_k": k, "chunks": chunks}
