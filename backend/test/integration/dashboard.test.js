import request from 'supertest';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { generateToken } from '../../src/modules/auth/authService.js';

describe('GET /api/dashboard Integration Test', () => {
  it('returns counters and topMatches ordered by matchScore descending, excluding REJECTED jobs', async () => {
    const mockJobs = [
      {
        id: 'job-1',
        company: 'Stripe',
        title: 'Backend Engineer',
        location: 'Remote',
        url: 'https://example.com/stripe',
        status: 'MATCHED',
        matches: [
          {
            createdAt: new Date('2026-09-12T10:00:00Z'),
            result: {
              matchScore: 82,
              recommendation: 'apply',
              explanation: 'Strong fit for Node.js and distributed systems.',
            },
          },
        ],
        applications: [],
      },
      {
        id: 'job-2',
        company: 'Netflix',
        title: 'Senior Systems Engineer',
        location: 'Los Gatos, CA',
        url: 'https://example.com/netflix',
        status: 'MATCHED',
        matches: [
          {
            createdAt: new Date('2026-09-12T11:00:00Z'),
            result: {
              matchScore: 94,
              recommendation: 'apply',
              explanation: 'Excellent alignment with architecture skills.',
            },
          },
        ],
        applications: [
          {
            id: 'app-2',
            status: 'AWAITING_APPROVAL',
          },
        ],
      },
      {
        id: 'job-3',
        company: 'Ineligible Corp',
        title: 'Principal Lead',
        location: 'Tokyo',
        url: 'https://example.com/ineligible',
        status: 'REJECTED',
        matches: [
          {
            createdAt: new Date('2026-09-12T09:00:00Z'),
            result: {
              matchScore: 99,
              recommendation: 'reject',
              explanation: 'Ineligible candidate.',
            },
          },
        ],
        applications: [],
      },
      {
        id: 'job-4',
        company: 'Mid Match Co',
        title: 'Full Stack Engineer',
        location: 'Remote',
        url: 'https://example.com/mid',
        status: 'MATCHED',
        matches: [
          {
            createdAt: new Date('2026-09-12T08:00:00Z'),
            result: {
              matchScore: 78,
              recommendation: 'apply',
              explanation: 'Good match on full stack development.',
            },
          },
        ],
        applications: [],
      },
    ];

    const mockPrisma = {
      job: {
        groupBy: async () => [
          { status: 'MATCHED', _count: 3 },
          { status: 'REJECTED', _count: 1 },
        ],
        findMany: async ({ where }) => {
          return mockJobs.filter((job) => {
            if (where?.status?.not && job.status === where.status.not) return false;
            return true;
          });
        },
      },
      application: {
        groupBy: async () => [{ status: 'AWAITING_APPROVAL', _count: 1 }],
      },
      jobMatch: {
        count: async () => 3,
      },
    };

    const dependencies = {
      prisma: mockPrisma,
      queues: new Proxy({}, { get: () => ({ add: async () => ({ id: '1' }) }) }),
      profile: {},
      profileVersion: 'test',
      profilePath: 'unused',
      masterResumePath: 'unused',
      readMasterResume: async () => '',
      provider: {},
      logger: pino({ enabled: false }),
      config: {
        ALLOWED_ORIGINS: 'http://localhost:5173',
        MATCH_THRESHOLD: 75,
        JWT_SECRET: 'test-jwt-secret-for-dashboard',
      },
      sources: [],
    };

    const token = generateToken({ id: 'user-1', email: 'user@example.com' }, dependencies.config.JWT_SECRET);
    const app = createApp(dependencies);
    const response = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    // Assert existing counters are present
    expect(response.body).toHaveProperty('jobsDiscovered', 4);
    expect(response.body).toHaveProperty('matching', 3);
    expect(response.body).toHaveProperty('highQualityMatches', 3);
    expect(response.body).toHaveProperty('awaitingApproval', 1);

    // Assert topMatches is present and correctly shaped
    expect(Array.isArray(response.body.topMatches)).toBe(true);
    expect(response.body.topMatches.length).toBe(3);

    // Assert descending sort by matchScore: 94 -> 82 -> 78
    expect(response.body.topMatches[0].id).toBe('job-2');
    expect(response.body.topMatches[0].matchScore).toBe(94);
    expect(response.body.topMatches[0].applicationStatus).toBe('AWAITING_APPROVAL');

    expect(response.body.topMatches[1].id).toBe('job-1');
    expect(response.body.topMatches[1].matchScore).toBe(82);
    expect(response.body.topMatches[1].applicationStatus).toBe('MATCHED');

    expect(response.body.topMatches[2].id).toBe('job-4');
    expect(response.body.topMatches[2].matchScore).toBe(78);

    // Assert REJECTED job (job-3) is excluded despite its high matchScore
    const rejectedJob = response.body.topMatches.find((j) => j.id === 'job-3');
    expect(rejectedJob).toBeUndefined();
  });
});
