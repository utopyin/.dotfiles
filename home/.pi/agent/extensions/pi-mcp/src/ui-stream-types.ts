import { z } from "zod";

export const UI_STREAM_HOST_CONTEXT_KEY = "pi-mcp-adapter/stream";
export const UI_STREAM_REQUEST_META_KEY = "pi-mcp-adapter/stream-token";
export const UI_STREAM_RESULT_PATCH_METHOD =
  "notifications/pi-mcp-adapter/ui-result-patch";
export const SERVER_STREAM_RESULT_PATCH_METHOD =
  "notifications/pi-mcp-adapter/result-patch";
export const UI_STREAM_STRUCTURED_CONTENT_KEY = "pi-mcp-adapter/stream";
export const uiStreamModeSchema = z.enum(["eager", "stream-first"]);
export type UiStreamMode = z.infer<typeof uiStreamModeSchema>;
export const visualizationStreamPhaseSchema = z.enum([
  "shell",
  "narrative",
  "structure",
  "detail",
  "settled",
]);
export type VisualizationStreamPhase = z.infer<
  typeof visualizationStreamPhaseSchema
>;
export const visualizationStreamFrameTypeSchema = z.enum([
  "patch",
  "checkpoint",
  "final",
]);
export type VisualizationStreamFrameType = z.infer<
  typeof visualizationStreamFrameTypeSchema
>;
export const visualizationStreamStatusSchema = z.enum(["ok", "error"]);
export type VisualizationStreamStatus = z.infer<
  typeof visualizationStreamStatusSchema
>;
const looseRecordSchema = z.record(z.string(), z.unknown());
const looseArraySchema = z.array(z.unknown());
export const uiStreamHostContextSchema = z.object({
  intermediateResultPatches: z.boolean(),
  mode: uiStreamModeSchema,
  partialInput: z.boolean(),
  streamId: z.string().min(1),
});
export type UiStreamHostContext = z.infer<typeof uiStreamHostContextSchema>;
export const visualizationStreamEnvelopeSchema = z.object({
  checkpoint: looseRecordSchema.optional(),
  frameType: visualizationStreamFrameTypeSchema,
  message: z.string().optional(),
  phase: visualizationStreamPhaseSchema,
  sequence: z.number().int().nonnegative(),
  spec: looseRecordSchema.optional(),
  status: visualizationStreamStatusSchema,
  streamId: z.string().min(1),
});
export type VisualizationStreamEnvelope = z.infer<
  typeof visualizationStreamEnvelopeSchema
>;
export const uiStreamCallToolResultSchema = z
  .object({
    _meta: looseRecordSchema.optional(),
    content: looseArraySchema.optional(),
    isError: z.boolean().optional(),
    structuredContent: looseRecordSchema.optional(),
  })
  .passthrough();
export type UiStreamCallToolResult = z.infer<
  typeof uiStreamCallToolResultSchema
>;
export const uiStreamResultPatchNotificationSchema = z.object({
  method: z.literal(UI_STREAM_RESULT_PATCH_METHOD),
  params: uiStreamCallToolResultSchema,
});
export type UiStreamResultPatchNotification = z.infer<
  typeof uiStreamResultPatchNotificationSchema
>;
export const serverStreamResultPatchNotificationSchema = z.object({
  method: z.literal(SERVER_STREAM_RESULT_PATCH_METHOD),
  params: z.object({
    result: uiStreamCallToolResultSchema,
    streamToken: z.string().min(1),
  }),
});
export type ServerStreamResultPatchNotification = z.infer<
  typeof serverStreamResultPatchNotificationSchema
>;
export interface UiStreamSummary {
  streamId: string;
  mode: UiStreamMode;
  frames: number;
  phases: VisualizationStreamPhase[];
  finalStatus?: VisualizationStreamStatus;
  lastMessage?: string;
}
export const getUiStreamHostContext = (
  hostContext: Record<string, unknown> | undefined
): UiStreamHostContext | undefined => {
  const candidate = hostContext?.[UI_STREAM_HOST_CONTEXT_KEY];
  const parsed = uiStreamHostContextSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
};
export const getVisualizationStreamEnvelope = (
  structuredContent: unknown
): VisualizationStreamEnvelope | undefined => {
  if (
    !structuredContent ||
    typeof structuredContent !== "object" ||
    Array.isArray(structuredContent)
  ) {
    return undefined;
  }
  const candidate = (structuredContent as Record<string, unknown>)[
    UI_STREAM_STRUCTURED_CONTENT_KEY
  ];
  const parsed = visualizationStreamEnvelopeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
};
