# Example chatbot ui with watsonx-ai-provider and Next.js

## Setup

Copy the example env file and fill in your watsonx.ai credentials:

```sh
cp .env.example .env
# edit .env with your real values
```

You'll need:

- **`WATSONX_AI_APIKEY`** — from [IBM Cloud → Access (IAM) → API keys](https://cloud.ibm.com/iam/apikeys)
- **`WATSONX_AI_PROJECT_ID`** — from your watsonx.ai project's Manage tab

## Run

```sh
npm i
npm run start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.
