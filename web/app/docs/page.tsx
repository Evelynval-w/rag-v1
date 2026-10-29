"use client";

import { useEffect, useState } from "react";

type Doc = { name: string; bytes: number };

export default function DocsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/docs");
    setDocs(await r.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/docs/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text }),
    });
    const body = await r.json();
    setMsg(r.ok ? `added ${body.name} (+${body.chunks_added} chunks)` : `error: ${body.error}`);
    setName("");
    setText("");
    await load();
    setBusy(false);
  }

  async function remove(n: string) {
    if (!confirm(`Delete ${n}?`)) return;
    setBusy(true);
    const r = await fetch(`/api/docs/manage?name=${encodeURIComponent(n)}`, {
      method: "DELETE",
    });
    const body = await r.json();
    setMsg(r.ok ? `deleted ${body.name}` : `error: ${body.error}`);
    await load();
    setBusy(false);
  }

  async function reindex() {
    setBusy(true);
    const r = await fetch("/api/docs/reindex", { method: "POST" });
    const body = await r.json();
    setMsg(r.ok ? `reindexed (${body.total_chunks} chunks)` : `error: ${body.error}`);
    setBusy(false);
  }

  return (
    <>
      <h1>Documents</h1>
      <p className="muted">
        Only .md and .txt files are accepted. The corpus/ files are loaded on first boot.
      </p>

      <div className="card">
        <h2>Loaded ({docs.length})</h2>
        {docs.length === 0 ? (
          <p className="muted">Empty. Add a document below.</p>
        ) : (
          docs.map((d) => (
            <div key={d.name} className="row" style={{ marginBottom: 4 }}>
              <span>{d.name}</span>
              <span className="muted">({(d.bytes / 1024).toFixed(1)} KB)</span>
              <button
                style={{ padding: "4px 10px", fontSize: 12, background: "#a30000" }}
                onClick={() => remove(d.name)}
                disabled={busy}
              >
                delete
              </button>
            </div>
          ))
        )}
        <button onClick={reindex} disabled={busy} style={{ marginTop: 8 }}>
          Rebuild index
        </button>
      </div>

      <div className="card">
        <h2>Add a document</h2>
        <p className="muted">Both filename and content are required.</p>
        <label>Filename (ending in .md or .txt)</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-notes.md"
        />
        <label>Content</label>
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button
            onClick={add}
            disabled={busy || name.trim().length === 0 || text.trim().length === 0}
          >
            Add
          </button>
        </div>
      </div>

      {msg && <div className="card">{msg}</div>}
    </>
  );
}
