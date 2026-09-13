import { Router } from 'express';
import { z } from 'zod';
import { jobCreateSchema, jobsQuerySchema } from '@job-agent/shared-schemas';
import { validate } from '../middleware/validate.js';
import { ingestJob, getJobOrThrow } from '../modules/jobs/jobService.js';
import { analyzeJob } from '../modules/matching/matchingService.js';
import { generateTailoredResume } from '../modules/resume/resumeService.js';
import { resolveAnswer } from '../modules/applications/answerResolver.js';
import { transitionApplication } from '../modules/applications/applicationStateMachine.js';
import { ensureUserCandidate } from '../modules/auth/authService.js';

const idParams = z.object({ id: z.string().min(1) });
const prepareSchema = z.object({ questions: z.array(z.string().min(1)).max(100).default([]) });
const actorSchema = z.object({ actor: z.string().min(1).max(100).default('local-user'), note: z.string().max(1000).optional() });

async function getUserProfileAndResume(prisma, userId, defaultProfile, readMasterResume) {
  let candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate && defaultProfile) {
    const defaultResume = (await readMasterResume?.()) || '';
    candidate = await ensureUserCandidate(prisma, userId, defaultProfile, defaultResume);
  }
  return {
    candidate,
    profile: candidate?.profile || defaultProfile,
    profileVersion: candidate?.profileVersion || 'default',
    resumeText: candidate?.masterResume || (await readMasterResume?.()) || '',
  };
}

