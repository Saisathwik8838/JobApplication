import request from 'supertest';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { generateToken } from '../../src/modules/auth/authService.js';

const noOp = new Proxy({}, { get: () => async () => [] });
const dependencies = {
  prisma: noOp,
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
    JWT_SECRET: 'test-jwt-secret-for-health',
  },
  sources: [],
};

describe('HTTP integration', () => {
  it('returns health status', async () => {
    const response = await request(createApp(dependencies)).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    const response = await request(createApp(dependencies)).get('/api/jobs');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('returns structured validation errors when authenticated', async () => {
    const token = generateToken({ id: 'user-1', email: 'user@example.com' }, dependencies.config.JWT_SECRET);
    const response = await request(createApp(dependencies))
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});
