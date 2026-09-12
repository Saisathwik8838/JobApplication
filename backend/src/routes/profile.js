import { Router } from 'express';
import { createHash } from 'node:crypto';
import { candidateProfileSchema } from '@job-agent/shared-schemas';
import { ensureUserCandidate } from '../modules/auth/authService.js';

/**
 * @param {import('../app.js').AppDependencies} dependencies
 */
export function profileRouter({ prisma, profile: defaultProfile, readMasterResume }) {
  const router = Router();

  router.get('/', async (request, response, next) => {
    try {
      let candidate = await prisma.candidate.findUnique({
        where: { userId: request.user.id },
      });

      if (!candidate && defaultProfile) {
        const masterResumeText = (await readMasterResume?.()) || '';
        candidate = await ensureUserCandidate(prisma, request.user.id, defaultProfile, masterResumeText);
      }

      if (!candidate) {
        return response.status(404).json({
          error: 'PROFILE_NOT_FOUND',
          message: 'Candidate profile not found for user.',
        });
      }

      return response.json({
        profile: candidate.profile,
        profileVersion: candidate.profileVersion,
        masterResume: candidate.masterResume ?? '',
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/', async (request, response, next) => {
    try {
      const incomingProfile = request.body.profile || request.body;
      const parsedProfile = candidateProfileSchema.parse(incomingProfile);
      const masterResume = request.body.masterResume;

      const baseHash = createHash('sha256')
        .update(JSON.stringify(parsedProfile))
        .digest('hex');
      const profileVersion = `${baseHash}-${request.user.id}`;

      const updated = await prisma.candidate.upsert({
        where: { userId: request.user.id },
        update: {
          profile: parsedProfile,
          profileVersion,
          ...(masterResume !== undefined ? { masterResume } : {}),
        },
        create: {
          userId: request.user.id,
          profile: parsedProfile,
          profileVersion,
          masterResume: masterResume ?? '',
        },
      });

      return response.json({
        profile: updated.profile,
        version: updated.profileVersion,
        masterResume: updated.masterResume ?? '',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
