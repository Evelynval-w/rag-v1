import { NextResponse } from "next/server";
import { rag } from "@/lib/rag-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const corpus = url.searchParams.get("corpus");
  const word = url.searchParams.get("word");
  if (!corpus || !word) {
    return NextResponse.json({ error: "corpus and word are required" }, { status: 400 });
  }
  try {
    const out = await rag.wordsByWord(corpus, word);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
