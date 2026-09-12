import { Router } from 'express';
import { isSampleFallbackActive } from '../modules/jobs/sourceFactory.js';

/** @param {import('../app.js').AppDependencies} dependencies */
export function dashboardRouter({ prisma, sources = [] }) {
  const router = Router();

  router.get('/', async (request, response, next) => {
    try {
      const userId = request.user?.id;
      const isSampleSourceActive = isSampleFallbackActive(sources);
      const [jobs, applications, highQualityMatches, candidateJobs] = await Promise.all([
        prisma.job.groupBy({ by: ['status'], _count: true }),
        prisma.application.groupBy({
          by: ['status'],
          where: userId ? { userId } : {},
          _count: true,
        }),
        prisma.jobMatch.count({
          where: {
            ...(userId ? { userId } : {}),
            result: { path: ['matchScore'], gte: 75 },
          },
        }),
        prisma.job.findMany({
          where: {
            status: { not: 'REJECTED' },
            matches: { some: userId ? { userId } : {} },
          },
          include: {
            matches: {
              where: userId ? { userId } : {},
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            applications: {
              where: userId ? { userId } : {},
              take: 1,
            },
          },
        }),
      ]);

      const get = (items, status) => items?.find?.((item) => item.status === status)?._count ?? 0;

      const topMatches = (candidateJobs || [])
        .filter((job) => job.status !== 'REJECTED' && job.matches && job.matches.length > 0 && job.matches[0]?.result)
        .sort((a, b) => {
          const scoreA = Number(a.matches[0]?.result?.matchScore ?? 0);
          const scoreB = Number(b.matches[0]?.result?.matchScore ?? 0);
          return scoreB - scoreA;
        })
        .slice(0, 10)
        .map((job) => {
          const match = job.matches[0]?.result || {};
          const application = job.applications?.[0];
          return {
            id: job.id,
            company: job.company,
            title: job.title,
            location: job.location,
            url: job.url,
            matchScore: match.matchScore ?? 0,
            recommendation: match.recommendation ?? 'review',
            explanation: match.explanation ?? '',
            applicationStatus: application?.status ?? job.status,
          };
        });

      response.json({
        jobsDiscovered: (jobs || []).reduce((total, item) => total + item._count, 0),
        matching: get(jobs, 'MATCHED'),
        highQualityMatches: highQualityMatches ?? 0,
        prepared: get(applications, 'APPLICATION_PREPARED'),
        awaitingApproval: get(applications, 'AWAITING_APPROVAL'),
        submitted: get(applications, 'SUBMITTED'),
        failed: get(applications, 'FAILED'),
        interviews: get(applications, 'INTERVIEW'),
        topMatches,
        isSampleSourceActive,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
