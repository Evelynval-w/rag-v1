"""Retrieval eval for rag-v1.

Reads questions.json, scores hit@top_k on the answerable ones and
no_answer_rate on the unanswerable ones, writes a timestamped report
under eval/results.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
QUESTIONS_FILE = HERE / "questions.json"
RESULTS_DIR = HERE / "results"
RESULTS_DIR.mkdir(exist_ok=True)

SIDECAR = os.environ.get("PYTHON_RAG_URL", "http://127.0.0.1:8033")
WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3044")


def http_json(url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method="POST" if data else "GET",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def score_answerable(q: dict, top_k: int) -> dict:
    res = http_json(
        f"{SIDECAR}/query",
        {"question": q["question"], "top_k": top_k},
    )
    chunks = res["chunks"]
    doc = q["expected_doc"]
    sub = (q.get("expected_substring") or "").lower()
    hits = [
        c for c in chunks
        if c["doc_name"] == doc and sub in c["text"].lower()
    ]
    best_rank = next(
        (i + 1 for i, c in enumerate(chunks) if c in hits), None
    )
    return {
        "id": q["id"],
        "difficulty": q["difficulty"],
        "question": q["question"],
        "expected_doc": doc,
        "hit": len(hits) > 0,
        "best_rank": best_rank,
        "retrieved": [
            {"doc": c["doc_name"], "chunk": c["chunk_index"], "score": round(c["score"], 3)}
            for c in chunks
        ],
    }


def score_unanswerable(q: dict) -> dict:
    res = http_json(
        f"{WEB}/api/ask",
        {"question": q["question"]},
    )
    ans = res.get("answer") or {}
    return {
        "id": q["id"],
        "difficulty": q["difficulty"],
        "question": q["question"],
        "no_answer_flag": bool(ans.get("no_answer")),
        "refs_count": len(ans.get("references") or []),
        "model": res.get("model"),
    }


def main() -> int:
    questions_blob = json.loads(QUESTIONS_FILE.read_text())
    questions = questions_blob["questions"]

    settings = http_json(f"{SIDECAR}/settings")
    model = os.environ.get("LLM_MODEL") or "gemini-3.5-flash-lite"
    top_k = int(settings["top_k"])
    chunk_size = int(settings["chunk_size"])

    answerable = [q for q in questions if q["difficulty"] != "unanswerable"]
    unanswerable = [q for q in questions if q["difficulty"] == "unanswerable"]

    print(
        f"\nSettings: chunk_size={chunk_size}, overlap={settings['overlap_percent']}%, "
        f"top_k={top_k}, embedding={settings['embedding_model']}, model={model}"
    )

    print(f"\n--- ANSWERABLE ({len(answerable)}) ---")
    ans_rows = []
    for q in answerable:
        r = score_answerable(q, top_k)
        ans_rows.append(r)
        mark = "HIT" if r["hit"] else "MISS"
        rank = f"@{r['best_rank']}" if r["best_rank"] else "  "
        print(f"  {r['id']:<4} {r['difficulty']:<4} {mark:<4} {rank:<4}  {q['question']}")

    print(f"\n--- UNANSWERABLE ({len(unanswerable)}) ---")
    un_rows = []
    for q in unanswerable:
        r = score_unanswerable(q)
        un_rows.append(r)
        mark = "OK" if r["no_answer_flag"] else "WRONG"
        print(f"  {r['id']:<4} {mark:<5}  {q['question']}")

    hit_rate = sum(1 for r in ans_rows if r["hit"]) / max(1, len(ans_rows))
    no_answer_rate = sum(1 for r in un_rows if r["no_answer_flag"]) / max(1, len(un_rows))

    summary = {
        "when": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "settings": settings,
        "model": model,
        "hit_rate_at_top_k": round(hit_rate, 3),
        "no_answer_rate": round(no_answer_rate, 3),
        "answerable": ans_rows,
        "unanswerable": un_rows,
    }

    print(
        f"\n==> hit@top{top_k} = {hit_rate:.0%}   "
        f"no_answer_rate = {no_answer_rate:.0%}"
    )

    stamp = dt.datetime.utcnow().strftime("%Y-%m-%d-%H%M%S")
    safe_model = model.replace("/", "_")
    out = RESULTS_DIR / f"{stamp}-{safe_model}-cs{chunk_size}-k{top_k}.json"
    out.write_text(json.dumps(summary, indent=2))
    print(f"wrote {out.relative_to(HERE.parent.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
