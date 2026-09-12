import { createHash } from 'node:crypto';
import { jobMatchResultSchema } from '@job-agent/shared-schemas';
import { evaluateEligibility } from '../eligibility/eligibilityEngine.js';

/** @param {{description:string}} job @param {string} profileVersion @returns {string} */
export function matchCacheKey(job, profileVersion) { return createHash('sha256').update(`${job.description}\n${profileVersion}`).digest('hex'); }
/** @param {{prisma:import('@prisma/client').PrismaClient, provider:import('../ai/types.js').LLMProvider, profile:import('@job-agent/shared-schemas').CandidateProfile, profileVersion:string, resumeText:string, job:any, logger:import('pino').Logger}} dependencies */
export async function analyzeJob(dependencies) {
  const { prisma, provider, profile, profileVersion, resumeText, job, logger, userId } = dependencies;
  const eligibility = evaluateEligibility(profile, job);
  if (!eligibility.eligible) {
    if (prisma && prisma.job && job.id) {
      await prisma.job.update({ where: { id: job.id }, data: { status: 'REJECTED' } }).catch(() => {});
    }
    logger.info({ jobId: job.id, hardFailures: eligibility.hardFailures }, 'Job ineligible; marked REJECTED');
    return { eligibility, match: null, cached: false };
  }
  const cacheKey = matchCacheKey(job, profileVersion);
  const cached = await prisma.jobMatch.findUnique({ where: { cacheKey } });
  if (cached) return { eligibility, match: jobMatchResultSchema.parse(cached.result), cached: true };
  const response = await provider.analyzeJob({ profile, resumeText, job });
  const { _meta, ...match } = response;
  const parsed = jobMatchResultSchema.parse(match);

  // Location preference boost: give real score advantage to candidate preferred locations
  const preferredLocations = profile.preferences?.locations || [];
  const jobLoc = (job.location || '').toLowerCase();
  const isPreferredLoc = preferredLocations.some((prefLoc) => {
    const p = prefLoc.toLowerCase().trim();
    return p && (jobLoc.includes(p) || p.includes(jobLoc));
  });

  let matchScore = parsed.matchScore;
  const strengths = [...parsed.strengths];
  if (isPreferredLoc && jobLoc) {
    matchScore = Math.min(100, matchScore + 10);
    strengths.push(`Location matches candidate preference: ${job.location}`);
  }

  const validated = {
    ...parsed,
    matchScore,
    strengths,
  };
  await prisma.$transaction([
    prisma.jobMatch.create({
      data: {
        jobId: job.id,
        userId: userId ?? null,
        profileVersion,
        cacheKey,
        result: validated,
        provider: _meta.provider,
        model: _meta.model,
        promptVersion: _meta.promptVersion,
        tokenUsage: _meta.usage ?? undefined,
      },
    }),
    prisma.job.update({ where: { id: job.id }, data: { status: 'MATCHED' } }),
  ]);
  logger.info({ jobId: job.id, matchScore: validated.matchScore, provider: _meta.provider }, 'Job matching complete');
  return { eligibility, match: validated, cached: false };
}
