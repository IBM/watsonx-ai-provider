import { createWatsonx } from "watsonx-ai-provider";
import { streamText, convertToModelMessages } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const watsonx = createWatsonx();

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: watsonx("ibm/granite-4-h-small"),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
