import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoadAPIKeyError } from '@ai-sdk/provider';
import { getIAMToken, clearTokenCache } from './watsonx-iam';
import { createMockFetch, createMockIAMResponse } from './test-utils';

// Store original fetch
const originalFetch = global.fetch;

describe('watsonx-iam', () => {
  beforeEach(() => {
    clearTokenCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getIAMToken', () => {
    it('should fetch a new token when cache is empty', async () => {
      const mockFetch = createMockFetch({
        response: createMockIAMResponse({ token: 'test-token-123' }),
      });
      global.fetch = mockFetch;

      const token = await getIAMToken('test-api-key');

      expect(token).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return cached token on subsequent calls', async () => {
      const mockFetch = createMockFetch({
        response: createMockIAMResponse({ token: 'cached-token', expiresIn: 3600 }),
      });
      global.fetch = mockFetch;

      const token1 = await getIAMToken('test-api-key');
      const token2 = await getIAMToken('test-api-key');

      expect(token1).toBe('cached-token');
      expect(token2).toBe('cached-token');
      // Should only fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should cache tokens per API key', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return createMockFetch({
          response: createMockIAMResponse({ token: `token-${callCount}` }),
        })();
      });

      const token1 = await getIAMToken('api-key-1');
      const token2 = await getIAMToken('api-key-2');
      const token1Again = await getIAMToken('api-key-1');

      expect(token1).toBe('token-1');
      expect(token2).toBe('token-2');
      expect(token1Again).toBe('token-1'); // Should use cached
      expect(global.fetch).toHaveBeenCalledTimes(2); // One for each unique key
    });

    it('should send correct request to IAM endpoint', async () => {
      const mockFetch = createMockFetch({
        response: createMockIAMResponse(),
      });
      global.fetch = mockFetch;

      await getIAMToken('my-api-key');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://iam.cloud.ibm.com/identity/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      // Check body contains correct parameters
      const callArgs = mockFetch.mock.calls[0];
      const body = callArgs[1].body as URLSearchParams;
      expect(body.get('grant_type')).toBe('urn:ibm:params:oauth:grant-type:apikey');
      expect(body.get('apikey')).toBe('my-api-key');
    });

    it('should throw LoadAPIKeyError on authentication failure', async () => {
      global.fetch = createMockFetch({
        response: { error: 'Invalid API key' },
        status: 401,
      });

      await expect(getIAMToken('invalid-key')).rejects.toThrow(LoadAPIKeyError);
    });

    it('should throw LoadAPIKeyError on server error', async () => {
      global.fetch = createMockFetch({
        response: { error: 'Server error' },
        status: 500,
      });

      await expect(getIAMToken('test-key')).rejects.toThrow(LoadAPIKeyError);
    });

    it('should prevent duplicate concurrent requests for same API key', async () => {
      let resolveFirst: () => void;
      const firstCallPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          await firstCallPromise;
        }
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(createMockIAMResponse({ token: `token-${callCount}` })),
          text: () => Promise.resolve(''),
        };
      });

      // Start two concurrent requests
      const promise1 = getIAMToken('same-key');
      const promise2 = getIAMToken('same-key');

      // Let the first request complete
      resolveFirst!();

      const [token1, token2] = await Promise.all([promise1, promise2]);

      // Both should get the same token and only one fetch should have been made
      expect(token1).toBe(token2);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearTokenCache', () => {
    it('should clear the token cache', async () => {
      const mockFetch = createMockFetch({
        response: createMockIAMResponse({ token: 'original-token' }),
      });
      global.fetch = mockFetch;

      // Get initial token
      const token1 = await getIAMToken('test-key');
      expect(token1).toBe('original-token');

      // Clear cache
      clearTokenCache();

      // Update mock to return different token
      global.fetch = createMockFetch({
        response: createMockIAMResponse({ token: 'new-token' }),
      });

      // Should fetch new token
      const token2 = await getIAMToken('test-key');
      expect(token2).toBe('new-token');
    });
  });
});
