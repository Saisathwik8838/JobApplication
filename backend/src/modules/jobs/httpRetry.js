/**
 * HTTP client utility with exponential backoff and rate-limit handling.
 */

export class RateLimitError extends Error {
  /**
   * @param {string} message
   * @param {number} [retryAfter]
   */
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
    this.isRateLimited = true;
    this.retryAfter = retryAfter;
  }
}

/**
 * Executes a fetch request with exponential backoff retry.
 * Retries on network errors and HTTP 429 / 5xx responses.
 *
 * @param {string|URL} url
 * @param {RequestInit} [options={}]
 * @param {{
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 *   logger?: import('pino').Logger,
 *   sourceName?: string
 * }} [config={}]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const maxAttempts = config.maxAttempts ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 500;
  const logger = config.logger;
  const sourceName = config.sourceName || 'http-client';

  let lastError;
  let lastResponse;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);

      // Successful or client error other than 429 (e.g. 404, 400 shouldn't be retried)
      if (response.ok) {
        return response;
      }

      lastResponse = response;

      const shouldRetry = response.status === 429 || (response.status >= 500 && response.status <= 599);

      if (!shouldRetry || attempt === maxAttempts) {
        if (response.status === 429) {
          const retryHeader = response.headers.get('retry-after');
          const retrySeconds = retryHeader ? Number.parseInt(retryHeader, 10) : undefined;
          throw new RateLimitError(
            `Rate limit exceeded for ${sourceName} (HTTP 429) after ${attempt} attempt(s)`,
            Number.isFinite(retrySeconds) ? retrySeconds : undefined
          );
        }
        return response;
      }

      // Calculate backoff
      const retryAfterHeader = response.headers.get('retry-after');
      let delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      if (retryAfterHeader) {
        const parsed = Number.parseInt(retryAfterHeader, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          delayMs = Math.min(parsed * 1000, 10000);
        }
      }
      // Add slight jitter
      delayMs += Math.floor(Math.random() * 100);

      if (logger) {
        logger.warn(
          { source: sourceName, attempt, status: response.status, delayMs },
          `Retrying ${sourceName} request after backoff`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }

      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
      if (logger) {
        logger.warn(
          { source: sourceName, attempt, error: error.message, delayMs },
          `Network error contacting ${sourceName}; retrying with backoff`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError) {
    throw lastError;
  }

  return lastResponse;
}
