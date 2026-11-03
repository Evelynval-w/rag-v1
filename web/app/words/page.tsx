"use client";

import { useEffect, useState } from "react";
import { useCorpus, CorpusSwitcher } from "@/lib/use-corpus";

type VocabRow = { word: string; total: number; chunks: number };
type WordChunk = {
  id: string;
  doc_name: string;
  chunk_index: number;
  count: number;
  text: string;
};
type QuestionRow = {
  word: string;
  in_corpus: boolean;
  chunks: { id: string; doc_name: string; chunk_index: number; count: number }[];
};

export default function WordsPage() {
  const [corpus, setCorpus, known] = useCorpus();
  const [mode, setMode] = useState<"corpus" | "question">("corpus");
  const [vocab, setVocab] = useState<{
    rows: VocabRow[];
    vocab_size: number;
    chunks_total: number;
  } | null>(null);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [wordDetail, setWordDetail] = useState<WordChunk[] | null>(null);

  const [question, setQuestion] = useState("");
  const [questionRows, setQuestionRows] = useState<QuestionRow[] | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!corpus || mode !== "corpus") return;
    setVocab(null);
    setPicked(null);
    setWordDetail(null);
    setError(null);
    fetch(`/api/words/vocab?corpus=${encodeURIComponent(corpus)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setVocab({ rows: d.rows, vocab_size: d.vocab_size, chunks_total: d.chunks_total });
      })
      .catch((e) => setError(String(e)));
  }, [corpus, mode]);

  async function pickWord(w: string) {
    setPicked(w);
    setWordDetail(null);
    const r = await fetch(
      `/api/words/by-word?corpus=${encodeURIComponent(corpus)}&word=${encodeURIComponent(w)}`,
    );
    const d = await r.json();
    if (d.error) setError(d.error);
    else setWordDetail(d.chunks);
  }

  async function runQuestion() {
    setError(null);
    setQuestionRows(null);
    const r = await fetch(
      `/api/words/question?corpus=${encodeURIComponent(corpus)}&q=${encodeURIComponent(question)}`,
    );
    const d = await r.json();
    if (d.error) setError(d.error);
    else setQuestionRows(d.words);
  }

  const shownVocab = vocab?.rows.filter((r) =>
    filter ? r.word.includes(filter.toLowerCase()) : true,
  ) ?? [];

  return (
    <>
      <h1>Words</h1>
      <CorpusSwitcher value={corpus} onChange={setCorpus} known={known} />

      <div className="row" style={{ marginBottom: 12 }}>
        <button
          onClick={() => setMode("corpus")}
          style={{
            background: mode === "corpus" ? "#111" : "#555",
          }}
        >
          Corpus mode
        </button>
        <button
          onClick={() => setMode("question")}
          style={{
            background: mode === "question" ? "#111" : "#555",
          }}
        >
          Question mode
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {mode === "corpus" && (
        <>
          <div className="card">
            <h2>Vocabulary</h2>
            {!vocab ? (
              <p className="muted">Loading...</p>
            ) : (
              <>
                <p className="muted">
                  {vocab.vocab_size} distinct words across {vocab.chunks_total} chunks.
                </p>
                <input
                  type="text"
                  placeholder="filter words (prefix)"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>word</th>
                        <th>total</th>
                        <th>chunks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownVocab.slice(0, 200).map((r) => (
                        <tr key={r.word}>
                          <td>
                            <button
                              style={{
                                padding: "2px 6px",
                                fontSize: 12,
                                background: picked === r.word ? "#036" : "#555",
                              }}
                              onClick={() => pickWord(r.word)}
                            >
                              {r.word}
                            </button>
                          </td>
                          <td style={{ textAlign: "center" }}>{r.total}</td>
                          <td style={{ textAlign: "center" }}>{r.chunks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shownVocab.length > 200 && (
                    <p className="muted">(showing first 200 of {shownVocab.length})</p>
                  )}
                </div>
              </>
            )}
          </div>

          {picked && (
            <div className="card">
              <h2>Chunks containing &quot;{picked}&quot;</h2>
              {!wordDetail ? (
                <p className="muted">Loading...</p>
              ) : wordDetail.length === 0 ? (
                <p className="muted">No chunk contains this word.</p>
              ) : (
                wordDetail.map((c) => (
                  <div key={c.id} style={{ marginBottom: 12 }}>
                    <div className="ref">
                      {c.doc_name} #{c.chunk_index} - {c.count}×
                    </div>
                    <div className="chunk">{c.text}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {mode === "question" && (
        <>
          <div className="card">
            <label>Question (or paste one from your question set)</label>
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder='e.g. "I lost my phone and I can&apos;t log in anymore"'
            />
            <div style={{ marginTop: 8 }}>
              <button onClick={runQuestion} disabled={question.trim().length === 0}>
                Analyse
              </button>
            </div>
          </div>

          {questionRows && (
            <div className="card">
              <h2>Words in the question</h2>
              <table style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>word</th>
                    <th>in corpus?</th>
                    <th>chunks</th>
                  </tr>
                </thead>
                <tbody>
                  {questionRows.map((r) => (
                    <tr key={r.word}>
                      <td>{r.word}</td>
                      <td style={{ textAlign: "center" }}>
                        {r.in_corpus ? "yes" : <span style={{ color: "#c33" }}>absent</span>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {r.chunks.length === 0
                          ? "-"
                          : r.chunks
                              .slice(0, 5)
                              .map((c) => `${c.doc_name}#${c.chunk_index}(${c.count})`)
                              .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
