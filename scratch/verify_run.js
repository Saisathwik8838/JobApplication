import { PrismaClient } from '@prisma/client';
import { generateToken } from '../backend/src/modules/auth/authService.js';
import { loadConfig } from '../backend/src/config/config.js';

const config = loadConfig();
const prisma = new PrismaClient();

// Ensure or get existing user
let user = await prisma.user.findFirst();
if (!user) {
  user = await prisma.user.create({
    data: {
      id: 'default-local-user',
      email: 'saisathwik8838@gmail.com',
      name: 'Cheera Sai Sathwik',
    },
  });
}

const token = generateToken(
  { id: user.id, email: user.email },
  config.JWT_SECRET
);

async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`http://localhost:${config.PORT}${url}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log(`Using Authenticated User: ${user.email} (${user.id})`);

  console.log('\n=== STEP 1: CHECK DISCOVERY STATUS ===');
  const statusRes = await request('/api/discovery/status');
  console.log('Sources Status:', JSON.stringify(statusRes.data, null, 2));

  console.log('\n=== STEP 2: TRIGGER DISCOVERY & POLL BULLMQ ===');
  const triggerRes = await request('/api/discovery/run', { method: 'POST' });
  console.log('Discovery Triggered:', triggerRes.data);

  let queueJobId = triggerRes.data?.jobId;
  if (queueJobId) {
    console.log(`Polling BullMQ discovery job: ${queueJobId}...`);
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await request(`/api/discovery/status/${queueJobId}`);
      console.log(`Poll status: state=${pollRes.data?.state}, progress=${JSON.stringify(pollRes.data?.progress)}`);
      if (pollRes.data?.state === 'completed' || pollRes.data?.state === 'failed') {
        console.log('Final discovery result:', JSON.stringify(pollRes.data?.result || pollRes.data?.failedReason, null, 2));
        break;
      }
    }
  }

  console.log('\n=== STEP 3: CHECK JOBS & MATCHES ===');
  const jobsRes = await request('/api/jobs?showAll=true&pageSize=15');
  console.log(`Total jobs in system: ${jobsRes.data?.total || 0}`);
  if (jobsRes.data?.items?.length) {
    for (const j of jobsRes.data.items.slice(0, 10)) {
      console.log(`- [${j.source}] ${j.company} - ${j.title} | Status: ${j.status} | MatchScore: ${j.matches?.[0]?.result?.matchScore ?? 'N/A'}`);
    }
  }

  // Find a matched or discovered job to test end-to-end analyze -> prepare -> approve-autofill
  const targetJob = jobsRes.data?.items?.find((j) => j.status === 'MATCHED') || jobsRes.data?.items?.find((j) => j.status === 'DISCOVERED');
  if (targetJob) {
    console.log(`\n=== STEP 4A: ANALYZE JOB ${targetJob.id} (${targetJob.company} - ${targetJob.title}) ===`);
    const analyzeRes = await request(`/api/jobs/${targetJob.id}/analyze`, { method: 'POST' });
    console.log('Analyze response status:', analyzeRes.status);
    console.log('Analyze response body:', JSON.stringify(analyzeRes.data, null, 2));

    const targetJobId = targetJob.id;
    console.log(`\n=== STEP 4B: PREPARE APPLICATION FOR JOB ${targetJobId} ===`);
    const prepRes = await request(`/api/jobs/${targetJobId}/prepare`, {
      method: 'POST',
      body: JSON.stringify({
        questions: [],
      }),
    });
    console.log('Prepare response status:', prepRes.status);
    console.log('Prepare response body:', JSON.stringify(prepRes.data, null, 2));

    const appId = prepRes.data?.application?.id || prepRes.data?.applicationId || targetJob.applications?.[0]?.id;

    if (appId) {
      console.log(`\n=== STEP 5: APPROVE GATE 1 FOR JOB ${targetJobId} (APPLICATION ${appId}) ===`);
      const appRes = await request(`/api/jobs/${targetJobId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ actor: 'local-user', note: 'Gate 1 approved for verification' }),
      });
      console.log('Approve Gate 1 status:', appRes.status);
      console.log('Approve Gate 1 body:', JSON.stringify(appRes.data, null, 2));

      console.log('Waiting 18s for browser worker to process form check/navigation...');
      await new Promise((r) => setTimeout(r, 18000));

      const appCheck = await prisma.application.findUnique({
        where: { id: appId },
        include: { job: true, events: true },
      });
      console.log('Application status after worker:', appCheck?.status);
      console.log('Application browser status:', appCheck?.browserStatus);
      console.log('Application error:', appCheck?.error);
      console.log('Application events:', appCheck?.events?.map((e) => `${e.eventType}: ${e.message}`));
    }
  }

  console.log('\n=== STEP 6: DB RECORDS SUMMARY ===');
  const jobCount = await prisma.job.count();
  const matchCount = await prisma.jobMatch.count();
  const appCount = await prisma.application.count();
  const eventCount = await prisma.applicationEvent.count();
  const approvalCount = await prisma.userApproval.count();

  console.log({ jobCount, matchCount, appCount, eventCount, approvalCount });
  const recentEvents = await prisma.applicationEvent.findMany({ take: 5, orderBy: { timestamp: 'desc' } });
  console.log('Recent Application Events:');
  for (const e of recentEvents) {
    console.log(`[${e.timestamp.toISOString()}] ${e.eventType} - ${e.message} (status=${e.status})`);
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Run failed:', err);
  process.exit(1);
});
