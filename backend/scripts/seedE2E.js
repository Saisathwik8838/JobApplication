import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const profileRes = await fetch('http://localhost:3000/api/profile').then((r) => r.json());
  const profileVersion = profileRes.profileVersion;
  console.log('Profile version:', profileVersion);

  // 1. Ineligible Job
  await prisma.job.upsert({
    where: { canonicalUrl: 'https://example.com/jobs/e2e-ineligible' },
    update: {
      title: 'Senior Architect (Ineligible)',
      company: 'Legacy Global Corp',
      location: 'Tokyo, Japan',
      description: "Requires 12+ years of experience and a master's degree. Location in Tokyo, Japan.",
      status: 'DISCOVERED',
    },
    create: {
      id: 'e2e-job-ineligible',
      source: 'manual',
      sourceJobId: 'e2e-ineligible',
      title: 'Senior Architect (Ineligible)',
      company: 'Legacy Global Corp',
      location: 'Tokyo, Japan',
      description: "Requires 12+ years of experience and a master's degree. Location in Tokyo, Japan.",
      url: 'https://example.com/jobs/e2e-ineligible',
      canonicalUrl: 'https://example.com/jobs/e2e-ineligible',
      contentHash: 'hash-e2e-ineligible-1',
      status: 'DISCOVERED',
    },
  });

  // 2. Below-Threshold Job
  const lowDesc = 'Entry level assistant working with HTML and JavaScript. Remote allowed.';
  const lowJob = await prisma.job.upsert({
    where: { canonicalUrl: 'https://example.com/jobs/e2e-low-match' },
    update: {
      title: 'Junior Assistant (Below Threshold)',
      company: 'Starter Media',
      location: 'Remote',
      description: lowDesc,
      status: 'DISCOVERED',
    },
    create: {
      id: 'e2e-job-low-match',
      source: 'manual',
      sourceJobId: 'e2e-low-match',
      title: 'Junior Assistant (Below Threshold)',
      company: 'Starter Media',
      location: 'Remote',
      description: lowDesc,
      url: 'https://example.com/jobs/e2e-low-match',
      canonicalUrl: 'https://example.com/jobs/e2e-low-match',
      contentHash: 'hash-e2e-low-match-1',
      status: 'DISCOVERED',
    },
  });

  const lowCacheKey = createHash('sha256').update(`${lowDesc}\n${profileVersion}`).digest('hex');
  await prisma.jobMatch.upsert({
    where: { cacheKey: lowCacheKey },
    update: {
      result: {
        matchScore: 60,
        technicalMatch: 60,
        experienceMatch: 60,
        educationMatch: 60,
        roleMatch: 60,
        skillMatches: ['JavaScript'],
        missingSkills: [],
        strengths: ['Basic web knowledge'],
        concerns: ['Match score is 60%, below standard 75% bar'],
        recommendation: 'review',
        explanation: 'Candidate is partially matched but score is below the 75% threshold.',
      },
    },
    create: {
      jobId: lowJob.id,
      profileVersion,
      cacheKey: lowCacheKey,
      result: {
        matchScore: 60,
        technicalMatch: 60,
        experienceMatch: 60,
        educationMatch: 60,
        roleMatch: 60,
        skillMatches: ['JavaScript'],
        missingSkills: [],
        strengths: ['Basic web knowledge'],
        concerns: ['Match score is 60%, below standard 75% bar'],
        recommendation: 'review',
        explanation: 'Candidate is partially matched but score is below the 75% threshold.',
      },
      provider: 'openai',
      model: 'gpt-4.1-mini',
      promptVersion: '2026-09-08.1',
    },
  });

  // 3. Above-Threshold Job
  const highDesc = 'Senior Full Stack Engineer proficient in JavaScript and software engineering fundamentals. Remote.';
  const highJob = await prisma.job.upsert({
    where: { canonicalUrl: 'https://example.com/jobs/e2e-high-match' },
    update: {
      title: 'Full Stack Engineer (High Match)',
      company: 'ScaleTech AI',
      location: 'Remote',
      description: highDesc,
      status: 'DISCOVERED',
    },
    create: {
      id: 'e2e-job-high-match',
      source: 'manual',
      sourceJobId: 'e2e-high-match',
      title: 'Full Stack Engineer (High Match)',
      company: 'ScaleTech AI',
      location: 'Remote',
      description: highDesc,
      url: 'https://example.com/jobs/e2e-high-match',
      canonicalUrl: 'https://example.com/jobs/e2e-high-match',
      contentHash: 'hash-e2e-high-match-1',
      status: 'DISCOVERED',
    },
  });

  const highCacheKey = createHash('sha256').update(`${highDesc}\n${profileVersion}`).digest('hex');
  await prisma.jobMatch.upsert({
    where: { cacheKey: highCacheKey },
    update: {
      result: {
        matchScore: 92,
        technicalMatch: 95,
        experienceMatch: 90,
        educationMatch: 90,
        roleMatch: 92,
        skillMatches: ['JavaScript'],
        missingSkills: [],
        strengths: ['Strong JavaScript proficiency', 'Computer Science background'],
        concerns: [],
        recommendation: 'apply',
        explanation: 'Excellent fit for the requirements.',
      },
    },
    create: {
      jobId: highJob.id,
      profileVersion,
      cacheKey: highCacheKey,
      result: {
        matchScore: 92,
        technicalMatch: 95,
        experienceMatch: 90,
        educationMatch: 90,
        roleMatch: 92,
        skillMatches: ['JavaScript'],
        missingSkills: [],
        strengths: ['Strong JavaScript proficiency', 'Computer Science background'],
        concerns: [],
        recommendation: 'apply',
        explanation: 'Excellent fit for the requirements.',
      },
      provider: 'openai',
      model: 'gpt-4.1-mini',
      promptVersion: '2026-09-08.1',
    },
  });

  // Clean up any existing applications for these test jobs
  await prisma.application.deleteMany({
    where: { jobId: { in: ['e2e-job-ineligible', lowJob.id, highJob.id] } },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
