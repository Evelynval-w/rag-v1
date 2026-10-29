import { z } from "zod";

export const ReferenceSchema = z.object({
  chunk_id: z.string(),
  doc_name: z.string(),
  chunk_index: z.number().int().nonnegative(),
});

export const AnswerSchema = z.object({
  answer: z.string(),
  references: z.array(ReferenceSchema),
  no_answer: z.boolean(),
});

export type Answer = z.infer<typeof AnswerSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
