import {
  type LanguageModelV3CallOptions,
  type LanguageModelV3FunctionTool,
  type SharedV3Warning,
} from '@ai-sdk/provider';

interface WatsonxToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: unknown;
    strict?: boolean;
  };
}

type WatsonxToolChoice =
  | { tool_choice_option: 'auto' | 'none' | 'required' }
  | {
      tool_choice: {
        type: 'function';
        function: { name: string };
      };
    };

export interface PreparedTools {
  tools?: WatsonxToolDefinition[];
  toolChoice?: WatsonxToolChoice;
  toolWarnings: SharedV3Warning[];
}

/**
 * Maps the SDK's `tools` and `toolChoice` call options into the wx.ai request
 * shape. Surfaces warnings for non-function tools (wx.ai only supports
 * function tools) and forwards the optional `strict` flag when present.
 */
export function prepareWatsonxTools(
  options: Pick<LanguageModelV3CallOptions, 'tools' | 'toolChoice'>
): PreparedTools {
  const toolWarnings: SharedV3Warning[] = [];

  if (!options.tools || options.tools.length === 0) {
    return { toolWarnings };
  }

  for (const tool of options.tools) {
    if (tool.type !== 'function') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `tool type '${tool.type}'`,
        details: 'watsonx.ai only supports function tools',
      });
    }
  }

  const tools: WatsonxToolDefinition[] = options.tools
    .filter((tool): tool is LanguageModelV3FunctionTool => tool.type === 'function')
    .map((tool) => {
      const fn: WatsonxToolDefinition['function'] = {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      };
      // Forward strict when present — wx.ai honours OpenAI's strict schema flag.
      const strict = (tool as { strict?: boolean }).strict;
      if (strict != null) fn.strict = strict;
      return { type: 'function', function: fn };
    });

  let toolChoice: WatsonxToolChoice | undefined;
  if (options.toolChoice) {
    switch (options.toolChoice.type) {
      case 'auto':
      case 'none':
      case 'required':
        toolChoice = { tool_choice_option: options.toolChoice.type };
        break;
      case 'tool':
        toolChoice = {
          tool_choice: {
            type: 'function',
            function: { name: options.toolChoice.toolName },
          },
        };
        break;
    }
  }

  return { tools, toolChoice, toolWarnings };
}
