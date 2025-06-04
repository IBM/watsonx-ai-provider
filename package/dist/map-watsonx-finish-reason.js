"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapWatsonxFinishReason = mapWatsonxFinishReason;
function mapWatsonxFinishReason(finishReason) {
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
