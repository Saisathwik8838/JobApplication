import { Router } from 'express';
import { signupSchema, loginSchema, googleAuthSchema } from '@job-agent/shared-schemas';
import { validate } from '../middleware/validate.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyGoogleToken,
  ensureUserCandidate,
} from '../modules/auth/authService.js';
import { authMiddleware } from '../middleware/auth.js';

export function authRouter(dependencies) {
  const router = Router();
  const { prisma, config, profile, readMasterResume } = dependencies;
  const jwtSecret = config?.JWT_SECRET;

  router.post('/signup', validate(signupSchema), async (request, response, next) => {
    try {
      const { email, password, name } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        return response.status(409).json({
          error: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists.',
        });
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name?.trim() || null,
        },
      });

      const masterResumeText = (await readMasterResume?.()) || '';
      if (profile) {
        await ensureUserCandidate(prisma, user.id, profile, masterResumeText);
      }

      const token = generateToken(user, jwtSecret);
      return response.status(201).json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', validate(loginSchema), async (request, response, next) => {
    try {
      const { email, password } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user || !user.passwordHash) {
        return response.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return response.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      const token = generateToken(user, jwtSecret);
      return response.status(200).json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/google', validate(googleAuthSchema), async (request, response, _next) => {
    try {
      const { credential } = request.body;
      const googleData = await verifyGoogleToken(credential, {
        mockVerify: dependencies.mockGoogleVerify,
      });

      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { googleId: googleData.googleId },
            { email: googleData.email.toLowerCase() },
          ],
        },
      });

      if (user) {
        if (!user.googleId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId: googleData.googleId },
          });
        }
      } else {
        user = await prisma.user.create({
          data: {
            email: googleData.email.toLowerCase(),
            googleId: googleData.googleId,
            name: googleData.name,
          },
        });

        const masterResumeText = (await readMasterResume?.()) || '';
        if (profile) {
          await ensureUserCandidate(prisma, user.id, profile, masterResumeText);
        }
      }

      const token = generateToken(user, jwtSecret);
      return response.status(200).json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (error) {
      return response.status(401).json({
        error: 'INVALID_GOOGLE_TOKEN',
        message: error.message || 'Google authentication failed.',
      });
    }
  });

  router.get('/me', authMiddleware(jwtSecret), async (request, response) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) {
      return response.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    return response.status(200).json({ user });
  });

  return router;
}
