import { describe, expect, it, vi } from 'vitest';
import { scheduleDiscovery } from '../../src/queues/queues.js';

describe('scheduleDiscovery Unit Tests', () => {
  it('registers morning and incremental repeatable discovery jobs with default 15-minute cron', async () => {
    const mockUpsert = vi.fn().mockResolvedValue(true);
    const mockQueues = {
      'job-discovery': {
        upsertJobScheduler: mockUpsert,
      },
    };

    await scheduleDiscovery(mockQueues);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenNthCalledWith(
      1,
      'morning-full-discovery',
      { pattern: '0 8 * * *' },
      expect.objectContaining({ name: 'discover', data: { mode: 'full', idempotencyKey: 'scheduled-morning' } })
    );
    expect(mockUpsert).toHaveBeenNthCalledWith(
      2,
      'incremental-discovery',
      { pattern: '*/15 * * * *' },
      expect.objectContaining({ name: 'discover', data: { mode: 'incremental', idempotencyKey: 'scheduled-incremental' } })
    );
  });

  it('respects custom DISCOVERY_INTERVAL_CRON when provided in config', async () => {
    const mockUpsert = vi.fn().mockResolvedValue(true);
    const mockQueues = {
      'job-discovery': {
        upsertJobScheduler: mockUpsert,
      },
    };

    await scheduleDiscovery(mockQueues, { DISCOVERY_INTERVAL_CRON: '*/30 * * * *' });

    expect(mockUpsert).toHaveBeenNthCalledWith(
      2,
      'incremental-discovery',
      { pattern: '*/30 * * * *' },
      expect.anything()
    );
  });
});
