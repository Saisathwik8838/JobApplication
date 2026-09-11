import { ingestJob } from './jobService.js';

/**
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   sources: { discover: () => Promise<object[]> }[],
 *   logger: import('pino').Logger,
 *   queues: Record<string, import('bullmq').Queue>
 * }} dependencies
 */
export async function runDiscovery({ prisma, sources, logger, queues }) {
  const stats = {
    discovered: 0,
    created: 0,
    duplicates: 0,
    errors: 0,
  };

  for (const source of sources) {
    try {
      const jobs = await source.discover();

      stats.discovered += jobs.length;

      for (const job of jobs) {
        const result = await ingestJob(prisma, job);

        if (result.created) {
          stats.created += 1;

          if (queues && queues['ai-matching']) {
            await queues['ai-matching'].add(
              'analyze',
              { jobId: result.job.id },
              {
                jobId: `ai-match-${result.job.id}`,
              },
            );
          }
        } else {
          stats.duplicates += 1;
        }
      }
    } catch (error) {
      stats.errors += 1;

      logger.error(
        {
          source: source.name,
          error: error.message,
        },
        'Job source failed',
      );
    }
  }

  logger.info(stats, 'Job discovery complete');

  return stats;
}