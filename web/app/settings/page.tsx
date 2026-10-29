"use client";

import { useEffect, useState } from "react";

type Settings = {
  chunk_size: number;
  overlap_percent: number;
  min_paragraph_length: number;
  top_k: number;
  embedding_model: string;
};

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setS);
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const body = await r.json();
    setMsg(
      r.ok
        ? body.reindex_needed
          ? "saved. Reindex required (go to Documents, click Rebuild index)."
          : "saved"
        : `error: ${body.error}`,
    );
    setBusy(false);
  }

  if (!s) return <p>Loading…</p>;

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">
        chunk_size, overlap_percent, min_paragraph_length and embedding_model change
        the index. Changing any of them requires a reindex before new questions use
        the new values. top_k only affects retrieval.
      </p>

      <div className="card">
        <label>chunk_size (characters, 100–4000)</label>
        <input
          type="number"
          value={s.chunk_size}
          onChange={(e) => setS({ ...s, chunk_size: Number(e.target.value) })}
        />
        <label>overlap_percent (0–50)</label>
        <input
          type="number"
          value={s.overlap_percent}
          onChange={(e) => setS({ ...s, overlap_percent: Number(e.target.value) })}
        />
        <label>min_paragraph_length (0–200)</label>
        <input
          type="number"
          value={s.min_paragraph_length}
          onChange={(e) =>
            setS({ ...s, min_paragraph_length: Number(e.target.value) })
          }
        />
        <label>top_k (1–20)</label>
        <input
          type="number"
          value={s.top_k}
          onChange={(e) => setS({ ...s, top_k: Number(e.target.value) })}
        />
        <label>embedding_model</label>
        <input
          type="text"
          value={s.embedding_model}
          onChange={(e) => setS({ ...s, embedding_model: e.target.value })}
        />
        <div style={{ marginTop: 12 }}>
          <button onClick={save} disabled={busy}>
            Save
          </button>
        </div>
      </div>
      {msg && <div className="card">{msg}</div>}
    </>
  );
}
