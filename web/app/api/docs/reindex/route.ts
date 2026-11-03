import { NextResponse } from "next/server";

const BASE = process.env.PYTHON_RAG_URL ?? "http://127.0.0.1:8033";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const corpus = url.searchParams.get("corpus");
  if (!corpus) {
    return NextResponse.json({ error: "corpus is required" }, { status: 400 });
  }
  const r = await fetch(`${BASE}/reindex?corpus=${encodeURIComponent(corpus)}`, {
    method: "POST",
  });
  const payload = await r.json();
  return NextResponse.json(payload, { status: r.status });
}
