import { LanguageModelV1, LanguageModelV1CallWarning, UnsupportedFunctionalityError } from "@ai-sdk/provider";
import WatsonxAiMlVml_v1 from "@ibm-cloud/watsonx-ai/dist/watsonx-ai-ml/vml_v1";

export function prepareTools(
  mode: Parameters<LanguageModelV1["doGenerate"]>[0]["mode"] & {
    type: "regular";
  }
): {
  tools: WatsonxAiMlVml_v1.TextChatParameterTools[] | undefined;
  toolChoice?: WatsonxAiMlVml_v1.TextChatToolChoiceTool;
  toolWarnings: LanguageModelV1CallWarning[];
  toolChoiceOption?: WatsonxAiMlVml_v1.TextChatConstants.ToolChoiceOption;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;
  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (!tools) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const watsonxTools: WatsonxAiMlVml_v1.TextChatParameterTools[] = [];

  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      watsonxTools.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      });
    }
  }

  const toolChoice = mode.toolChoice;

  if (!toolChoice) {
    return { tools: watsonxTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case "auto":
      return {
        tools: watsonxTools,
        toolChoiceOption: WatsonxAiMlVml_v1.TextChatConstants.ToolChoiceOption.AUTO,
        toolWarnings,
      };
    case "none":
      return { tools: [], toolChoiceOption: WatsonxAiMlVml_v1.TextChatConstants.ToolChoiceOption.NONE, toolWarnings };
    case "required":
      return {
        tools: watsonxTools,
        toolChoiceOption: WatsonxAiMlVml_v1.TextChatConstants.ToolChoiceOption.REQUIRED,
        toolWarnings,
      };
    case "tool":
      return {
        tools: watsonxTools,
        toolChoice: { type: "function", function: { name: toolChoice.toolName } },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
