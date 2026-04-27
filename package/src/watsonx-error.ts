import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { watsonxErrorSchema } from './watsonx-schemas';

export const watsonxErrorHandler = createJsonErrorResponseHandler({
  errorSchema: watsonxErrorSchema,
  errorToMessage: (error) => {
    if (error.errors?.[0]?.message) {
      return error.errors[0].message;
    }
    return error.message ?? error.error ?? 'Unknown watsonx.ai error';
  },
  isRetryable: (response, error) => {
    // Rate limiting
    if (response.status === 429) return true;
    // Server errors
    if (response.status >= 500) return true;
    // Check error codes
    const code = error?.errors?.[0]?.code;
    if (code === 'rate_limit_exceeded' || code === 'service_unavailable')
      return true;
    return false;
  },
});
