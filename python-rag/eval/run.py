"""Retrieval + answer eval for rag-v2.

Usage
-----
    python eval/run.py                      # both corpora, retrieval only, current settings
    python eval/run.py --corpus kestrel
    python eval/run.py --corpus epita
    python eval/run.py --no-context         # also run the no-context test
    python eval/run.py --with-answers       # also generate answers (for hand grading)
    python eval/run.py --config-label mini_800_k5

What it measures
----------------
For each corpus and each ANSWERABLE question, retrieve top-10 chunks once from
the sidecar, then score hit@k for k in {1, 3, 5, 10}. A hit at k means the
first k retrieved chunks contain at least one chunk whose doc_name matches
one of the evidence sources AND whose text contains the evidence quote
(case-insensitive). Unanswerable questions are excluded from the retrieval
numbers; instead they get a full /api/ask call and we check no_answer==true.

With --no-context, each question is also asked to the LLM WITHOUT retrieval,
so we can flag questions the model already knows (which do not test the RAG).

With --with-answers, each answerable question is also sent to /api/ask with
retrieval, and the answer + chunks are stored next to the question so you
can hand-grade (correct|partial|wrong|unsupported) later.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
QUESTIONS_DIR = HERE / "questions"
RESULTS_DIR = HERE / "results"
RESULTS_DIR.mkdir(exist_ok=True)

SIDECAR = os.environ.get("PYTHON_RAG_URL", "http://127.0.0.1:8033")
WEB = os.environ.get("WEB_URL", "http://127.0.0.1:3044")

K_VALUES = [1, 3, 5, 10]
BIG_K = max(K_VALUES)


def http_json(url: str, body: dict | None = None, timeout: int = 60) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method="POST" if data else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for i, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as e:
            print(f"warning: {path.name}:{i} bad JSON: {e}", file=sys.stderr)
    return rows


def hit_rank(chunks: list[dict], evidence: list[dict]) -> int | None:
    """Return the 1-based rank of the first chunk that matches any evidence
    row (doc_name == source AND quote-substring in chunk text), or None.
    """
    if not evidence:
        return None
    for rank, c in enumerate(chunks, 1):
        for ev in evidence:
            src = ev.get("source") or ""
            quote = (ev.get("quote") or "").lower()
            if c["doc_name"] == src and quote and quote in c["text"].lower():
                return rank
    return None


def score_answerable(q: dict, corpus: str) -> dict:
    res = http_json(
        f"{SIDECAR}/query",
        {"corpus": corpus, "question": q["question"], "top_k": BIG_K},
    )
    chunks = res["chunks"]
    rank = hit_rank(chunks, q.get("evidence") or [])
    hits_at = {f"hit@{k}": bool(rank is not None and rank <= k) for k in K_VALUES}
    return {
        "id": q["id"],
        "type": q.get("type") or "unknown",
        "answerable": True,
        "question": q["question"],
        "evidence": q.get("evidence") or [],
        "best_rank": rank,
        **hits_at,
        "retrieved": [
            {"doc": c["doc_name"], "chunk": c["chunk_index"], "score": round(c["score"], 3)}
            for c in chunks[:BIG_K]
        ],
    }


def score_unanswerable(q: dict, corpus: str) -> dict:
    res = http_json(
        f"{WEB}/api/ask",
        {"corpus": corpus, "question": q["question"]},
    )
    ans = res.get("answer") or {}
    return {
        "id": q["id"],
        "type": q.get("type") or "not_in_corpus",
        "answerable": False,
        "question": q["question"],
        "no_answer_flag": bool(ans.get("no_answer")),
        "model_answer": ans.get("answer"),
        "refs_count": len(ans.get("references") or []),
        "model": res.get("model"),
    }


def no_context_pass(q: dict) -> dict:
    """Ask the question to the LLM with no retrieval."""
    res = http_json(
        f"{WEB}/api/ask",
        {"corpus": "kestrel", "question": q["question"], "no_context": True},
    )
    ans = res.get("answer") or {}
    answer_text = (ans.get("answer") or "").lower()

    # Heuristic: for answerable questions, consider the model to "know" the
    # answer if ANY evidence quote appears in its answer text. This is
    # conservative on purpose: Kestrel answers rarely contain the exact
    # quotes (the model does not know them), while general-knowledge
    # answers often do.
    if q.get("answerable"):
        quotes = [(ev.get("quote") or "").lower() for ev in (q.get("evidence") or [])]
        matched = [qu for qu in quotes if qu and qu in answer_text]
        model_knows = bool(matched) and not ans.get("no_answer")
    else:
        model_knows = not ans.get("no_answer")

    return {
        "no_context_answer": ans.get("answer"),
        "no_context_no_answer": bool(ans.get("no_answer")),
        "no_context_model_knows": model_knows,
    }


def answer_pass(q: dict, corpus: str) -> dict:
    """Full RAG answer for hand grading."""
    res = http_json(
        f"{WEB}/api/ask",
        {"corpus": corpus, "question": q["question"]},
    )
    ans = res.get("answer") or {}
    return {
        "answer": ans.get("answer"),
        "answer_no_answer": bool(ans.get("no_answer")),
        "answer_references": ans.get("references") or [],
        "answer_chunks": res.get("chunks") or [],
        "answer_model": res.get("model"),
        "grade": None,
        "grade_notes": None,
    }


def summarize(rows: list[dict]) -> dict:
    ans_rows = [r for r in rows if r.get("answerable")]
    un_rows = [r for r in rows if not r.get("answerable")]

    per_k: dict[str, dict] = {}
    for k in K_VALUES:
        total = len(ans_rows)
        hit = sum(1 for r in ans_rows if r.get(f"hit@{k}"))
        by_type: dict[str, dict] = defaultdict(lambda: {"hit": 0, "total": 0})
        for r in ans_rows:
            t = r.get("type", "unknown")
            by_type[t]["total"] += 1
            if r.get(f"hit@{k}"):
                by_type[t]["hit"] += 1
        per_k[f"k={k}"] = {
            "overall": {"hit": hit, "total": total,
                        "rate": round(hit / total, 3) if total else None},
            "by_type": {
                t: {**v, "rate": round(v["hit"] / v["total"], 3) if v["total"] else None}
                for t, v in by_type.items()
            },
        }

    no_answer_ok = sum(1 for r in un_rows if r.get("no_answer_flag"))
    return {
        "per_k": per_k,
        "unanswerable": {
            "total": len(un_rows),
            "correct_no_answer": no_answer_ok,
            "rate": round(no_answer_ok / len(un_rows), 3) if un_rows else None,
        },
        "no_context": {
            "model_knows": sum(1 for r in rows if r.get("no_context_model_knows")),
            "total_tested": sum(1 for r in rows if "no_context_model_knows" in r),
        },
    }


def run_corpus(
    corpus: str,
    config_label: str,
    do_no_context: bool,
    do_answers: bool,
) -> dict:
    qs_path = QUESTIONS_DIR / f"{corpus}.jsonl"
    if not qs_path.exists():
        raise FileNotFoundError(f"no question set for {corpus} at {qs_path}")
    questions = load_jsonl(qs_path)
    settings = http_json(f"{SIDECAR}/settings")

    print(f"\n=== {corpus} ({len(questions)} questions) · config '{config_label}' ===")
    print(f"settings: {settings}")

    rows: list[dict] = []
    for q in questions:
        if q.get("answerable"):
            r = score_answerable(q, corpus)
        else:
            r = score_unanswerable(q, corpus)

        if do_no_context:
            r.update(no_context_pass(q))

        if do_answers and q.get("answerable"):
            r.update(answer_pass(q, corpus))

        rows.append(r)
        mark = ""
        if q.get("answerable"):
            best = r.get("best_rank")
            mark = f"@{best}" if best else "MISS"
        else:
            mark = "OK" if r.get("no_answer_flag") else "WRONG"
        knows = ""
        if do_no_context:
            knows = "  LLM_KNOWS" if r.get("no_context_model_knows") else "  llm_unsure"
        print(f"  {r['id']:<4} {r.get('type', ''):<17} {mark:<6}{knows}  {q['question']}")

    summary = summarize(rows)
    print("\nSummary:")
    for k, info in summary["per_k"].items():
        o = info["overall"]
        print(f"  {k:<6}  overall {o['rate']} ({o['hit']}/{o['total']})")
    un = summary["unanswerable"]
    print(f"  unanswerable  correct_no_answer {un['rate']} ({un['correct_no_answer']}/{un['total']})")
    if do_no_context:
        nc = summary["no_context"]
        print(f"  no-context    model_knows {nc['model_knows']}/{nc['total_tested']}")

    out = {
        "corpus": corpus,
        "config_label": config_label,
        "settings": settings,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "flags": {"no_context": do_no_context, "with_answers": do_answers},
        "rows": rows,
        "summary": summary,
    }
    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = RESULTS_DIR / f"{ts}__{corpus}__{config_label}.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"wrote {out_path}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--corpus",
        choices=["kestrel", "epita", "both"],
        default="both",
    )
    ap.add_argument(
        "--config-label",
        default=None,
        help="free-form label put into the result filename, e.g. 'minilm_800_k5'",
    )
    ap.add_argument("--no-context", action="store_true")
    ap.add_argument("--with-answers", action="store_true")
    args = ap.parse_args()

    s = http_json(f"{SIDECAR}/settings")
    config_label = args.config_label or (
        f"{s['embedding_model'].replace('/', '_')}_cs{s['chunk_size']}_"
        f"ov{s['overlap_percent']}_k{s['top_k']}"
    )

    corpora = ["kestrel", "epita"] if args.corpus == "both" else [args.corpus]
    for c in corpora:
        run_corpus(c, config_label, args.no_context, args.with_answers)
    return 0


if __name__ == "__main__":
    sys.exit(main())
