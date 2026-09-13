import { jobCreateSchema } from '@job-agent/shared-schemas';
import { findDuplicate } from './deduplication.js';
import { isIndiaRelevant } from './locationFilter.js';

export class DuplicateJobError extends Error { constructor(message = 'This job is already known.') { super(message); this.name = 'DuplicateJobError'; this.status = 409; this.code = 'DUPLICATE_JOB'; } }

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {unknown} payload
 * @param {{ indiaOnly?: boolean }} [options]
 */
export async function ingestJob(prisma, payload, options = {}) {
  const input = jobCreateSchema.parse(payload);

  const indiaOnly = options.indiaOnly ?? (process.env.INDIA_ONLY !== 'false');
  if (indiaOnly && !isIndiaRelevant(input, { indiaOnly })) {
    return { job: null, created: false, rejectedReason: 'NOT_INDIA_RELEVANT' };
  }

  const { duplicate, canonicalUrl, contentHash } = await findDuplicate(prisma, input);
  if (duplicate) return { job: duplicate, created: false };
  const job = await prisma.job.create({ data: { ...input, canonicalUrl, contentHash, postedAt: input.postedAt ?? null } });
  return { job, created: true };
}

/** @param {import('@prisma/client').PrismaClient} prisma @param {string} id */
export async function getJobOrThrow(prisma, id) {
  const job = await prisma.job.findUnique({ where: { id }, include: { matches: { orderBy: { createdAt: 'desc' }, take: 1 }, applications: true, requirements: true } });
  if (!job) { const error = new Error('Job not found.'); error.status = 404; error.code = 'JOB_NOT_FOUND'; throw error; }
  return job;
}
