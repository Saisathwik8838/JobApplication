import { Router } from 'express';
import { z } from 'zod';
import { jobCreateSchema, jobsQuerySchema } from '@job-agent/shared-schemas';
import { validate } from '../middleware/validate.js';
import { ingestJob, getJobOrThrow } from '../modules/jobs/jobService.js';
import { analyzeJob } from '../modules/matching/matchingService.js';
import { generateTailoredResume } from '../modules/resume/resumeService.js';
import { resolveAnswer } from '../modules/applications/answerResolver.js';
import { transitionApplication } from '../modules/applications/applicationStateMachine.js';

const idParams = z.object({ id: z.string().min(1) });
const prepareSchema = z.object({ questions: z.array(z.string().min(1)).max(100).default([]) });
const actorSchema = z.object({ actor: z.string().min(1).max(100).default('local-user'), note: z.string().max(1000).optional() });

/** @param {import('../app.js').AppDependencies} dependencies */
export function jobsRouter(dependencies) {
  const router = Router(); const { prisma, profile, profileVersion, masterResumePath, provider, logger, config, queues } = dependencies;
  router.get('/', validate(jobsQuerySchema, 'query'), async (request, response, next) => { try { const { page, pageSize, status } = request.query; const where = status ? { status } : {}; const [items, total] = await Promise.all([prisma.job.findMany({ where, orderBy: { discoveredAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { matches: { orderBy: { createdAt: 'desc' }, take: 1 }, applications: true } }), prisma.job.count({ where })]); response.json({ items, total, page, pageSize }); } catch (error) { next(error); } });
  router.post('/', validate(jobCreateSchema), async (request, response, next) => { try { const result = await ingestJob(prisma, request.body); response.status(result.created ? 201 : 200).json(result); } catch (error) { next(error); } });
  router.get('/:id', validate(idParams, 'params'), async (request, response, next) => { try { response.json(await getJobOrThrow(prisma, request.params.id)); } catch (error) { next(error); } });
  router.post('/:id/analyze', validate(idParams, 'params'), async (request, response, next) => {
    try {
      const job = await getJobOrThrow(prisma, request.params.id);
      const result = await analyzeJob({
        prisma,
        provider,
        profile,
        profileVersion,
        resumeText: await dependencies.readMasterResume(),
        job,
        logger,
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
      const lastMatch = job.matches[0];
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

      const existingApplication = await prisma.application.findUnique({
        where: { jobId: job.id },
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

      const generated = await generateTailoredResume({ provider, profile, job, masterResumePath });
      const candidate = await prisma.candidate.upsert({
        where: { profileVersion },
        update: { profile },
        create: { profileVersion, profile },
      });
      const sourceResume = await prisma.resume.create({
        data: { candidateId: candidate.id, sourcePath: masterResumePath, contentHash: generated.sourceHash },
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
        where: { jobId: job.id },
        update: { resumeVersionId: version.id, status: 'MATCHED' },
        create: { jobId: job.id, resumeVersionId: version.id, status: 'MATCHED' },
      });

      const answers = request.body.questions.map((question) => resolveAnswer(question, profile));
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
              text: `Application materials (tailored resume and answers) are ready for ${job.title} at ${job.company}.\n\nPlease review and approve autofill at: http://localhost:5173/applications`,
              to: profile?.candidate?.email,
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
  router.post('/:id/approve', validate(idParams, 'params'), validate(actorSchema), async (request, response, next) => { try { const job = await getJobOrThrow(prisma, request.params.id); const application = job.applications[0]; if (!application) { const error = new Error('Prepare an application before approval.'); error.status = 409; throw error; } const approved = await transitionApplication(prisma, application.id, 'APPROVED', { eventType: 'APPROVED', message: 'Explicit human approval recorded.' }); await prisma.userApproval.create({ data: { applicationId: application.id, approved: true, actor: request.body.actor, note: request.body.note } }); await queues['browser-application'].add('fill-application', { applicationId: application.id, mode: 'fill', idempotencyKey: `fill-${application.id}-${approved.updatedAt.getTime()}` }, { jobId: `fill-${application.id}-${approved.updatedAt.getTime()}` }); response.json(approved); } catch (error) { next(error); } });
  router.post('/:id/reject', validate(idParams, 'params'), validate(actorSchema), async (request, response, next) => { try { const job = await getJobOrThrow(prisma, request.params.id); const application = job.applications[0]; if (!application) { await prisma.job.update({ where: { id: job.id }, data: { status: 'REJECTED' } }); return response.status(204).end(); } const rejected = await transitionApplication(prisma, application.id, 'REJECTED', { eventType: 'REJECTED', message: 'User rejected application.' }); await prisma.userApproval.create({ data: { applicationId: application.id, approved: false, actor: request.body.actor, note: request.body.note } }); response.json(rejected); } catch (error) { next(error); } });
  return router;
}
