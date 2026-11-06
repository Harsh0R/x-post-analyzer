import { z } from "zod";
import { CATEGORY_IDS, type CategoryId } from "./categories";
import type { Verdict } from "./types";

const CategoryEnum = z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]);

export const VerdictSchema = z.object({
  category: CategoryEnum,
  label: z.string(),
  confidence: z.number(),
  value: z.number().optional(),
});

/** content script -> background */
export const AnalyzeRequest = z.object({
  type: z.literal("analyze"),
  id: z.string().min(1),
  text: z.string().min(1).max(5000),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export interface AnalyzeResponse {
  id: string;
  verdicts: Verdict[];
}

/** background -> content script, sent when the model has refined a post's labels */
export const RefineMessage = z.object({
  type: z.literal("refine"),
  id: z.string().min(1),
  verdicts: z.array(VerdictSchema),
});
export type RefineMessage = z.infer<typeof RefineMessage>;

/** offscreen document -> background (shown in the popup) */
export const MODEL_STATUS_KEY = "modelStatus";
export const ModelStatusMessage = z.object({
  type: z.literal("modelStatus"),
  state: z.enum(["idle", "loading", "ready", "error"]),
  progress: z.number().optional(),
  message: z.string().optional(),
});
export type ModelStatus = z.infer<typeof ModelStatusMessage>;

/** background -> offscreen document */
export const OffscreenRequest = z.discriminatedUnion("type", [
  z.object({
    target: z.literal("offscreen"),
    type: z.literal("classify"),
    text: z.string().max(5000),
    categories: z.array(CategoryEnum),
  }),
  z.object({ target: z.literal("offscreen"), type: z.literal("warmup") }),
]);
export type OffscreenRequest = z.infer<typeof OffscreenRequest>;

export const OffscreenResponse = z.object({
  ok: z.boolean(),
  verdicts: z.array(VerdictSchema).optional(),
  error: z.string().optional(),
});
export type OffscreenResponse = z.infer<typeof OffscreenResponse>;
