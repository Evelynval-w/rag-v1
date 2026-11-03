import { NextResponse } from "next/server";
import { rag } from "@/lib/rag-client";

export async function GET() {
  try {
    const corpora = await rag.listCorpora();
    return NextResponse.json(corpora);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
