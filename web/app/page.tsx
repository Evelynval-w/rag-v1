"use client";

import { useEffect, useState } from "react";
import type { Answer, Reference } from "@/lib/schema";

type Chunk = {
  id: string;
  doc_name: string;
  chunk_index: number;
  text: string;
  score: number;
};

type AskResponse = {
  answer: Answer;
  chunks: Chunk[];
  model: string;
  usage: { input: number; output: number } | null;
};

export default function Home() {
  const [docs, setDocs] = useState<{ name: string; bytes: number }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChunk, setShowChunk] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/docs")
      .then((r) => r.json())
      .then((d) => setDocs(d))
      .catch(() => setError("sidecar not reachable"));
  }, []);

  function toggle(name: string) {
    const next = new Set(picked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setPicked(next);
  }

  async function ask() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          doc_names: picked.size > 0 ? Array.from(picked) : undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "request failed");
      setResult(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const chunkById = (id: string) => result?.chunks.find((c) => c.id === id);

  return (
    <>
      <h1>Ask a question about the course notes</h1>

      <div className="card">
        <label>Documents (leave all unchecked to ask against everything)</label>
        {docs.length === 0 ? (
          <p className="muted">No documents loaded. Visit the Documents page.</p>
        ) : (
          docs.map((d) => (
            <div key={d.name} className="row">
              <input
                type="checkbox"
                checked={picked.has(d.name)}
                onChange={() => toggle(d.name)}
              />
              <span>{d.name}</span>
              <span className="muted">({(d.bytes / 1024).toFixed(1)} KB)</span>
            </div>
          ))
        )}

        <label style={{ marginTop: 16 }}>Question</label>
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What is the lost-in-the-middle effect?"
        />
        <div style={{ marginTop: 12 }}>
          <button onClick={ask} disabled={loading || question.trim().length === 0}>
            {loading ? "Thinking..." : "Ask"}
          </button>
        </div>
      </div>

      {error && <div className="error">Error: {error}</div>}

      {result && (
        <>
          <div className="card">
            <h2>
              Answer
              <span className="badge">{result.model}</span>
              {result.answer.no_answer && (
                <span className="badge" style={{ background: "#fee" }}>no answer</span>
              )}
            </h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{result.answer.answer}</p>
            {result.usage && (
              <p className="muted">
                tokens: {result.usage.input} in / {result.usage.output} out
              </p>
            )}
          </div>

          <div className="card">
            <h2>References ({result.answer.references.length})</h2>
            {result.answer.references.length === 0 ? (
              <p className="muted">No references cited.</p>
            ) : (
              result.answer.references.map((r: Reference) => {
                const c = chunkById(r.chunk_id);
                return (
                  <div key={r.chunk_id} style={{ marginBottom: 8 }}>
                    <div className="ref">
                      {r.doc_name} #{r.chunk_index} - chunk_id: {r.chunk_id}
                      {!c && <span className="badge" style={{ background: "#fee" }}>not in retrieved set</span>}
                    </div>
                    {c && (
                      <>
                        <button
                          style={{ marginTop: 4, padding: "4px 10px", fontSize: 12 }}
                          onClick={() =>
                            setShowChunk(showChunk === r.chunk_id ? null : r.chunk_id)
                          }
                        >
                          {showChunk === r.chunk_id ? "hide" : "show"} chunk
                        </button>
                        {showChunk === r.chunk_id && (
                          <div className="chunk">{c.text}</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="card">
            <h2>Retrieved chunks (top {result.chunks.length})</h2>
            {result.chunks.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <div className="ref">
                  {c.doc_name} #{c.chunk_index} - score {c.score.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
