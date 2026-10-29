import { NextResponse } from "next/server";

const BASE = process.env.PYTHON_RAG_URL ?? "http://127.0.0.1:8033";

export async function GET() {
  const r = await fetch(`${BASE}/settings`);
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const r = await fetch(`${BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}
