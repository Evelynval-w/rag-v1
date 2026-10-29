import { NextResponse } from "next/server";
import { rag } from "@/lib/rag-client";

export async function GET() {
  try {
    const docs = await rag.listDocs();
    return NextResponse.json(docs);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
