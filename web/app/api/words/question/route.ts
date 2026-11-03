import { NextResponse } from "next/server";
import { rag } from "@/lib/rag-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const corpus = url.searchParams.get("corpus");
  const q = url.searchParams.get("q");
  if (!corpus || !q) {
    return NextResponse.json({ error: "corpus and q are required" }, { status: 400 });
  }
  try {
    const out = await rag.wordsQuestion(corpus, q);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
