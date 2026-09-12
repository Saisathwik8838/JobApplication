import request from 'supertest';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { generateToken } from '../../src/modules/auth/authService.js';

describe('Profile and Master Resume Persistence Integration Tests', () => {
  const users = [
    {
      id: 'test-user-1',
      email: 'saisathwikcheera@gmail.com',
      name: 'Cheera Sai Sathwik',
    },
  ];

  const candidates = [];

  const mockPrisma = {
    user: {
      findUnique: async ({ where }) => users.find((u) => u.id === where.id) || null,
    },
    candidate: {
      findUnique: async ({ where }) => candidates.find((c) => c.userId === where.userId) || null,
      upsert: async ({ where, update, create }) => {
        const index = candidates.findIndex((c) => c.userId === where.userId);
        if (index >= 0) {
          candidates[index] = {
            ...candidates[index],
            ...update,
            updatedAt: new Date(),
          };
          return candidates[index];
        }
        const created = {
          id: `cand-${Date.now()}`,
          userId: create.userId,
          profile: create.profile,
          profileVersion: create.profileVersion,
          masterResume: create.masterResume || '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        candidates.push(created);
        return created;
      },
    },
  };

  const logger = pino({ level: 'silent' });
  const app = createApp({
    prisma: mockPrisma,
    queues: {},
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

  it('PUTs a profile shaped exactly like Profile.jsx, asserts 200, then GETs it and asserts masterResume round-trips', async () => {
    // Exact payload emitted by frontend/src/pages/Profile.jsx handleSave
    const frontendPayload = {
      profile: {
        identity: {
          name: 'Cheera Sai Sathwik',
          email: 'saisathwikcheera@gmail.com',
          phone: '+91 8074916768',
          location: 'Hyderabad',
          portfolioUrl: 'https://saisathwik.dev',
          linkedInUrl: 'https://linkedin.com/in/saisathwik',
          githubUrl: 'https://github.com/Saisathwik8838',
        },
        experience: {
          level: 'entry',
          totalYears: 1,
        },
        preferences: {
          roles: ['Software Engineer', 'Backend Developer'],
          locations: ['Hyderabad', 'Bangalore'],
          minSalary: 12,
          workAuthorization: 'Indian citizen — no sponsorship required',
        },
        skills: ['C++', 'Python', 'Node.js', 'PostgreSQL', 'Docker'],
      },
      masterResume: '# Cheera Sai Sathwik\n\nFull stack developer with experience in Node.js and PostgreSQL.\n\n## Projects\n- Coding platform',
    };

    // 1. PUT the profile
    const putRes = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(frontendPayload);

    expect(putRes.status).toBe(200);
    expect(putRes.body.profile).toBeDefined();
    expect(putRes.body.profile.identity.name).toBe('Cheera Sai Sathwik');
    expect(putRes.body.profile.skills).toEqual(['C++', 'Python', 'Node.js', 'PostgreSQL', 'Docker']);
    expect(putRes.body.masterResume).toBe(frontendPayload.masterResume);

    // 2. GET the profile back
    const getRes = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.profile.identity.name).toBe('Cheera Sai Sathwik');
    expect(getRes.body.profile.identity.email).toBe('saisathwikcheera@gmail.com');
    expect(getRes.body.profile.experience.level).toBe('entry');
    expect(getRes.body.profile.experience.totalYears).toBe(1);
    expect(getRes.body.profile.preferences.minSalary).toBe(12);
    expect(getRes.body.masterResume).toBe(frontendPayload.masterResume);
  });

  it('rejects an invalid profile with structured 400 details', async () => {
    const invalidPayload = {
      profile: {
        identity: {
          name: '', // Empty name should fail
          email: 'not-an-email', // Invalid email
        },
      },
    };

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
    expect(res.body.details.fieldErrors).toBeDefined();
  });
});
