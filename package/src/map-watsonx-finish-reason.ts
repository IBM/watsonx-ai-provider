import { type LanguageModelV1FinishReason } from "@ai-sdk/provider";

export function mapWatsonxFinishReason(finishReason: string | null | undefined): LanguageModelV1FinishReason {
  switch (finishReason) {
    case "eos_token":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "error":
      return "error";
    case "tool_calls":
      return "tool-calls";
    default:
      return "other";
  }
}
