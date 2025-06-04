import { type WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { type LanguageModelV1Prompt } from "ai";

export function convertToWatsonxChatMessages(prompt: LanguageModelV1Prompt) {
  return prompt.map((message) => {
    switch (message.role) {
      case "system":
        return {
          role: message.role,
          content: message.content,
        } as WatsonXAI.TextChatMessagesTextChatMessageSystem;
      case "assistant":
        switch (message.content[0].type) {
          case "text":
            return {
              role: message.role,
              content: message.content[0].text,
            } as WatsonXAI.TextChatMessagesTextChatMessageAssistant;
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
            } as WatsonXAI.TextChatMessagesTextChatMessageAssistant;
          default:
            throw new Error(`Unsupported message type: ${message.content[0].type}`);
        }
      case "user":
        return {
          role: message.role,
          content: message.content,
        } as WatsonXAI.TextChatMessagesTextChatMessageUser;
      case "tool":
        return {
          role: message.role,
          content: JSON.stringify(message.content[0].result),
          tool_call_id: message.content[0].toolCallId,
        } as WatsonXAI.TextChatMessagesTextChatMessageTool;
    }
  });
}
