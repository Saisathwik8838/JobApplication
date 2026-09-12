import request from 'supertest';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { generateToken } from '../../src/modules/auth/authService.js';

describe('GET /api/jobs Filter Integration Tests', () => {
  const mockJobs = [
    {
      id: 'job-1',
      source: 'remotive',
      company: 'Acme Systems',
      title: 'Senior Frontend Developer',
      location: 'Remote, US',
      status: 'MATCHED',
      discoveredAt: new Date('2026-09-12T10:00:00Z'),
      matches: [{ userId: 'user-1', result: { matchScore: 92 } }],
      applications: [],
    },
    {
      id: 'job-2',
      source: 'manual',
      company: 'Beta Software',
      title: 'Backend Node.js Engineer',
      location: 'New York, NY',
      status: 'MATCHED',
      discoveredAt: new Date('2026-09-12T09:00:00Z'),
      matches: [{ userId: 'user-1', result: { matchScore: 68 } }],
      applications: [],
    },
    {
      id: 'job-3',
      source: 'remotive',
      company: 'Gamma Labs',
      title: 'Full Stack Engineer',
      location: 'Remote',
      status: 'DISCOVERED',
      discoveredAt: new Date('2026-09-12T08:00:00Z'),
      matches: [],
      applications: [],
    },
  ];

  let capturedWhere = null;

  const mockPrisma = {
    job: {
      findMany: async ({ where }) => {
        capturedWhere = where;
        return mockJobs.filter((job) => {
          if (where.status && job.status !== where.status) return false;
          if (where.company?.contains && !job.company.toLowerCase().includes(where.company.contains.toLowerCase())) {
            return false;
          }
          if (where.title?.contains && !job.title.toLowerCase().includes(where.title.contains.toLowerCase())) {
            return false;
          }
          if (where.location?.contains && !job.location.toLowerCase().includes(where.location.contains.toLowerCase())) {
            return false;
          }
          if (where.source && job.source !== where.source) return false;
          if (where.matches?.some?.result?.path) {
            const min = where.matches.some.result.gte;
            const score = job.matches[0]?.result?.matchScore ?? 0;
            if (score < min) return false;
          }
          return true;
        });
      },
      count: async () => {
        return mockJobs.length;
      },
    },
  };

  const dependencies = {
    prisma: mockPrisma,
    queues: new Proxy({}, { get: () => ({ add: async () => ({ id: '1' }) }) }),
    profile: {},
    profileVersion: 'v1',
    profilePath: 'unused',
    masterResumePath: 'unused',
    readMasterResume: async () => '',
    provider: {},
    logger: pino({ enabled: false }),
    config: {
      ALLOWED_ORIGINS: 'http://localhost:5173',
      MATCH_THRESHOLD: 75,
      JWT_SECRET: 'test-jwt-secret-filter',
    },
    sources: [],
  };

  const app = createApp(dependencies);
  const token = generateToken({ id: 'user-1', email: 'user@example.com' }, dependencies.config.JWT_SECRET);

  it('filters jobs by company', async () => {
    const res = await request(app)
      .get('/api/jobs?company=Acme')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].company).toBe('Acme Systems');
    expect(capturedWhere.company).toEqual({ contains: 'Acme', mode: 'insensitive' });
  });

  it('filters jobs by titleQuery / keyword', async () => {
    const res = await request(app)
      .get('/api/jobs?titleQuery=Frontend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toContain('Frontend');
    expect(capturedWhere.title).toEqual({ contains: 'Frontend', mode: 'insensitive' });
  });

  it('filters jobs by location', async () => {
    const res = await request(app)
      .get('/api/jobs?location=New%20York')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].location).toContain('New York');
    expect(capturedWhere.location).toEqual({ contains: 'New York', mode: 'insensitive' });
  });

  it('filters jobs by source', async () => {
    const res = await request(app)
      .get('/api/jobs?source=remotive')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(capturedWhere.source).toBe('remotive');
  });

  it('filters jobs by minMatchScore', async () => {
    const res = await request(app)
      .get('/api/jobs?minMatchScore=80')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe('job-1');
    expect(capturedWhere.matches.some.result.gte).toBe(80);
  });
});
