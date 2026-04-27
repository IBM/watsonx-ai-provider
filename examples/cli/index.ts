import { createWatsonx } from "watsonx-ai-provider";
import { ModelMessage, streamText, tool } from "ai";
import * as readline from "node:readline/promises";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

const watsonx = createWatsonx();

const weatherTool = tool({
  description: "Get the weather in a location",
  inputSchema: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

async function main() {
  while (true) {
    messages.push({ role: "user", content: await terminal.question("You: ") });

    const result = streamText({
      model: watsonx("ibm/granite-4-h-small"),
      messages,
      tools: {
        weather: weatherTool,
      },
    });

    process.stdout.write("\nAssistant: ");

    for await (const delta of result.textStream) {
      process.stdout.write(delta);
    }

    process.stdout.write("\n\n");
    messages.push(...(await result.response).messages);
  }
}

main().catch(console.error);
