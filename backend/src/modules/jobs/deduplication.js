import { canonicalizeUrl, contentHash, jobFingerprint } from './hash.js';

/** @param {import('@prisma/client').PrismaClient} prisma @param {{source:string,sourceJobId?:string,company:string,title:string,location?:string|null,description:string,url:string}} input */
export async function findDuplicate(prisma, input) {
  const canonicalUrl = canonicalizeUrl(input.url); const hash = contentHash(input.description); const fingerprint = jobFingerprint(input);
  const conditions = [{ canonicalUrl }, { contentHash: hash }, { company: input.company, title: input.title, location: input.location ?? null }];
  if (input.sourceJobId) conditions.push({ source: input.source, sourceJobId: input.sourceJobId });
  const duplicate = await prisma.job.findFirst({ where: { OR: conditions } });
  return { duplicate, canonicalUrl, contentHash: hash, fingerprint };
}
