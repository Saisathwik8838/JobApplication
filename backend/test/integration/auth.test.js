import request from 'supertest';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { generateToken } from '../../src/modules/auth/authService.js';

describe('Auth Integration Tests', () => {
  // In-memory mock database for testing auth flows
  const users = [];
  const candidates = [];

  const mockPrisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.find((u) => u.email === where.email.toLowerCase()) || null;
        if (where.id) return users.find((u) => u.id === where.id) || null;
        return null;
      },
      findFirst: async ({ where }) => {
        if (where.OR) {
          return (
            users.find(
              (u) =>
                (where.OR[0].googleId && u.googleId === where.OR[0].googleId) ||
                (where.OR[1].email && u.email === where.OR[1].email.toLowerCase())
            ) || null
          );
        }
        return null;
      },
      create: async ({ data }) => {
        const newUser = {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash || null,
          googleId: data.googleId || null,
          name: data.name || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.push(newUser);
        return newUser;
      },
      update: async ({ where, data }) => {
        const u = users.find((item) => item.id === where.id);
        if (!u) throw new Error('User not found');
        Object.assign(u, data, { updatedAt: new Date() });
        return u;
      },
    },
    candidate: {
      findUnique: async ({ where }) => {
        if (where.userId) return candidates.find((c) => c.userId === where.userId) || null;
        return null;
      },
      upsert: async ({ where, update, create }) => {
        const existingIndex = candidates.findIndex((c) => c.userId === where.userId);
        if (existingIndex >= 0) {
          Object.assign(candidates[existingIndex], update);
          return candidates[existingIndex];
        }
        const newCandidate = {
          id: `cand-${Date.now()}`,
          userId: create.userId,
          profile: create.profile,
          profileVersion: create.profileVersion,
          masterResume: create.masterResume,
        };
        candidates.push(newCandidate);
        return newCandidate;
      },
    },
    job: {
      findMany: async () => [],
      count: async () => 0,
    },
  };

  const candidateProfile = {
    candidate: { name: 'Test Candidate', email: 'test@example.com', phone: '1234567890', location: 'Remote' },
    education: { degree: 'Bachelor of Technology', branch: 'Computer Science', college: 'Univ', graduation_year: 2026 },
    experience: { years: 1, level: 'Entry' },
    skills: { programming: ['JavaScript'], backend: [], cloud: [], devops: [], databases: [], ai: [], frontend: [], core_cs: [] },
    projects: [],
    preferences: { roles: ['Developer'], locations: [], remote: true, hybrid: true, onsite: false, employment_types: [] },
    salary: {},
    rules: { minimum_match_score: 75, auto_prepare: true, require_approval: true },
  };

  const dependencies = {
    prisma: mockPrisma,
    queues: new Proxy({}, { get: () => ({ add: async () => ({ id: '1' }) }) }),
    profile: candidateProfile,
    profileVersion: 'test-version',
    profilePath: 'unused',
    masterResumePath: 'unused',
    readMasterResume: async () => '# Test Master Resume',
    provider: {},
    logger: pino({ enabled: false }),
    config: {
      ALLOWED_ORIGINS: 'http://localhost:5173',
      MATCH_THRESHOLD: 75,
      JWT_SECRET: 'test-jwt-secret-for-auth-tests',
    },
    sources: [],
    mockGoogleVerify: async (credential) => {
      if (credential === 'valid-google-cred') {
        return { googleId: 'google-sub-123', email: 'googler@example.com', name: 'Googler' };
      }
      throw new Error('Invalid token');
    },
  };

  const app = createApp(dependencies);

  it('signs up a new user successfully and seeds candidate profile', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'newuser@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      email: 'newuser@example.com',
      name: 'New User',
    });

    const userInDb = users.find((u) => u.email === 'newuser@example.com');
    expect(userInDb).toBeDefined();

    // Check candidate profile was seeded
    const candInDb = candidates.find((c) => c.userId === userInDb.id);
    expect(candInDb).toBeDefined();
    expect(candInDb.masterResume).toBe('# Test Master Resume');
  });

  it('rejects duplicate email signup', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'newuser@example.com', password: 'password456' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'shortpass@example.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('logs in an existing user with valid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newuser@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('newuser@example.com');
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newuser@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login with non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('handles Google authentication successfully', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-google-cred' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('googler@example.com');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('rejects invalid or expired tokens', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('allows access to protected routes with valid Bearer token', async () => {
    const user = users[0];
    const token = generateToken(user, dependencies.config.JWT_SECRET);

    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
  });

  it('allows fetching and updating profile for authenticated user', async () => {
    const user = users[0];
    const token = generateToken(user, dependencies.config.JWT_SECRET);

    const getRes = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('profile');
    expect(getRes.body.profile.candidate.name).toBe('Test Candidate');

    // Update profile
    const updatedCandidateProfile = {
      ...candidateProfile,
      experience: { years: 2, level: 'Mid level' },
    };

    const putRes = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ profile: updatedCandidateProfile, masterResume: '# Updated Resume' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.profile.experience.level).toBe('Mid level');
    expect(putRes.body.masterResume).toBe('# Updated Resume');
  });
});
