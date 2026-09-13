import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { runDiscovery } from '../../src/modules/jobs/discoveryService.js';
import { RateLimitError } from '../../src/modules/jobs/httpRetry.js';

describe('Discovery Service SourceHealth Tracking', () => {
  const logger = pino({ enabled: false });

  it('records HEALTHY status and jobCount on successful discovery', async () => {
    const mockHealthUpsert = vi.fn().mockResolvedValue({});
    const mockPrisma = {
      job: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'job-1', source: 'adzuna' }),
      },
      sourceHealth: {
        upsert: mockHealthUpsert,
      },
    };

    const mockSource = {
      name: 'adzuna',
      discover: vi.fn().mockResolvedValue([
        {
          source: 'adzuna',
          sourceJobId: '123',
          company: 'Acme India',
          title: 'Software Engineer',
          description: 'Full stack development role in Bengaluru.',
          url: 'https://example.com/job/123',
          canonicalUrl: 'https://example.com/job/123',
          contentHash: 'hash123',
        },
      ]),
    };

    const stats = await runDiscovery({
      prisma: mockPrisma,
      sources: [mockSource],
      logger,
      queues: {},
    });

    expect(stats.discovered).toBe(1);
    expect(mockHealthUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'adzuna' },
        create: expect.objectContaining({
          source: 'adzuna',
          status: 'HEALTHY',
          jobCount: 1,
        }),
      })
    );
  });

  it('records RATE_LIMITED status and error message when source encounters 429', async () => {
    const mockHealthUpsert = vi.fn().mockResolvedValue({});
    const mockPrisma = {
      job: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      sourceHealth: {
        upsert: mockHealthUpsert,
      },
    };

    const mockSource = {
      name: 'ncs',
      discover: vi.fn().mockRejectedValue(new RateLimitError('Rate limit exceeded (HTTP 429)')),
    };

    const stats = await runDiscovery({
      prisma: mockPrisma,
      sources: [mockSource],
      logger,
      queues: {},
    });

    expect(stats.errors).toBe(1);
    expect(mockHealthUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'ncs' },
        update: expect.objectContaining({
          status: 'RATE_LIMITED',
          lastError: expect.stringContaining('Rate limit exceeded'),
        }),
      })
    );
  });
});
