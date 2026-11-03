"use client";

import { useEffect, useState } from "react";

const KEY = "rag-v2.corpus";
const DEFAULT_CORPUS = "kestrel";

export function useCorpus(): [string, (c: string) => void, string[]] {
  const [corpus, setCorpusState] = useState<string>(DEFAULT_CORPUS);
  const [known, setKnown] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setCorpusState(saved);
    } catch {
      // sessionStorage can throw in private modes
    }
    fetch("/api/corpora")
      .then((r) => r.json())
      .then((list: string[]) => {
        setKnown(list);
        if (list.length && !list.includes(corpus)) {
          setCorpus(list[0]);
        }
      })
      .catch(() => {});
    // we only read corpus on mount; subsequent setCorpus persists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setCorpus(c: string) {
    setCorpusState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      // ignore
    }
  }

  return [corpus, setCorpus, known];
}

export function CorpusSwitcher({
  value,
  onChange,
  known,
}: {
  value: string;
  onChange: (c: string) => void;
  known: string[];
}) {
  return (
    <div className="row" style={{ marginBottom: 12 }}>
      <label style={{ marginRight: 8 }}>Corpus:</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {known.length === 0 && <option value={value}>{value}</option>}
        {known.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
