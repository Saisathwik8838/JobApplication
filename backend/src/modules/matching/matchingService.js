import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import { jobMatchResultSchema } from '@job-agent/shared-schemas';
import { evaluateEligibility } from '../eligibility/eligibilityEngine.js';
import {
  LLMResponseInvalidError,
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthError,
} from '../ai/errors.js';

export {
  LLMResponseInvalidError,
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthError,
};

/** @param {{description:string}} job @param {string} profileVersion @returns {string} */
export function matchCacheKey(job, profileVersion) {
  return createHash('sha256').update(`${job.description}\n${profileVersion}`).digest('hex');
}

/**
 * Analyzes candidate match against a job posting with eligibility gating and robust LLM retry.
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   provider: import('../ai/types.js').LLMProvider,
 *   profile: import('@job-agent/shared-schemas').CandidateProfile,
 *   profileVersion: string,
 *   resumeText: string,
 *   job: any,
 *   logger: import('pino').Logger,
 *   userId?: string
 * }} dependencies
 */
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
  if (prisma && prisma.jobMatch) {
    const cached = await prisma.jobMatch.findUnique({ where: { cacheKey } }).catch(() => null);
    if (cached && cached.result) {
      return { eligibility, match: cached.result, cached: true };
    }
  }

  let response;
  let parsed;
  let responseMeta;
  let parseAttempts = 0;
  const maxParseAttempts = 2;

  while (parseAttempts < maxParseAttempts) {
    parseAttempts += 1;
    const isRetry = parseAttempts > 1;

    try {
      response = await provider.analyzeJob({
        profile,
        resumeText,
        job,
        strictRetry: isRetry,
      });

      if (!response || typeof response !== 'object') {
        throw new LLMResponseInvalidError('LLM returned non-object response.');
      }

      const { _meta, ...match } = response;
      responseMeta = _meta;
      parsed = jobMatchResultSchema.parse(match);
      break; // Schema parsed successfully
    } catch (err) {
      const isSchemaError =
        err instanceof ZodError ||
        err.name === 'ZodError' ||
        err instanceof LLMResponseInvalidError;

      if (isSchemaError && parseAttempts < maxParseAttempts) {
        logger.warn(
          { jobId: job.id, attempt: parseAttempts, error: err.message },
          'LLM response schema validation failed; retrying once with strict instructions'
        );
        continue;
      }

      // Mark MATCH_FAILED in DB on final failure
      if (prisma && prisma.job && job.id) {
        await prisma.job.update({ where: { id: job.id }, data: { status: 'MATCH_FAILED' } }).catch(() => {});
      }

      logger.warn({ jobId: job.id, err: err.message }, 'Job matching failed; marked MATCH_FAILED');

      if (isSchemaError) {
        throw new LLMResponseInvalidError(
          `LLM response failed schema validation: ${err.message}`,
          err instanceof ZodError ? err.flatten() : undefined
        );
      }

      if (err.code === 'LLM_RATE_LIMIT' || err.status === 429) {
        throw err;
      }
      if (err.code === 'LLM_AUTH_ERROR' || err.status === 401) {
        throw err;
      }
      if (err.name === 'SyntaxError' || err.message?.toLowerCase().includes('json')) {
        throw new LLMResponseInvalidError(`LLM returned malformed JSON: ${err.message}`, err);
      }

      throw new LLMProviderError(`LLM provider error during analysis: ${err.message}`, err);
    }
  }

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

  if (prisma && prisma.jobMatch && prisma.job) {
    await prisma.$transaction([
      prisma.jobMatch.create({
        data: {
          jobId: job.id,
          userId: userId ?? null,
          profileVersion,
          cacheKey,
          result: validated,
          provider: responseMeta?.provider || 'llm',
          model: responseMeta?.model || 'default',
          promptVersion: responseMeta?.promptVersion || '1.0',
          tokenUsage: responseMeta?.usage ?? undefined,
        },
      }),
      prisma.job.update({ where: { id: job.id }, data: { status: 'MATCHED' } }),
    ]);
  }

  logger.info({ jobId: job.id, matchScore: validated.matchScore, provider: responseMeta?.provider }, 'Job matching complete');
  return { eligibility, match: validated, cached: false };
}
