import { PrismaClient } from '@prisma/client';
import { ingestJob } from '../backend/src/modules/jobs/jobService.js';
import { isIndiaRelevant } from '../backend/src/modules/jobs/locationFilter.js';
import { validateTruthLayer } from '../backend/src/modules/resume/truthLayer.js';
import { analyzeJob, LLMResponseInvalidError } from '../backend/src/modules/matching/matchingService.js';
import { loadConfig } from '../backend/src/config/config.js';
import pino from 'pino';

const prisma = new PrismaClient();
const logger = pino({ enabled: false });

async function runDemonstration() {
  console.log('===========================================================');
  console.log('DEMONSTRATION 1: NON-INDIA JOB FILTERED OUT AT INGESTION');
  console.log('===========================================================');
  const ukJob = {
    source: 'arbeitnow',
    sourceJobId: `test-uk-${Date.now()}`,
    company: 'London Digital',
    title: 'Senior React Developer',
    description: 'UK-based only. Must be authorized to work in the UK.',
    location: 'London, UK',
    url: `https://example.com/uk-job-${Date.now()}`,
  };

  const genericWorldwideJob = {
    source: 'remotive',
    sourceJobId: `test-worldwide-${Date.now()}`,
    company: 'Global Nomad Ltd',
    title: 'Full Stack Engineer',
    description: 'Work from anywhere in the world on our distributed team.',
    location: 'Remote (Worldwide)',
    url: `https://example.com/worldwide-job-${Date.now()}`,
  };

  const indiaJob = {
    source: 'arbeitnow',
    sourceJobId: `test-india-${Date.now()}`,
    company: 'Bharat Technologies',
    title: 'Full Stack Engineer',
    description: 'Join our team in Bengaluru or work remotely from anywhere in India.',
    location: 'Bengaluru, Karnataka, India',
    url: `https://example.com/india-job-${Date.now()}`,
  };

  console.log('1. Filtering UK Job:', isIndiaRelevant(ukJob) ? 'ACCEPTED' : 'REJECTED');
  console.log('2. Filtering Generic Worldwide Job (No India mention):', isIndiaRelevant(genericWorldwideJob) ? 'ACCEPTED' : 'REJECTED');
  console.log('3. Filtering Bengaluru India Job:', isIndiaRelevant(indiaJob) ? 'ACCEPTED' : 'REJECTED');

  const ukIngestResult = await ingestJob(prisma, ukJob);
  console.log('Ingest UK Job result:', ukIngestResult);

  const worldwideIngestResult = await ingestJob(prisma, genericWorldwideJob);
  console.log('Ingest Worldwide Job result:', worldwideIngestResult);

  const indiaIngestResult = await ingestJob(prisma, indiaJob);
  console.log('Ingest India Job result (created):', indiaIngestResult.created, 'Job ID:', indiaIngestResult.job?.id);

  console.log('\n===========================================================');
  console.log('DEMONSTRATION 2: EXACT REPRODUCTION CASE (B.Tech / Bachelor of Technology)');
  console.log('===========================================================');
  const candidateProfile = {
    candidate: { name: 'Sai Sathwik', email: 'saisathwik@gmail.com', location: 'Bengaluru' },
    education: { degree: 'B.Tech', branch: 'CSE', college: 'JNTU', graduation_year: 2024 },
    experience: { years: 2, level: 'Entry' },
    skills: { programming: ['JavaScript'], backend: [], cloud: [], devops: [], databases: [], ai: [], frontend: [], core_cs: [] },
    preferences: { roles: ['Software Engineer'], locations: ['Bengaluru'], remote: true, hybrid: true, onsite: true },
    rules: { minimum_match_score: 75, auto_prepare: true, require_approval: true },
  };

  try {
    const truthResult = validateTruthLayer(
      { text: 'Bachelor of Technology in CSE', sourceReferences: ['Bachelor of Technology'] },
      candidateProfile,
      'Master resume text mentioning B.Tech CSE'
    );
    console.log('✓ Reproduction case passed successfully!');
    console.log('Verified output text:', truthResult.text);
    console.log('Verified sourceReferences:', truthResult.sourceReferences);
  } catch (err) {
    console.error('✗ Reproduction case failed:', err);
  }

  // Also demonstrate that ungrounded claim still fails
  try {
    validateTruthLayer(
      { text: 'Won 3 Olympic Gold Medals', sourceReferences: ['Olympic Gold Medals'] },
      candidateProfile,
      'Master resume text mentioning B.Tech CSE'
    );
    console.error('✗ Safety check failed: should have thrown on ungrounded claim!');
  } catch (err) {
    console.log('✓ Safety check preserved! Ungrounded claim threw:', err.name, '-', err.message);
  }

  console.log('\n===========================================================');
  console.log('DEMONSTRATION 3: APP REFUSING TO START WHEN NOTIFICATION_TO IS UNSET');
  console.log('===========================================================');
  try {
    loadConfig({
      NODE_ENV: 'production',
      NOTIFICATION_TO: '',
      NOTIFICATION_CHANNELS: 'email,webhook',
      DATABASE_URL: 'postgresql://jobagent:jobagent@localhost:5432/jobagent?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-4.1-mini',
      OPENAI_API_KEY: 'test-key',
      REQUIRE_APPROVAL: true,
      PROFILE_PATH: 'profile/candidate_profile.yaml',
      NOTIFICATION_FROM: 'notifications@jobapplication.local',
      JWT_SECRET: 'production-secret-9876543210',
    });
    console.error('✗ App started without NOTIFICATION_TO!');
  } catch (err) {
    console.log('✓ Fast-fail triggered! App refused to start:');
    console.log('Error message:', err.message);
  }

  console.log('\n===========================================================');
  console.log('DEMONSTRATION 4: FORCED MALFORMED-LLM-RESPONSE SPECIFIC ERROR');
  console.log('===========================================================');
  if (indiaIngestResult.job) {
    const malformedProvider = {
      name: 'mock-broken-provider',
      analyzeJob: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    };

    try {
      await analyzeJob({
        prisma,
        provider: malformedProvider,
        profile: candidateProfile,
        profileVersion: 'v1',
        resumeText: 'Resume text',
        job: indiaIngestResult.job,
        logger,
      });
      console.error('✗ Should have thrown on malformed LLM response!');
    } catch (err) {
      console.log('✓ Handled gracefully without crash!');
      console.log('Caught error class:', err.name);
      console.log('Error code:', err.code);
      console.log('HTTP Status:', err.status);
      console.log('Error message:', err.message);

      const jobAfter = await prisma.job.findUnique({ where: { id: indiaIngestResult.job.id } });
      console.log('Job status in database marked as:', jobAfter.status);
    }
  }

  await prisma.$disconnect();
}

runDemonstration().catch((err) => {
  console.error('Demonstration failed:', err);
  process.exit(1);
});
