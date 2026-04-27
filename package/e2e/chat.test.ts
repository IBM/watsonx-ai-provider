import { describe, it, expect } from 'vitest';
import { generateText, streamText } from 'ai';
import { createWatsonx } from '../src';

const watsonx = createWatsonx();
const model = watsonx('ibm/granite-4-h-small');

describe('Chat Completion', () => {
  it('should generate text with generateText', async () => {
    const result = await generateText({
      model,
      prompt: 'What is the capital of France? Answer in one word.',
    });

    expect(result.text).toBeTruthy();
    expect(result.text.toLowerCase()).toContain('paris');
    expect(result.usage).toBeDefined();
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
    expect(result.usage?.outputTokens).toBeGreaterThan(0);
  });

  it('should generate text with messages', async () => {
    const result = await generateText({
      model,
      messages: [
        { role: 'user', content: 'Say "hello world" and nothing else.' },
      ],
    });

    expect(result.text).toBeTruthy();
    expect(result.text.toLowerCase()).toContain('hello');
  });

  it('should stream text with streamText', async () => {
    const result = streamText({
      model,
      prompt: 'Count from 1 to 5.',
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const fullText = chunks.join('');
    expect(fullText).toBeTruthy();
    expect(fullText).toMatch(/1.*2.*3.*4.*5/s);

    const response = await result.response;
    expect(response.messages).toBeDefined();
  });

  it('should handle system messages', async () => {
    const result = await generateText({
      model,
      system: 'You are a helpful assistant that always responds in JSON format.',
      prompt: 'What is 2+2? Respond with {"answer": <number>}',
    });

    expect(result.text).toBeTruthy();
    // Should contain JSON-like structure
    expect(result.text).toMatch(/\{.*\}/s);
  });

  it('should respect maxOutputTokens setting', async () => {
    const result = await generateText({
      model,
      prompt: 'Write a very long story about a dragon.',
      maxOutputTokens: 20,
    });

    expect(result.text).toBeTruthy();
    // With maxOutputTokens=20, response should be relatively short
    expect(result.usage?.outputTokens).toBeLessThanOrEqual(25); // some buffer
  });
});
