import { createWatsonxProvider } from "watsonx-ai-provider";
import { streamText } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;
const watsonx = createWatsonxProvider({ projectId: process.env.WATSONX_AI_PROJECT_ID });

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: watsonx("ibm/granite-3-8b-instruct"),
    messages,
  });

  return result.toDataStreamResponse();
}
