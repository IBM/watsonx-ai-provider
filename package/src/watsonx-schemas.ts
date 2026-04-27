import { z } from 'zod';

// --- Error Schema (shared) ---

export const watsonxErrorSchema = z
  .object({
    errors: z
      .array(
        z
          .object({
            code: z.string(),
            message: z.string(),
            more_info: z.string().optional(),
          })
          .loose()
      )
      .optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    // wx.ai variants return either; coerce to one via preprocess.
    statusCode: z.number().optional(),
  })
  .loose()
  .transform((val) => {
    const raw = val as { status_code?: number };
    return { ...val, statusCode: val.statusCode ?? raw.status_code };
  });

// --- Chat Response Schema ---
// Top-level schema is strict so unknown fields surface in dev; nested objects
// remain .loose() to tolerate forward-compatible additions from wx.ai.

export const watsonxChatResponseSchema = z.object({
  id: z.string().nullish(),
  model_id: z.string().nullish(),
  created: z.number().nullish(),
  choices: z.array(
    z
      .object({
        index: z.number(),
        message: z
          .object({
            role: z.literal('assistant'),
            content: z.string().nullish(),
            reasoning_content: z.string().nullish(),
            tool_calls: z
              .array(
                z
                  .object({
                    id: z.string(),
                    type: z.literal('function'),
                    function: z
                      .object({
                        name: z.string(),
                        arguments: z.string(),
                      })
                      .loose(),
                  })
                  .loose()
              )
              .optional(),
          })
          .loose(),
        finish_reason: z.string().nullish(),
      })
      .loose()
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
      completion_tokens_details: z
        .object({ reasoning_tokens: z.number().optional() })
        .loose()
        .optional(),
    })
    .loose(),
});

// --- Chat Stream Chunk Schema ---
// Validates each SSE `data: {...}` payload. Fields are mostly optional because
// deltas are sparse — a single chunk may carry only usage, only content, only
// a tool_calls fragment, or only a finish_reason.

export const watsonxChatChunkSchema = z.object({
  id: z.string().nullish(),
  model_id: z.string().nullish(),
  created: z.number().nullish(),
  choices: z
    .array(
      z
        .object({
          index: z.number().optional(),
          delta: z
            .object({
              role: z.string().optional(),
              content: z.string().nullish(),
              reasoning_content: z.string().nullish(),
              tool_calls: z
                .array(
                  z
                    .object({
                      index: z.number().optional(),
                      id: z.string().optional(),
                      type: z.string().optional(),
                      function: z
                        .object({
                          name: z.string().optional(),
                          arguments: z.string().optional(),
                        })
                        .loose()
                        .optional(),
                    })
                    .loose()
                )
                .optional(),
            })
            .loose()
            .optional(),
          finish_reason: z.string().nullish(),
        })
        .loose()
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number().optional(),
      completion_tokens_details: z
        .object({ reasoning_tokens: z.number().optional() })
        .loose()
        .optional(),
    })
    .loose()
    .optional(),
});

// --- Embedding Response Schema ---

export const watsonxEmbeddingResponseSchema = z.object({
  model_id: z.string().nullish(),
  results: z.array(
    z
      .object({
        embedding: z.array(z.number()),
        input_token_count: z.number().optional(),
      })
      .loose()
  ),
  input_token_count: z.number().optional(),
});
