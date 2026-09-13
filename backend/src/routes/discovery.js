import { Router } from 'express';
import { getSourceStatus } from '../modules/jobs/sourceFactory.js';

/**
 * @param {import('../app.js').AppDependencies} dependencies
 */
export function discoveryRouter(dependencies) {
  const { queues, config, prisma, logger } = dependencies;
  const router = Router();

  /**
   * GET /api/discovery/status
   * Reports configured sources, which are active, and last run stats.
   */
  router.get('/status', async (_request, response, next) => {
    try {
      const sourceStatuses = getSourceStatus(config);
      const activeSources = sourceStatuses.filter((s) => s.active);

      const [historicalHealth, lastRun] = await Promise.all([
        prisma?.sourceHealth?.findMany
          ? prisma.sourceHealth.findMany({ orderBy: { source: 'asc' } }).catch(() => [])
          : Promise.resolve([]),
        prisma?.automationRun?.findFirst
          ? prisma.automationRun
              .findFirst({
                where: { type: 'job-discovery' },
                orderBy: { createdAt: 'desc' },
              })
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      const mergedSources = sourceStatuses.map((source) => {
        const history = historicalHealth.find((h) => h.source === source.name);
        return {
          ...source,
          lastSuccessfulRun: history?.lastSuccessfulRun || null,
          lastError: history?.lastError || null,
          jobCount: history?.jobCount ?? 0,
          healthStatus: history?.status || (source.active ? 'HEALTHY' : 'DISABLED'),
        };
      });

      return response.json({
        sources: mergedSources,
        activeSources: mergedSources.filter((s) => s.active),
        totalConfigured: sourceStatuses.length,
        totalActive: activeSources.length,
        intervalCron: config?.DISCOVERY_INTERVAL_CRON || '*/15 * * * *',
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              createdAt: lastRun.createdAt,
              completedAt: lastRun.completedAt,
              stats: lastRun.stats,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/discovery/status/:queueJobId
   * Checks the real-time status of an enqueued discovery BullMQ job.
   */
  router.get('/status/:queueJobId', async (request, response, next) => {
    try {
      const { queueJobId } = request.params;
      const discoveryQueue = queues?.['job-discovery'];

      if (!discoveryQueue) {
        return response.status(503).json({
          error: 'QUEUE_UNAVAILABLE',
          message: 'Job discovery queue is not initialized.',
        });
      }

      const job = await discoveryQueue.getJob(queueJobId);
      if (!job) {
        return response.json({
          found: false,
          id: queueJobId,
          state: 'not_found',
        });
      }

      const state = await job.getState();
      return response.json({
        found: true,
        id: job.id,
        state, // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
        progress: job.progress ?? null,
        returnvalue: job.returnvalue ?? null,
        failedReason: job.failedReason ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/discovery/run
   * Enqueues an on-demand job discovery run onto BullMQ.
   */
  router.post('/run', async (_request, response, next) => {
    try {
      const idempotencyKey = `manual-discovery-${Date.now()}`;
      const job = await queues['job-discovery'].add(
        'discover',
        { mode: 'manual', idempotencyKey },
        { jobId: idempotencyKey },
      );

      if (logger) {
        logger.info({ queueJobId: job.id }, 'Manual discovery job enqueued');
      }

      return response.status(202).json({
        queued: true,
        queueJobId: job.id,
        message: 'Job discovery run enqueued successfully.',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
