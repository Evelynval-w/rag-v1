const BASE = process.env.PYTHON_RAG_URL ?? "http://127.0.0.1:8033";

export type Chunk = {
  id: string;
  doc_name: string;
  chunk_index: number;
  text: string;
  score: number;
};

export type Settings = {
  chunk_size: number;
  overlap_percent: number;
  min_paragraph_length: number;
  top_k: number;
  embedding_model: string;
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

const q = (params: Record<string, string>) =>
  "?" + new URLSearchParams(params).toString();

export const rag = {
  health: () =>
    j<{
      status: string;
      settings: Settings;
      corpora: { name: string; collection: string; chunks_indexed: number }[];
    }>("/health"),

  listCorpora: () => j<string[]>("/corpora"),

  listDocs: (corpus: string) =>
    j<{ name: string; bytes: number }[]>("/docs" + q({ corpus })),

  getSettings: () => j<Settings>("/settings"),

  putSettings: (s: object) =>
    j<{ settings: Settings; reindex_needed: boolean }>("/settings", {
      method: "PUT",
      body: JSON.stringify(s),
    }),

  reindex: (corpus: string) =>
    j<{ corpus: string; total_chunks: number; per_doc: Record<string, number> }>(
      "/reindex" + q({ corpus }),
      { method: "POST" },
    ),

  query: (body: { corpus: string; question: string; doc_names?: string[]; top_k?: number }) =>
    j<{ corpus: string; question: string; top_k: number; chunks: Chunk[] }>("/query", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  wordsVocab: (corpus: string) =>
    j<{
      corpus: string;
      chunks_total: number;
      vocab_size: number;
      rows: { word: string; total: number; chunks: number }[];
    }>("/words/vocab" + q({ corpus })),

  wordsByWord: (corpus: string, word: string) =>
    j<{
      corpus: string;
      word: string;
      chunks: {
        id: string;
        doc_name: string;
        chunk_index: number;
        count: number;
        text: string;
      }[];
    }>("/words/by-word" + q({ corpus, word })),

  wordsQuestion: (corpus: string, question: string) =>
    j<{
      corpus: string;
      question: string;
      words: {
        word: string;
        in_corpus: boolean;
        chunks: { id: string; doc_name: string; chunk_index: number; count: number }[];
      }[];
    }>("/words/question" + q({ corpus, q: question })),
};
