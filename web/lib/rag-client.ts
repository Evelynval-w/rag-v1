const BASE = process.env.PYTHON_RAG_URL ?? "http://127.0.0.1:8033";

export type Chunk = {
  id: string;
  doc_name: string;
  chunk_index: number;
  text: string;
  score: number;
};

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sidecar ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const rag = {
  health: () => j<{ status: string; chunks_indexed: number }>("/health"),
  listDocs: () => j<{ name: string; bytes: number }[]>("/docs"),
  getSettings: () =>
    j<{
      chunk_size: number;
      overlap_percent: number;
      min_paragraph_length: number;
      top_k: number;
      embedding_model: string;
    }>("/settings"),
  putSettings: (s: object) =>
    j<{ reindex_needed: boolean }>("/settings", {
      method: "PUT",
      body: JSON.stringify(s),
    }),
  reindex: () => j<{ total_chunks: number }>("/reindex", { method: "POST" }),
  query: (q: { question: string; doc_names?: string[]; top_k?: number }) =>
    j<{ question: string; top_k: number; chunks: Chunk[] }>("/query", {
      method: "POST",
      body: JSON.stringify(q),
    }),
};
