"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareTools = prepareTools;
const provider_1 = require("@ai-sdk/provider");
const vml_v1_1 = __importDefault(require("@ibm-cloud/watsonx-ai/dist/watsonx-ai-ml/vml_v1"));
function prepareTools(mode) {
    var _a;
    // when the tools array is empty, change it to undefined to prevent errors:
    const tools = ((_a = mode.tools) === null || _a === void 0 ? void 0 : _a.length) ? mode.tools : undefined;
    const toolWarnings = [];
    if (!tools) {
        return { tools: undefined, toolChoice: undefined, toolWarnings };
    }
    const watsonxTools = [];
    for (const tool of tools) {
        if (tool.type === "provider-defined") {
            toolWarnings.push({ type: "unsupported-tool", tool });
        }
        else {
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
                toolChoiceOption: vml_v1_1.default.TextChatConstants.ToolChoiceOption.AUTO,
                toolWarnings,
            };
        case "none":
            return { tools: [], toolChoiceOption: vml_v1_1.default.TextChatConstants.ToolChoiceOption.NONE, toolWarnings };
        case "required":
            return {
                tools: watsonxTools,
                toolChoiceOption: vml_v1_1.default.TextChatConstants.ToolChoiceOption.REQUIRED,
                toolWarnings,
            };
        case "tool":
            return {
                tools: watsonxTools,
                toolChoice: { type: "function", function: { name: toolChoice.toolName } },
                toolWarnings,
            };
        default: {
            const _exhaustiveCheck = type;
            throw new provider_1.UnsupportedFunctionalityError({
                functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`,
            });
        }
    }
}
