"use client";

import { useState } from "react";

type CorpusChoice = "kestrel" | "epita" | "both";

type PerK = {
  overall: { hit: number; total: number; rate: number | null };
  by_type: Record<string, { hit: number; total: number; rate: number | null }>;
};

type Summary = {
  per_k: Record<string, PerK>;
  unanswerable: { total: number; correct_no_answer: number; rate: number | null };
  no_context: { model_knows: number; total_tested: number };
};

type ResultOne = {
  corpus: string;
  config_label: string;
  settings: Record<string, unknown>;
  summary: Summary;
};

type EvalResponse = {
  corpora: string[];
  config_label: string;
  results: ResultOne[];
};

export default function EvalPage() {
  const [corpus, setCorpus] = useState<CorpusChoice>("both");
  const [configLabel, setConfigLabel] = useState("");
  const [noContext, setNoContext] = useState(false);
  const [withAnswers, setWithAnswers] = useState(false);
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<EvalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setOut(null);
    try {
      const qp = new URLSearchParams({
        corpus,
        no_context: String(noContext),
        with_answers: String(withAnswers),
      });
      if (configLabel.trim()) qp.set("config_label", configLabel.trim());
      const r = await fetch(`/api/eval?${qp.toString()}`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "eval failed");
      setOut(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <h1>Evaluation</h1>
      <p className="muted">
        Runs the eval against the sidecar at the <strong>current settings</strong>. For a different
        config, change the settings on the Settings page, click Rebuild index for each corpus you
        plan to evaluate, then re-run here (give it a unique config label).
      </p>

      <div className="card">
        <label>Corpus</label>
        <select value={corpus} onChange={(e) => setCorpus(e.target.value as CorpusChoice)}>
          <option value="both">both</option>
          <option value="kestrel">kestrel</option>
          <option value="epita">epita</option>
        </select>

        <label style={{ marginTop: 12 }}>
          Config label (optional; defaults to the sidecar&apos;s current settings)
        </label>
        <input
          type="text"
          placeholder="e.g. minilm_800_k5"
          value={configLabel}
          onChange={(e) => setConfigLabel(e.target.value)}
        />

        <div className="row" style={{ marginTop: 8 }}>
          <input
            id="nc"
            type="checkbox"
            checked={noContext}
            onChange={(e) => setNoContext(e.target.checked)}
          />
          <label htmlFor="nc" className="muted">
            No-context test (also ask every question without retrieval)
          </label>
        </div>
        <div className="row">
          <input
            id="ans"
            type="checkbox"
            checked={withAnswers}
            onChange={(e) => setWithAnswers(e.target.checked)}
          />
          <label htmlFor="ans" className="muted">
            Generate answers for hand grading (full RAG; costs tokens)
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={run} disabled={running}>
            {running ? "Running..." : "Run eval"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Results are also written to <code>python-rag/eval/results/</code>.
        </p>
      </div>

      {error && <div className="error">Error: {error}</div>}

      {out && (
        <div className="card">
          <h2>Results · config {out.config_label}</h2>
          {out.results.map((r) => (
            <div key={r.corpus} style={{ marginBottom: 16 }}>
              <h3>{r.corpus}</h3>
              <table style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>k</th>
                    <th>overall</th>
                    {Object.keys(r.summary.per_k["k=10"].by_type).map((t) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(r.summary.per_k).map(([k, info]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td style={{ textAlign: "center" }}>
                        {info.overall.rate} ({info.overall.hit}/{info.overall.total})
                      </td>
                      {Object.entries(info.by_type).map(([t, v]) => (
                        <td key={t} style={{ textAlign: "center" }}>
                          {v.rate} ({v.hit}/{v.total})
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                unanswerable: {r.summary.unanswerable.correct_no_answer}/
                {r.summary.unanswerable.total} said no_answer
                {r.summary.no_context.total_tested > 0 && (
                  <>
                    {" · "}no-context: model knew {r.summary.no_context.model_knows}/
                    {r.summary.no_context.total_tested}
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
