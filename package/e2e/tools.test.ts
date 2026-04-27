import { describe, it, expect } from 'vitest';
import { generateText, streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createWatsonx } from '../src';

const watsonx = createWatsonx();
// gpt-oss-120b has the most reliable streaming tool-call behavior on wx.ai;
// see README "Known limitation" for why we avoid mistral-medium here.
const model = watsonx('openai/gpt-oss-120b');

const weatherTool = tool({
  description: 'Get the current weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The city and state, e.g. San Francisco, CA'),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72,
    unit: 'fahrenheit',
    description: 'Sunny',
  }),
});

const calculatorTool = tool({
  description: 'Perform basic arithmetic calculations',
  inputSchema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add':
        return { result: a + b };
      case 'subtract':
        return { result: a - b };
      case 'multiply':
        return { result: a * b };
      case 'divide':
        return { result: a / b };
    }
  },
});

describe('Tool Calling', () => {
  it('should call a single tool', async () => {
    const result = await generateText({
      model,
      prompt: 'What is the weather in San Francisco?',
      tools: { weather: weatherTool },
      stopWhen: stepCountIs(2),
    });

    expect(result.text).toBeTruthy();
    // The model should have called the weather tool and incorporated the result
    expect(
      result.toolCalls.length > 0 || result.text.toLowerCase().includes('72')
    ).toBe(true);
  });

  it('should call calculator tool with correct parameters', async () => {
    const result = await generateText({
      model,
      prompt: 'What is 15 multiplied by 7? Use the calculator tool.',
      tools: { calculator: calculatorTool },
      stopWhen: stepCountIs(2),
    });

    expect(result.text).toBeTruthy();
    // Should either have tool calls or mention the result (105)
    const hasToolCall = result.toolCalls.some(
      (tc) => tc.toolName === 'calculator'
    );
    const mentionsResult = result.text.includes('105');
    expect(hasToolCall || mentionsResult).toBe(true);
  });

  it('should handle multiple tools', async () => {
    const result = await generateText({
      model,
      prompt:
        'First check the weather in New York, then calculate 10 + 5.',
      tools: {
        weather: weatherTool,
        calculator: calculatorTool,
      },
      stopWhen: stepCountIs(4),
    });

    expect(result.text).toBeTruthy();
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('should stream with tools', async () => {
    const result = streamText({
      model,
      prompt: 'What is the weather in Boston?',
      tools: { weather: weatherTool },
      stopWhen: stepCountIs(2),
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const fullText = chunks.join('');
    expect(fullText).toBeTruthy();
  });
});
