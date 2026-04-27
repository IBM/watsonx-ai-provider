import {
  type LanguageModelV3CallOptions,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

// --- API Types ---

interface WatsonxContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface WatsonxMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | WatsonxContentPart[];
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

// --- Message Conversion ---

export function convertToWatsonxMessages(
  options: LanguageModelV3CallOptions
): WatsonxMessage[] {
  const messages: WatsonxMessage[] = [];

  for (const message of options.prompt) {
    switch (message.role) {
      case 'system':
        messages.push({ role: 'system', content: message.content });
        break;

      case 'user': {
        const parts: WatsonxContentPart[] = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push({ type: 'text', text: part.text });
          } else if (part.type === 'file') {
            if (!part.mediaType.startsWith('image/')) {
              throw new UnsupportedFunctionalityError({
                functionality: `file parts with media type ${part.mediaType}`,
                message:
                  'watsonx.ai chat only supports image file parts; other media types are not supported.',
              });
            }
            let imageUrl: string;
            if (part.data instanceof URL) {
              imageUrl = part.data.toString();
            } else if (typeof part.data === 'string') {
              imageUrl =
                part.data.startsWith('data:') || part.data.startsWith('http')
                  ? part.data
                  : `data:${part.mediaType};base64,${part.data}`;
            } else if (part.data instanceof Uint8Array) {
              const base64 = convertUint8ArrayToBase64(part.data);
              imageUrl = `data:${part.mediaType};base64,${base64}`;
            } else {
              throw new UnsupportedFunctionalityError({
                functionality: 'file part with unknown data shape',
              });
            }
            parts.push({ type: 'image_url', image_url: { url: imageUrl } });
          }
        }
        // Collapse to a plain string when there's only one text part — keeps
        // requests compatible with wx models that don't accept content arrays.
        if (parts.length === 1 && parts[0].type === 'text') {
          messages.push({ role: 'user', content: parts[0].text ?? '' });
        } else {
          messages.push({ role: 'user', content: parts });
        }
        break;
      }

      case 'assistant': {
        const toolCalls: WatsonxMessage['tool_calls'] = [];
        let textContent = '';
        for (const part of message.content) {
          if (part.type === 'text') {
            textContent += part.text;
          } else if (part.type === 'tool-call') {
            toolCalls.push({
              id: part.toolCallId,
              type: 'function',
              function: {
                name: part.toolName,
                arguments:
                  typeof part.input === 'string'
                    ? part.input
                    : JSON.stringify(part.input),
              },
            });
          }
        }
        const msg: WatsonxMessage = { role: 'assistant' };
        if (textContent) msg.content = textContent;
        if (toolCalls.length > 0) msg.tool_calls = toolCalls;
        messages.push(msg);
        break;
      }

      case 'tool':
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            let resultContent: string;
            if (part.output.type === 'text') {
              resultContent = part.output.value;
            } else if (part.output.type === 'json') {
              resultContent = JSON.stringify(part.output.value);
            } else if (part.output.type === 'error-text') {
              resultContent = part.output.value;
            } else if (part.output.type === 'error-json') {
              resultContent = JSON.stringify(part.output.value);
            } else {
              resultContent = JSON.stringify(part.output);
            }
            messages.push({
              role: 'tool',
              tool_call_id: part.toolCallId,
              content: resultContent,
            });
          }
        }
        break;
    }
  }

  return messages;
}
