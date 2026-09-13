import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, RateLimitError } from '../../src/modules/jobs/httpRetry.js';

describe('HTTP Retry Utility', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('succeeds on first attempt when response is ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const response = await fetchWithRetry('https://example.com/api', {}, { maxAttempts: 3, baseDelayMs: 10 });
    expect(response.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 error and succeeds on subsequent attempt', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ data: [] }),
      });

    const response = await fetchWithRetry('https://example.com/api', {}, { maxAttempts: 3, baseDelayMs: 10 });
    expect(response.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network TypeError and succeeds on subsequent attempt', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ data: [] }),
      });

    const response = await fetchWithRetry('https://example.com/api', {}, { maxAttempts: 3, baseDelayMs: 10 });
    expect(response.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError on 429 when max attempts reached', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '1' }),
    });

    await expect(
      fetchWithRetry('https://example.com/api', {}, { maxAttempts: 2, baseDelayMs: 5, sourceName: 'test-api' })
    ).rejects.toThrow(RateLimitError);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
