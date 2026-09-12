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

  const createdJobs = [];

  for (const source of sources) {
    try {
      const jobs = await source.discover();

      stats.discovered += jobs.length;

      for (const job of jobs) {
        const result = await ingestJob(prisma, job);

        if (result.created) {
          stats.created += 1;
          createdJobs.push(result.job);

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

  if (stats.created > 0 && queues && queues['notification']) {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const sampleList = createdJobs
        .slice(0, 15)
        .map((j) => `- ${j.title} at ${j.company} (Source: ${j.source}) -> ${frontendUrl}/jobs?source=${encodeURIComponent(j.source)}`)
        .join('\n');
      const moreText = createdJobs.length > 15 ? `\n...and ${createdJobs.length - 15} more new listings.` : '';

      let targetRecipient = process.env.NOTIFICATION_TO;
      if (!targetRecipient && prisma?.candidate) {
        const candidate = await prisma.candidate.findFirst({ select: { profile: true } }).catch(() => null);
        const prof = candidate?.profile;
        targetRecipient = prof?.identity?.email || prof?.candidate?.email;
      }
      if (!targetRecipient && prisma?.user) {
        const user = await prisma.user.findFirst({ select: { email: true } }).catch(() => null);
        targetRecipient = user?.email;
      }

      await queues['notification'].add(
        'discovery-summary',
        {
          type: 'DISCOVERY_SUMMARY',
          subject: `New jobs found: ${stats.created} added`,
          text: `Discovered ${stats.created} new real job(s) from internet sources:\n\n${sampleList}${moreText}\n\nView jobs at: ${frontendUrl}/jobs`,
          to: targetRecipient || 'candidate@example.com',
          metadata: {
            createdCount: stats.created,
            sources: [...new Set(createdJobs.map((j) => j.source))],
          },
        },
        { jobId: `discovery-summary-${Date.now()}` },
      );
    } catch (notifErr) {
      logger.warn({ error: notifErr.message }, 'Failed to enqueue discovery summary notification');
    }
  }

  return stats;
}