"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToWatsonxChatMessages = convertToWatsonxChatMessages;
function convertToWatsonxChatMessages(prompt) {
    return prompt.map((message) => {
        switch (message.role) {
            case "system":
                return {
                    role: message.role,
                    content: message.content,
                };
            case "assistant":
                switch (message.content[0].type) {
                    case "text":
                        return {
                            role: message.role,
                            content: message.content[0].text,
                        };
                    case "tool-call":
                        return {
                            role: message.role,
                            tool_calls: [
                                {
                                    id: message.content[0].toolCallId,
                                    type: "function",
                                    function: {
                                        name: message.content[0].toolName,
                                        arguments: JSON.stringify(message.content[0].args),
                                    },
                                },
                            ],
                        };
                    default:
                        throw new Error(`Unsupported message type: ${message.content[0].type}`);
                }
            case "user":
                return {
                    role: message.role,
                    content: message.content,
                };
            case "tool":
                return {
                    role: message.role,
                    content: JSON.stringify(message.content[0].result),
                    tool_call_id: message.content[0].toolCallId,
                };
        }
    });
}
