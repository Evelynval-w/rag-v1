import { NextResponse } from "next/server";
import { rag } from "@/lib/rag-client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const corpus = url.searchParams.get("corpus");
  if (!corpus) {
    return NextResponse.json({ error: "corpus is required" }, { status: 400 });
  }
  try {
    const docs = await rag.listDocs(corpus);
    return NextResponse.json(docs);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
