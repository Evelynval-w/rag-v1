import { NextResponse } from "next/server";

const BASE = process.env.PYTHON_RAG_URL ?? "http://127.0.0.1:8033";

export async function POST() {
  const r = await fetch(`${BASE}/reindex`, { method: "POST" });
  const payload = await r.json();
  return NextResponse.json(payload, { status: r.status });
}
