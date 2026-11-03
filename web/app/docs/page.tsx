"use client";

import { useEffect, useState } from "react";
import { useCorpus, CorpusSwitcher } from "@/lib/use-corpus";

type Doc = { name: string; bytes: number };

export default function DocsPage() {
  const [corpus, setCorpus, known] = useCorpus();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    if (!corpus) return;
    const r = await fetch(`/api/docs?corpus=${encodeURIComponent(corpus)}`);
    const d = await r.json();
    setDocs(Array.isArray(d) ? d : []);
  }

  useEffect(() => {
    load();
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpus]);

  async function add() {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/docs/manage?corpus=${encodeURIComponent(corpus)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text }),
    });
    const body = await r.json();
    setMsg(r.ok ? `added ${body.name} to ${corpus} (+${body.chunks_added} chunks)` : `error: ${body.error}`);
    setName("");
    setText("");
    await load();
    setBusy(false);
  }

  async function remove(n: string) {
    if (!confirm(`Delete ${n} from ${corpus}?`)) return;
    setBusy(true);
    const r = await fetch(
      `/api/docs/manage?name=${encodeURIComponent(n)}&corpus=${encodeURIComponent(corpus)}`,
      { method: "DELETE" },
    );
    const body = await r.json();
    setMsg(r.ok ? `deleted ${body.name} from ${corpus}` : `error: ${body.error}`);
    await load();
    setBusy(false);
  }

  async function reindex() {
    setBusy(true);
    const r = await fetch(`/api/docs/reindex?corpus=${encodeURIComponent(corpus)}`, {
      method: "POST",
    });
    const body = await r.json();
    setMsg(r.ok ? `reindexed ${corpus} (${body.total_chunks} chunks)` : `error: ${body.error}`);
    setBusy(false);
  }

  return (
    <>
      <h1>Documents</h1>
      <CorpusSwitcher value={corpus} onChange={setCorpus} known={known} />
      <p className="muted">
        Only .md and .txt files are accepted. The storage/corpora/{corpus}/docs files are the on-disk source of truth.
      </p>

      <div className="card">
        <h2>Loaded in {corpus} ({docs.length})</h2>
        {docs.length === 0 ? (
          <p className="muted">Empty. Add a document below or Rebuild index if the on-disk files are not indexed yet.</p>
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
          Rebuild index for {corpus}
        </button>
      </div>

      <div className="card">
        <h2>Add a document to {corpus}</h2>
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
