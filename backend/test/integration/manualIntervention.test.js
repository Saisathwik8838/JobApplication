import request from 'supertest';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { generateToken } from '../../src/modules/auth/authService.js';

describe('Manual Intervention Hand-Off & Mark Submitted Integration Tests', () => {
  const users = [
    {
      id: 'test-user-manual',
      email: 'candidate@example.com',
      name: 'Candidate User',
    },
  ];

  const applications = [
    {
      id: 'app-manual-1',
      userId: 'test-user-manual',
      jobId: 'job-101',
      status: 'MANUAL_INTERVENTION',
      error: 'CAPTCHA detected.',
      submissionUrl: 'https://company.com/apply/page-2',
      job: {
        id: 'job-101',
        company: 'Cloud Corp',
        title: 'Senior Engineer',
        url: 'https://company.com/apply',
      },
      answers: [
        {
          id: 'ans-1',
          applicationId: 'app-manual-1',
          question: 'Are you authorized to work?',
          answer: null,
          status: 'NEEDS_USER_INPUT',
        },
      ],
      events: [],
      approvals: [],
    },
    {
      id: 'app-failed-1',
      userId: 'test-user-manual',
      jobId: 'job-102',
      status: 'FAILED',
      error: 'Expected submit button was not found.',
      submissionUrl: null,
      job: {
        id: 'job-102',
        company: 'Web Systems',
        title: 'Backend Developer',
        url: 'https://websystems.com/jobs/1',
      },
      answers: [],
      events: [],
      approvals: [],
    },
  ];

  const events = [];
  const approvals = [];

  const mockPrisma = {
    application: {
      findFirst: async ({ where }) =>
        applications.find(
          (a) =>
            (!where.id || a.id === where.id) &&
            (!where.userId || a.userId === where.userId)
        ) || null,
      findUnique: async ({ where }) => applications.find((a) => a.id === where.id) || null,
      update: async ({ where, data }) => {
        const app = applications.find((a) => a.id === where.id);
        if (!app) throw new Error('Not found');
        Object.assign(app, data, { updatedAt: new Date() });
        return app;
      },
    },
    applicationEvent: {
      create: async ({ data }) => {
        const event = { id: `event-${Date.now()}`, ...data, timestamp: new Date() };
        events.push(event);
        return event;
      },
    },
    userApproval: {
      create: async ({ data }) => {
        const approval = { id: `appr-${Date.now()}`, ...data, createdAt: new Date() };
        approvals.push(approval);
        return approval;
      },
    },
    $transaction: async (fn) => fn(mockPrisma),
  };

  const mockQueues = {
    'browser-application': {
      add: async () => {},
    },
  };

  const logger = pino({ level: 'silent' });
  const app = createApp({
    prisma: mockPrisma,
    queues: mockQueues,
    profile: null,
    profileVersion: 'v1',
    profilePath: '',
    masterResumePath: '',
    readMasterResume: async () => '',
    provider: null,
    logger,
    config: {
      JWT_SECRET: 'test-secret-key-12345',
      NODE_ENV: 'test',
    },
    sources: [],
  });

  const authToken = generateToken(users[0], 'test-secret-key-12345');

  it('marks an application in MANUAL_INTERVENTION as SUBMITTED via POST /api/applications/:id/mark-submitted', async () => {
    const res = await request(app)
      .post('/api/applications/app-manual-1/mark-submitted')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actor: 'candidate',
        note: 'Solved CAPTCHA manually and submitted',
        submissionUrl: 'https://company.com/apply/success',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');

    // Assert database record was updated
    const appRec = applications.find((a) => a.id === 'app-manual-1');
    expect(appRec.status).toBe('SUBMITTED');
    expect(appRec.submissionUrl).toBe('https://company.com/apply/success');
    expect(appRec.error).toBeNull();

    // Assert event was created
    const createdEvent = events.find(
      (e) => e.applicationId === 'app-manual-1' && e.eventType === 'MANUALLY_SUBMITTED'
    );
    expect(createdEvent).toBeDefined();
    expect(createdEvent.status).toBe('SUBMITTED');

    // Assert user approval record was created
    const createdApproval = approvals.find((a) => a.applicationId === 'app-manual-1');
    expect(createdApproval).toBeDefined();
    expect(createdApproval.approved).toBe(true);
  });

  it('marks an application in FAILED state as SUBMITTED via mark-submitted', async () => {
    const res = await request(app)
      .post('/api/applications/app-failed-1/mark-submitted')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actor: 'candidate',
        note: 'Manually completed on company portal',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');

    const appRec = applications.find((a) => a.id === 'app-failed-1');
    expect(appRec.status).toBe('SUBMITTED');
    expect(appRec.error).toBeNull();
  });
});
