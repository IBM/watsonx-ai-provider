# watsonx-ai-provider

watsonx-ai-provider provides [watsonx.ai](https://www.ibm.com/products/watsonx-ai) language model support for Vercel’s [AI SDK](https://sdk.vercel.ai/).

To use this in your code:

```sh
npm i watsonx-ai-provider
```

```typescript
import { generateText } from "ai";
import { createWatsonxProvider } from "watsonx-ai-provider";

const watsonx = createWatsonxProvider({ projectId: process.env.WATSONX_AI_PROJECT_ID });

const result = await generateText({
  model: watsonx("ibm/granite-3-8b-instruct"),
  messages: [{ role: "user", content: "Tell me a joke about IBM." }],
});

console.log(result.text);
```

The above example relies on the following environment variables being set:

```
WATSONX_AI_AUTH_TYPE=iam
WATSONX_AI_APIKEY=YOUR_API_KEY_HERE
WATSONX_AI_PROJECT_ID=YOUR_PROJECT_ID_HERE
```

You can also programatically authenticate, such as with:

```typescript
import { IamAuthenticator } from "ibm-cloud-sdk-core";

const watsonx = createWatsonxProvider({
  authenticator: new IamAuthenticator({
    apikey: "YOUR_KEY",
  })
  projectId: process.env.WATSONX_AI_PROJECT_ID,
});
```

See the [custom providers](https://sdk.vercel.ai/docs/foundations/providers-and-models) section of the AI SDK documentation for details.
