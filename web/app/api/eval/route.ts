import { NextResponse } from "next/server";

const BASE = process.env.PYTHON_RAG_URL ?? "http://127.0.0.1:8033";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const corpus = url.searchParams.get("corpus") ?? "both";
  const noContext = url.searchParams.get("no_context") === "true";
  const withAnswers = url.searchParams.get("with_answers") === "true";
  const configLabel = url.searchParams.get("config_label") ?? "";

  const qp = new URLSearchParams({
    corpus,
    no_context: String(noContext),
    with_answers: String(withAnswers),
  });
  if (configLabel) qp.set("config_label", configLabel);

  try {
    // Eval can take a while; let it run.
    const r = await fetch(`${BASE}/eval?${qp.toString()}`, {
      method: "POST",
      // 20 minute hard cap — the runner should finish well before that
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
    const payload = await r.json();
    return NextResponse.json(payload, { status: r.status });
  } catch (e) {
    return NextResponse.json(
      { error: "eval_failed", detail: (e as Error).message },
      { status: 502 },
    );
  }
}
