import { LoadAPIKeyError } from '@ai-sdk/provider';

// Cache tokens per API key to support multiple provider instances
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

// Track in-flight token requests to prevent duplicate fetches
const pendingRequests = new Map<string, Promise<string>>();

export async function getIAMToken(apiKey: string): Promise<string> {
  // Check cache with 5 min buffer
  const cached = tokenCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  // Check if there's already a pending request for this API key
  const pending = pendingRequests.get(apiKey);
  if (pending) {
    return pending;
  }

  // Create and track the token fetch promise
  const fetchPromise = fetchIAMToken(apiKey);
  pendingRequests.set(apiKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    pendingRequests.delete(apiKey);
  }
}

async function fetchIAMToken(apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: apiKey,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new LoadAPIKeyError({
      message: `Failed to get IBM IAM token: ${response.status} - ${text}`,
    });
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache.set(apiKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

// For testing - allows clearing the cache
export function clearTokenCache(): void {
  tokenCache.clear();
}

// Invalidate the cached token for a specific API key. Call when the server
// returns 401 so the next getIAMToken() re-fetches instead of re-sending the
// revoked token.
export function invalidateIAMToken(apiKey: string): void {
  tokenCache.delete(apiKey);
}
