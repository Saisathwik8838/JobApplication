import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';

const DEFAULT_JWT_SECRET = 'dev-secret-job-agent-jwt-change-in-production';

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export function generateToken(user, secret = DEFAULT_JWT_SECRET) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    },
    secret,
    { expiresIn: '7d' },
  );
}

export function verifyToken(token, secret = DEFAULT_JWT_SECRET) {
  return jwt.verify(token, secret);
}

/**
 * Verifies a Google ID token.
 * In development/test or when a mock provider is passed, decodes or accepts test credentials.
 * In live mode, verifies via Google's tokeninfo API.
 * @param {string} credential
 * @param {object} [options]
 */
export async function verifyGoogleToken(credential, options = {}) {
  if (options.mockVerify) {
    return options.mockVerify(credential);
  }

  // Handle mock test token format (permitted strictly during unit/integration tests)
  if (credential.startsWith('mock-google-')) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Mock Google credentials are only permitted in test environments.');
    }
    const parts = credential.split(':');
    return {
      googleId: parts[1] || 'mock-google-id',
      email: parts[2] || 'test-google-user@test.local',
      name: parts[3] || 'Google Test User',
    };
  }

  // Live verification via Google tokeninfo
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error_description || 'Invalid Google credential token.');
  }

  const payload = await response.json();
  if (!payload.sub || !payload.email) {
    throw new Error('Google token payload missing sub or email.');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || null,
  };
}

/**
 * Seeds a Candidate profile for a user if they do not yet have one.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {import('@job-agent/shared-schemas').CandidateProfile} defaultProfile
 * @param {string} [defaultResumeText]
 */
export async function ensureUserCandidate(prisma, userId, defaultProfile, defaultResumeText = '') {
  const existing = await prisma.candidate.findUnique({
    where: { userId },
  });
  if (existing) return existing;

  const profileVersion = createHash('sha256')
    .update(JSON.stringify(defaultProfile))
    .digest('hex');

  // Check if profileVersion conflict exists
  const candidate = await prisma.candidate.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      profileVersion: `${profileVersion}-${userId}`,
      profile: defaultProfile,
      masterResume: defaultResumeText,
    },
  });

  return candidate;
}
