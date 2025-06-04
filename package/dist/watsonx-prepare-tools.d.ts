import { LanguageModelV1, LanguageModelV1CallWarning } from "@ai-sdk/provider";
import WatsonxAiMlVml_v1 from "@ibm-cloud/watsonx-ai/dist/watsonx-ai-ml/vml_v1";
export declare function prepareTools(mode: Parameters<LanguageModelV1["doGenerate"]>[0]["mode"] & {
    type: "regular";
}): {
    tools: WatsonxAiMlVml_v1.TextChatParameterTools[] | undefined;
    toolChoice?: WatsonxAiMlVml_v1.TextChatToolChoiceTool;
    toolWarnings: LanguageModelV1CallWarning[];
    toolChoiceOption?: WatsonxAiMlVml_v1.TextChatConstants.ToolChoiceOption;
};
