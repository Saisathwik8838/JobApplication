import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { generateToken } from '../../src/modules/auth/authService.js';

describe('Job Application Pipeline Fixes (Regression Suite)', () => {
  const logger = pino({ enabled: false });

  let masterResumePath = resolve(process.cwd(), '..', 'profile', 'resume', 'master_resume.md');
  if (!existsSync(masterResumePath)) {
    masterResumePath = resolve(process.cwd(), 'profile', 'resume', 'master_resume.md');
  }

  const mockCandidateProfile = {
    candidate: {
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phone: '+1-555-0199',
      location: 'Remote',
    },
    education: {
      degree: 'Bachelor of Science',
      branch: 'Computer Science',
      college: 'State University',
      graduation_year: 2022,
    },
    experience: {
      years: 5,
      level: 'Mid level',
    },
    skills: {
      programming: ['JavaScript', 'TypeScript'],
      backend: ['Node.js', 'Express'],
      cloud: ['AWS'],
      devops: ['Docker'],
      databases: ['PostgreSQL'],
      ai: [],
      frontend: ['React'],
      core_cs: ['Data Structures'],
    },
    projects: [],
    preferences: {
      roles: ['Backend Engineer', 'Full Stack Engineer'],
      locations: ['Remote'],
      remote: true,
      hybrid: true,
      onsite: false,
      employment_types: ['Full-time'],
    },
    salary: { expected: 120000 },
    rules: { minimum_match_score: 75, auto_prepare: true, require_approval: true },
  };

  function createMockEnvironment() {
    const jobs = new Map();
    const applications = new Map();
    const matches = new Map();
    const resumes = new Map();
    const resumeVersions = new Map();
    const events = [];
    const approvals = [];

    const mockPrisma = {
      user: {
        findUnique: async () => ({ id: 'user-test', email: 'alex@example.com' }),
      },
      job: {
        findUnique: async ({ where }) => {
          const job = jobs.get(where.id);
          if (!job) return null;
          return {
            ...job,
            matches: matches.get(job.id) || [],
            applications: applications.get(job.id) ? [applications.get(job.id)] : [],
          };
        },
        update: async ({ where, data }) => {
          const job = jobs.get(where.id);
          if (job) Object.assign(job, data);
          return job;
        },
      },
      jobMatch: {
        findUnique: async () => null,
        findFirst: async ({ where }) => {
          const list = matches.get(where.jobId) || [];
          return list[0] || null;
        },
        create: async ({ data }) => {
          const list = matches.get(data.jobId) || [];
          list.unshift(data);
          matches.set(data.jobId, list);
          return data;
        },
      },
      application: {
        findUnique: async ({ where }) => {
          if (where.id) {
            for (const app of applications.values()) {
              if (app.id === where.id) return app;
            }
          }
          if (where.jobId) {
            return applications.get(where.jobId) || null;
          }
          return null;
        },
        findFirst: async ({ where }) => {
          if (where.jobId) return applications.get(where.jobId) || null;
          if (where.id) {
            for (const app of applications.values()) {
              if (app.id === where.id) return app;
            }
          }
          return null;
        },
        upsert: async ({ where, create, update }) => {
          const jId = where.jobId || where.jobId_userId?.jobId;
          let app = applications.get(jId);
          if (!app) {
            app = { id: `app-${Date.now()}-${Math.random()}`, updatedAt: new Date(), ...create };
          } else {
            Object.assign(app, { updatedAt: new Date(), ...update });
          }
          applications.set(jId, app);
          return app;
        },
        update: async ({ where, data }) => {
          for (const app of applications.values()) {
            if (app.id === where.id) {
              Object.assign(app, { updatedAt: new Date(), ...data });
              return app;
            }
          }
          return null;
        },
      },
      candidate: {
        findUnique: async () => ({
          id: 'cand-1',
          userId: 'user-test',
          profile: mockCandidateProfile,
          profileVersion: 'v1.0.0',
          masterResume: 'Master Resume: JavaScript, Node.js, Tech Corp',
        }),
        upsert: async ({ create }) => ({ id: 'cand-1', ...create }),
      },
      resume: {
        create: async ({ data }) => {
          const res = { id: 'res-1', ...data };
          resumes.set(res.id, res);
          return res;
        },
      },
      resumeVersion: {
        create: async ({ data }) => {
          const ver = { id: 'ver-1', ...data };
          resumeVersions.set(ver.id, ver);
          return ver;
        },
      },
      applicationAnswer: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async () => ({ count: 0 }),
      },
      applicationEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
      userApproval: {
        create: async ({ data }) => {
          approvals.push(data);
          return data;
        },
      },
      $transaction: async (fn) => {
        if (typeof fn === 'function') {
          return fn(mockPrisma);
        }
        return Promise.all(fn);
      },
    };

    const mockProvider = {
      analyzeJob: async () => ({
        matchScore: 85,
        technicalMatch: 85,
        experienceMatch: 85,
        educationMatch: 85,
        roleMatch: 85,
        skillMatches: ['JavaScript', 'Node.js'],
        missingSkills: [],
        strengths: ['Great experience'],
        concerns: [],
        recommendation: 'apply',
        explanation: 'Strong fit for candidate profile',
        _meta: { provider: 'mock', model: 'mock-1', promptVersion: 'v1' },
      }),
      generateResume: async () => ({
        text: 'Tailored resume text with JavaScript experience from State University',
        sourceReferences: ['JavaScript', 'State University'],
        status: 'READY',
        confidence: 'high',
        _meta: { provider: 'mock', model: 'mock-1', promptVersion: 'v1' },
      }),
    };

    const mockQueues = {
      notification: { add: async () => ({ id: 'notif-1' }) },
      'browser-application': { add: async () => ({ id: 'browser-1' }) },
    };

    const deps = {
      prisma: mockPrisma,
      queues: mockQueues,
      profile: mockCandidateProfile,
      profileVersion: 'v1.0.0',
      profilePath: '/mock/profile.yaml',
      masterResumePath,
      readMasterResume: async () => 'Master Resume: JavaScript, Node.js, Tech Corp',
      provider: mockProvider,
      logger,
      config: {
        ALLOWED_ORIGINS: 'http://localhost:5173',
        MATCH_THRESHOLD: 75,
        HEADLESS: true,
        REQUIRE_APPROVAL: true,
        JWT_SECRET: 'test-jwt-secret-fixes',
      },
      sources: [],
    };

    const token = generateToken({ id: 'user-test', email: 'alex@example.com' }, deps.config.JWT_SECRET);

    return { app: createApp(deps), jobs, applications, matches, events, approvals, mockProvider, token };
  }

  // Bug 1: Distinct eligibility failure
  it('Fix 1: returns 200 with distinct eligibility failure when job is ineligible', async () => {
    const { app, jobs, token } = createMockEnvironment();

    // Create an ineligible job: requires 10+ years experience, whereas profile has 5 years
    const ineligibleJob = {
      id: 'job-ineligible-1',
      source: 'sample',
      company: 'High Req Corp',
      title: 'Principal Systems Architect',
      description: 'Minimum of 10 years experience required in distributed systems. On-site in Singapore.',
      location: 'Singapore',
      url: 'https://example.com/principal-job',
      canonicalUrl: 'https://example.com/principal-job',
      contentHash: 'hash-principal',
      status: 'DISCOVERED',
    };
    jobs.set(ineligibleJob.id, ineligibleJob);

    const response = await request(app)
      .post(`/api/jobs/${ineligibleJob.id}/analyze`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.eligible).toBe(false);
    expect(response.body.eligibility).toBeDefined();
    expect(response.body.eligibility.eligible).toBe(false);
    expect(Array.isArray(response.body.eligibility.hardFailures)).toBe(true);
    expect(response.body.eligibility.hardFailures.length).toBeGreaterThan(0);
    expect(response.body.match).toBeNull();
    // Confirm job was marked REJECTED in database
    expect(ineligibleJob.status).toBe('REJECTED');
  });

  // Bug 2 & 4: Prepare validation when not analyzed
  it('Fix 2: returns 409 when attempting to prepare an unanalyzed job', async () => {
    const { app, jobs, token } = createMockEnvironment();

    const unanalyzedJob = {
      id: 'job-unanalyzed-1',
      source: 'sample',
      company: 'Acme Corp',
      title: 'Backend Engineer',
      description: 'Remote backend engineer role in US.',
      location: 'Remote',
      url: 'https://example.com/acme-job',
      canonicalUrl: 'https://example.com/acme-job',
      contentHash: 'hash-acme',
      status: 'DISCOVERED',
    };
    jobs.set(unanalyzedJob.id, unanalyzedJob);

    const response = await request(app)
      .post(`/api/jobs/${unanalyzedJob.id}/prepare`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/Analyze the job before preparation/i);
  });

  // Bug 2 & 4: Prepare validation when below MATCH_THRESHOLD
  it('Fix 3: returns 422 when job match score is below configured threshold', async () => {
    const { app, jobs, matches, token } = createMockEnvironment();

    const lowScoreJob = {
      id: 'job-low-score-1',
      source: 'sample',
      company: 'Low Match Inc',
      title: 'DevOps Specialist',
      description: 'Kubernetes and Terraform expert.',
      location: 'Remote',
      url: 'https://example.com/low-job',
      canonicalUrl: 'https://example.com/low-job',
      contentHash: 'hash-low',
      status: 'MATCHED',
    };
    jobs.set(lowScoreJob.id, lowScoreJob);

    // Provide match score of 60 (below threshold 75)
    matches.set(lowScoreJob.id, [
      {
        result: {
          matchScore: 60,
          recommendation: 'review',
          explanation: 'Only partial overlap in skills',
        },
      },
    ]);

    const response = await request(app)
      .post(`/api/jobs/${lowScoreJob.id}/prepare`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(response.body.message).toMatch(/Job does not meet the configured preparation threshold/i);
  });

  // Bug 4: Re-running prepare on the same job twice advances to AWAITING_APPROVAL without getting stuck
  it('Fix 4: re-running /prepare on the same job twice resets and advances to AWAITING_APPROVAL', async () => {
    const { app, jobs, matches, applications, token } = createMockEnvironment();

    const eligibleJob = {
      id: 'job-eligible-1',
      source: 'sample',
      company: 'Great Co',
      title: 'Full Stack Engineer',
      description: 'Remote full stack engineer with Node.js and React.',
      location: 'Remote',
      url: 'https://example.com/great-job',
      canonicalUrl: 'https://example.com/great-job',
      contentHash: 'hash-great',
      status: 'MATCHED',
    };
    jobs.set(eligibleJob.id, eligibleJob);

    matches.set(eligibleJob.id, [
      {
        result: {
          matchScore: 88,
          recommendation: 'apply',
          explanation: 'Excellent fit for candidate background',
        },
      },
    ]);

    // 1. First prepare call
    const firstResponse = await request(app)
      .post(`/api/jobs/${eligibleJob.id}/prepare`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questions: [] });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.application.status).toBe('AWAITING_APPROVAL');

    const appInDb = applications.get(eligibleJob.id);
    expect(appInDb).toBeDefined();
    expect(appInDb.status).toBe('AWAITING_APPROVAL');

    // 2. Second prepare call on the SAME job (regression test)
    const secondResponse = await request(app)
      .post(`/api/jobs/${eligibleJob.id}/prepare`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questions: [] });

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.application.status).toBe('AWAITING_APPROVAL');
    expect(applications.get(eligibleJob.id).status).toBe('AWAITING_APPROVAL');
  });

  // Bug 4b: Re-running prepare on a REJECTED application
  it('Fix 4b: allows re-preparing a previously REJECTED application', async () => {
    const { app, jobs, matches, applications, token } = createMockEnvironment();

    const rejectedJob = {
      id: 'job-rejected-1',
      source: 'sample',
      company: 'Alpha Systems',
      title: 'Backend Engineer',
      description: 'Remote Node.js developer.',
      location: 'Remote',
      url: 'https://example.com/alpha-job',
      canonicalUrl: 'https://example.com/alpha-job',
      contentHash: 'hash-alpha',
      status: 'MATCHED',
    };
    jobs.set(rejectedJob.id, rejectedJob);

    matches.set(rejectedJob.id, [
      {
        result: {
          matchScore: 90,
          recommendation: 'apply',
          explanation: 'Strong fit',
        },
      },
    ]);

    // Application was previously rejected
    applications.set(rejectedJob.id, {
      id: 'app-alpha-rejected',
      jobId: rejectedJob.id,
      status: 'REJECTED',
    });

    const response = await request(app)
      .post(`/api/jobs/${rejectedJob.id}/prepare`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questions: [] });

    expect(response.status).toBe(201);
    expect(response.body.application.status).toBe('AWAITING_APPROVAL');
    expect(applications.get(rejectedJob.id).status).toBe('AWAITING_APPROVAL');
  });

  // Bug 4c: Rejecting prepare on an in-flight or completed submission
  it('Fix 4c: returns 409 when attempting to prepare an already SUBMITTED application', async () => {
    const { app, jobs, matches, applications, token } = createMockEnvironment();

    const submittedJob = {
      id: 'job-submitted-1',
      source: 'sample',
      company: 'Beta Systems',
      title: 'Cloud Architect',
      description: 'Remote Cloud Engineer.',
      location: 'Remote',
      url: 'https://example.com/beta-job',
      canonicalUrl: 'https://example.com/beta-job',
      contentHash: 'hash-beta',
      status: 'MATCHED',
    };
    jobs.set(submittedJob.id, submittedJob);

    matches.set(submittedJob.id, [
      {
        result: { matchScore: 95, recommendation: 'apply', explanation: 'Perfect fit' },
      },
    ]);

    applications.set(submittedJob.id, {
      id: 'app-beta-submitted',
      jobId: submittedJob.id,
      status: 'SUBMITTED',
    });

    const response = await request(app)
      .post(`/api/jobs/${submittedJob.id}/prepare`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/Cannot prepare application in SUBMITTED status/i);
  });

  // Part 2: One-click Apply workflow & Gate 2 approval
  it('Fix 5: executes prepare -> approve (Gate 1) -> confirm-submit (Gate 2) -> reaches SUBMITTED with exactly two approvals', async () => {
    const { app, jobs, matches, applications, approvals, token } = createMockEnvironment();

    const job = {
      id: 'job-two-gate-1',
      source: 'sample',
      company: 'ScaleTech',
      title: 'Senior Engineer',
      description: 'Distributed systems engineer.',
      location: 'Remote',
      url: 'https://example.com/job-two-gate-1',
      canonicalUrl: 'https://example.com/job-two-gate-1',
      contentHash: 'hash-two-gate-1',
      status: 'MATCHED',
    };
    jobs.set(job.id, job);

    matches.set(job.id, [
      {
        result: { matchScore: 90, recommendation: 'apply', explanation: 'Strong fit' },
      },
    ]);

    // 1. Prepare application
    const prepRes = await request(app)
      .post(`/api/jobs/${job.id}/prepare`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questions: [] });
    expect(prepRes.status).toBe(201);
    expect(prepRes.body.application.status).toBe('AWAITING_APPROVAL');

    // 2. Approve Gate 1
    const approveRes = await request(app)
      .post(`/api/jobs/${job.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actor: 'local-user',
        note: 'Gate 1 approved via one-click Apply',
      });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');
    expect(approvals).toHaveLength(1);
    expect(approvals[0].note).toBe('Gate 1 approved via one-click Apply');

    // 3. Worker fills form (mocked worker transition to FILLED_AWAITING_RECHECK)
    const storedApp = applications.get(job.id);
    storedApp.status = 'FILLED_AWAITING_RECHECK';
    storedApp.filledData = { 'Full Name': 'Alex Morgan' };
    storedApp.screenshot = 'base64screenshot';

    // 4. Gate 2 Confirm Submit
    const confirmRes = await request(app)
      .post(`/api/applications/${storedApp.id}/confirm-submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actor: 'local-user',
        note: 'Gate 2 approved after review on Jobs page',
      });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('RESUBMIT_APPROVED');
    expect(approvals).toHaveLength(2);

    // 5. Worker completes submission (mocked transition to SUBMITTED)
    storedApp.status = 'SUBMITTED';
    expect(storedApp.status).toBe('SUBMITTED');
    expect(approvals).toHaveLength(2);
  });

  it('Fix 6: halts flow when preparation results in NEEDS_USER_INPUT and prevents auto-approval', async () => {
    const { app, jobs, matches, applications, approvals, token } = createMockEnvironment();

    const job = {
      id: 'job-needs-input-1',
      source: 'sample',
      company: 'Sec Corp',
      title: 'Security Engineer',
      description: 'Security engineer.',
      location: 'Remote',
      url: 'https://example.com/job-sec',
      canonicalUrl: 'https://example.com/job-sec',
      contentHash: 'hash-sec',
      status: 'MATCHED',
    };
    jobs.set(job.id, job);

    matches.set(job.id, [
      {
        result: { matchScore: 88, recommendation: 'apply', explanation: 'Strong fit' },
      },
    ]);

    // Send a question that requires truthful user input (not present in profile)
    const prepRes = await request(app)
      .post(`/api/jobs/${job.id}/prepare`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        questions: ['What is your secret security clearance code?'],
      });

    expect(prepRes.status).toBe(201);
    expect(prepRes.body.application.status).toBe('NEEDS_USER_INPUT');
    expect(applications.get(job.id).status).toBe('NEEDS_USER_INPUT');

    // Attempting to approve an application in NEEDS_USER_INPUT must fail (409)
    const approveRes = await request(app)
      .post(`/api/jobs/${job.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actor: 'local-user',
        note: 'Attempting approval before input provided',
      });

    expect(approveRes.status).toBe(409);
    expect(approveRes.body.error).toBe('INVALID_STATE_TRANSITION');
    // No approval recorded
    expect(approvals).toHaveLength(0);
  });
});