/** @param {import('../app.js').AppDependencies} dependencies */
export function jobsRouter(dependencies) {
  const router = Router();
  const { prisma, profile: defaultProfile, readMasterResume, masterResumePath, provider, logger, config, queues } = dependencies;

  router.get('/', validate(jobsQuerySchema, 'query'), async (request, response, next) => {
    try {
      const {
        page = 1,
        pageSize = 25,
        status,
        company,
        titleQuery,
        keyword,
        location,
        source,
        minMatchScore,
        showAll,
      } = request.query;

      const where = {};
      if (status) {
        where.status = status;
      } else if (showAll !== 'true' && showAll !== true) {
        where.status = { notIn: ['REJECTED', 'MATCH_FAILED'] };
      }

      if (company) where.company = { contains: company, mode: 'insensitive' };

      const titleFilter = titleQuery || keyword;
      if (titleFilter) where.title = { contains: titleFilter, mode: 'insensitive' };
      if (location) where.location = { contains: location, mode: 'insensitive' };
      if (source) where.source = source;

      if (minMatchScore !== undefined && minMatchScore !== null && minMatchScore !== '') {
        where.matches = {
          some: {
            userId: request.user.id,
            result: { path: ['matchScore'], gte: Number(minMatchScore) },
          },
        };
      }

      const [items, total, lastRun] = await Promise.all([
        prisma.job.findMany({
          where,
          orderBy: { discoveredAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            matches: {
              where: { userId: request.user.id },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            applications: {
              where: { userId: request.user.id },
              take: 1,
            },
          },
        }),
        prisma.job.count({ where }),
        prisma.automationRun?.findFirst
          ? prisma.automationRun.findFirst({
              where: { type: 'job-discovery', status: 'COMPLETED' },
              orderBy: { completedAt: 'desc' },
            })
          : Promise.resolve(null),
      ]);

      response.json({
        items,
        total,
        page,
        pageSize,
        matchThreshold: config.MATCH_THRESHOLD,
        lastDiscovery: lastRun ? { completedAt: lastRun.completedAt, stats: lastRun.stats } : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', validate(jobCreateSchema), async (request, response, next) => {
    try {
      const result = await ingestJob(prisma, request.body);
      response.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', validate(idParams, 'params'), async (request, response, next) => {
    try {
      const job = await prisma.job.findUnique({
        where: { id: request.params.id },
        include: {
          matches: {
            where: { userId: request.user.id },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          applications: {
            where: { userId: request.user.id },
            take: 1,
          },
        },
      });
      if (!job) {
        return response.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Job not found' });
      }
      response.json(job);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/analyze', validate(idParams, 'params'), async (request, response, next) => {
    try {
      const job = await getJobOrThrow(prisma, request.params.id);
      const userProfileData = await getUserProfileAndResume(
        prisma,
        request.user.id,
        defaultProfile,
        readMasterResume,
      );

      const result = await analyzeJob({
        prisma,
        provider,
        profile: userProfileData.profile,
        profileVersion: userProfileData.profileVersion,
        resumeText: userProfileData.resumeText,
        job,
        logger,
        userId: request.user.id,
      });

      if (result.eligibility && result.eligibility.eligible === false) {
        return response.status(200).json({
          status: 'INELIGIBLE',
          eligible: false,
          eligibility: result.eligibility,
          match: null,
          cached: false,
          hardFailures: result.eligibility.hardFailures,
          message: 'Job failed deterministic eligibility checks.',
        });
      }

      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/prepare', validate(idParams, 'params'), validate(prepareSchema), async (request, response, next) => {
    try {
      const job = await getJobOrThrow(prisma, request.params.id);
      const userProfileData = await getUserProfileAndResume(
        prisma,
        request.user.id,
        defaultProfile,
        readMasterResume,
      );

      const lastMatch = await prisma.jobMatch.findFirst({
        where: { jobId: job.id, userId: request.user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!lastMatch) {
        const error = new Error('Analyze the job before preparation.');
        error.status = 409;
        throw error;
      }

      const match = lastMatch.result;
      if (match.matchScore < config.MATCH_THRESHOLD || match.recommendation === 'reject') {
        const error = new Error(
          `Job does not meet the configured preparation threshold (Score: ${match.matchScore}%, required: ${config.MATCH_THRESHOLD}%).`
        );
        error.status = 422;
        throw error;
      }

      const existingApplication = await prisma.application.findFirst({
        where: { jobId: job.id, userId: request.user.id },
      });

      const allowedPriorStates = [
        'MATCHED',
        'REJECTED',
        'APPLICATION_PREPARED',
        'AWAITING_APPROVAL',
        'NEEDS_USER_INPUT',
      ];

      if (existingApplication) {
        if (!allowedPriorStates.includes(existingApplication.status)) {
          const error = new Error(`Cannot prepare application in ${existingApplication.status} status.`);
          error.status = 409;
          throw error;
        }

        if (existingApplication.status !== 'MATCHED') {
          await transitionApplication(prisma, existingApplication.id, 'MATCHED', {
            eventType: 'RESET_FOR_PREPARATION',
            message: `Application reset to MATCHED from ${existingApplication.status} for re-preparation.`,
          });
        }
      }

      const generated = await generateTailoredResume({
        provider,
        profile: userProfileData.profile,
        job,
        masterResumePath: masterResumePath || 'resume.md',
      });

      const candidate = userProfileData.candidate;
      const sourceResume = await prisma.resume.create({
        data: {
          candidateId: candidate.id,
          sourcePath: masterResumePath || 'user-profile',
          contentHash: generated.sourceHash,
        },
      });

      const version = await prisma.resumeVersion.create({
        data: {
          resumeId: sourceResume.id,
          jobId: job.id,
          content: generated.text,
          claims: generated.sourceReferences,
          promptVersion: generated._meta.promptVersion,
        },
      });

      const application = await prisma.application.upsert({
        where: {
          jobId_userId: {
            jobId: job.id,
            userId: request.user.id,
          },
        },
        update: {
          resumeVersionId: version.id,
          status: 'MATCHED',
        },
        create: {
          jobId: job.id,
          userId: request.user.id,
          resumeVersionId: version.id,
          status: 'MATCHED',
        },
      });

      const answers = request.body.questions.map((question) =>
        resolveAnswer(question, userProfileData.profile)
      );

      if (answers.length) {
        await prisma.applicationAnswer.deleteMany({ where: { applicationId: application.id } });
        await prisma.applicationAnswer.createMany({
          data: answers.map((answer) => ({
            applicationId: application.id,
            ...answer,
            sourceRefs: answer.sourceRefs,
          })),
        });
      }

      let current = await transitionApplication(prisma, application.id, 'APPLICATION_PREPARED', {
        eventType: 'PREPARED',
        message: 'Tailored resume was prepared and truth-validated.',
      });

      const needsInput = answers.some((answer) => answer.status === 'NEEDS_USER_INPUT');
      if (needsInput) {
        current = await transitionApplication(prisma, application.id, 'NEEDS_USER_INPUT', {
          eventType: 'USER_INPUT_REQUIRED',
          message: 'One or more application answers require truthful user input.',
        });
      } else {
        current = await transitionApplication(prisma, application.id, 'AWAITING_APPROVAL', {
          eventType: 'AWAITING_APPROVAL',
          message: 'Prepared application awaits explicit human approval.',
        });
        if (queues && queues['notification']) {
          await queues['notification'].add(
            'approval-required',
            {
              type: 'AWAITING_APPROVAL',
              applicationId: current.id,
              jobId: job.id,
              title: `Action Required: Application Ready for Approval (${job.company})`,
              subject: `Action Required: Application Ready for Approval (${job.company})`,
              text: `Application materials (tailored resume and answers) are ready for ${job.title} at ${job.company}.\n\nPlease review and approve autofill at: ${config?.FRONTEND_URL || 'http://localhost:5173'}/applications`,
              to: userProfileData.profile?.identity?.email || userProfileData.profile?.candidate?.email || request.user?.email || config?.NOTIFICATION_TO || null,
              metadata: { applicationId: current.id, jobId: job.id },
            },
            { jobId: `notify-approval-${current.id}-${Date.now()}` }
          );
        }
      }

      response.status(201).json({ application: current, generated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/approve', validate(idParams, 'params'), validate(actorSchema), async (request, response, next) => {
    try {
      const application = await prisma.application.findFirst({
        where: { jobId: request.params.id, userId: request.user.id },
      });
      if (!application) {
        const error = new Error('Prepare an application before approval.');
        error.status = 409;
        throw error;
      }

      const approved = await transitionApplication(prisma, application.id, 'APPROVED', {
        eventType: 'APPROVED',
        message: 'Explicit human approval recorded.',
      });

      await prisma.userApproval.create({
        data: {
          applicationId: application.id,
          userId: request.user.id,
          approved: true,
          actor: request.body.actor,
          note: request.body.note,
        },
      });

      const time = approved.updatedAt?.getTime?.() ?? Date.now();
      if (queues && queues['browser-application']) {
        await queues['browser-application'].add(
          'fill-application',
          {
            applicationId: application.id,
            mode: 'fill',
            idempotencyKey: `fill-${application.id}-${time}`,
          },
          { jobId: `fill-${application.id}-${time}` }
        );
      }

      response.json(approved);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/reject', validate(idParams, 'params'), validate(actorSchema), async (request, response, next) => {
    try {
      const application = await prisma.application.findFirst({
        where: { jobId: request.params.id, userId: request.user.id },
      });
      if (!application) {
        await prisma.job.update({ where: { id: request.params.id }, data: { status: 'REJECTED' } });
        return response.status(204).end();
      }

      const rejected = await transitionApplication(prisma, application.id, 'REJECTED', {
        eventType: 'REJECTED',
        message: 'User rejected application.',
      });

      await prisma.userApproval.create({
        data: {
          applicationId: application.id,
          userId: request.user.id,
          approved: false,
          actor: request.body.actor,
          note: request.body.note,
        },
      });

      response.json(rejected);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
