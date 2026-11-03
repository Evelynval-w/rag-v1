import { NextResponse } from "next/server";

const BASE = process.env.PYTHON_RAG_URL ?? "http://127.0.0.1:8033";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const corpus = url.searchParams.get("corpus");
  if (!corpus) {
    return NextResponse.json({ error: "corpus is required" }, { status: 400 });
  }
  const body = await req.json();
  const r = await fetch(`${BASE}/docs?corpus=${encodeURIComponent(corpus)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await r.json();
  return NextResponse.json(payload, { status: r.status });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const corpus = url.searchParams.get("corpus");
  if (!name || !corpus) {
    return NextResponse.json({ error: "name and corpus are required" }, { status: 400 });
  }
  const r = await fetch(
    `${BASE}/docs/${encodeURIComponent(name)}?corpus=${encodeURIComponent(corpus)}`,
    { method: "DELETE" },
  );
  const payload = await r.json();
  return NextResponse.json(payload, { status: r.status });
}
