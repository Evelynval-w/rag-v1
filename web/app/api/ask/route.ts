import { NextResponse } from "next/server";
import { z } from "zod";
import { rag } from "@/lib/rag-client";
import { answerFromChunks, answerWithoutContext, LlmInvalidOutputError } from "@/lib/llm";

const BodySchema = z.object({
  corpus: z.string().min(1).max(64),
  question: z.string().min(1).max(1000),
  doc_names: z.array(z.string()).optional(),
  top_k: z.number().int().min(1).max(20).optional(),
  no_context: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // No-context mode: ask the LLM directly, no retrieval. Used by the eval
  // runner to flag questions the model already knew without retrieval.
  if (body.no_context) {
    try {
      const out = await answerWithoutContext(body.question);
      return NextResponse.json({
        answer: out.answer,
        chunks: [],
        model: out.model,
        usage: out.usage,
        no_context: true,
      });
    } catch (e) {
      if (e instanceof LlmInvalidOutputError) {
        return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
      }
      return NextResponse.json(
        { error: "llm_unavailable", detail: (e as Error).message },
        { status: 502 },
      );
    }
  }

  let chunks;
  try {
    const result = await rag.query({
      corpus: body.corpus,
      question: body.question,
      doc_names: body.doc_names,
      top_k: body.top_k,
    });
    chunks = result.chunks;
  } catch (e) {
    return NextResponse.json(
      { error: "retrieval_unavailable", detail: (e as Error).message },
      { status: 502 },
    );
  }

  if (chunks.length === 0) {
    return NextResponse.json({
      answer: {
        answer: "No chunks were retrieved. The index may be empty. Rebuild it from the Documents page.",
        references: [],
        no_answer: true,
      },
      chunks: [],
      model: null,
      usage: null,
    });
  }

  try {
    const out = await answerFromChunks(body.question, chunks);
    return NextResponse.json({
      answer: out.answer,
      chunks,
      model: out.model,
      usage: out.usage,
    });
  } catch (e) {
    if (e instanceof LlmInvalidOutputError) {
      return NextResponse.json(
        { error: "invalid_model_output" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "llm_unavailable", detail: (e as Error).message },
      { status: 502 },
    );
  }
}
