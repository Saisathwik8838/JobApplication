import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { transitionApplication } from '../modules/applications/applicationStateMachine.js';

const idParams = z.object({ id: z.string().min(1) });
const editAnswerSchema = z.object({ answer: z.string().min(1).max(10000) });
const actorSchema = z.object({
  actor: z.string().min(1).max(100).default('local-user'),
  note: z.string().max(1000).optional(),
});
const markSubmittedSchema = z.object({
  actor: z.string().min(1).max(100).default('user-manual'),
  note: z.string().max(1000).optional(),
  submissionUrl: z.string().url().or(z.literal('')).optional(),
});

/** @param {import('../app.js').AppDependencies} dependencies */
export function applicationsRouter({ prisma, queues, profile }) {
  const router = Router();

  router.get('/', async (request, response, next) => {
    try {
      const items = await prisma.application.findMany({
        where: { userId: request.user.id },
        include: {
          job: true,
          resumeVersion: true,
          answers: true,
          events: { orderBy: { timestamp: 'desc' } },
          approvals: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
      response.json(items);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', validate(idParams, 'params'), async (request, response, next) => {
    try {
      const application = await prisma.application.findFirst({
        where: { id: request.params.id, userId: request.user.id },
        include: {
          job: true,
          resumeVersion: true,
          answers: true,
          events: { orderBy: { timestamp: 'desc' } },
          approvals: true,
        },
      });
      if (!application) return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
      response.json(application);
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    '/:id/answers/:answerId',
    validate(z.object({ id: z.string(), answerId: z.string() }), 'params'),
    validate(editAnswerSchema),
    async (request, response, next) => {
      try {
        const app = await prisma.application.findFirst({
          where: { id: request.params.id, userId: request.user.id },
          include: { job: true, approvals: true },
        });
        if (!app) {
          return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
        }

        const existing = await prisma.applicationAnswer.findUnique({
          where: { id: request.params.answerId },
        });
        if (!existing || existing.applicationId !== request.params.id) {
          return response.status(404).json({ error: 'ANSWER_NOT_FOUND' });
        }

        const answer = await prisma.applicationAnswer.update({
          where: { id: request.params.answerId },
          data: { answer: request.body.answer, status: 'READY', confidence: 'medium' },
        });

        const remainingNeeded = await prisma.applicationAnswer.count({
          where: { applicationId: request.params.id, status: 'NEEDS_USER_INPUT' },
        });

        if (remainingNeeded === 0 && app.status === 'NEEDS_USER_INPUT') {
          // Check if Gate 1 was already approved
          const hasGate1Approval = app.approvals.some((a) => a.approved);

          if (hasGate1Approval) {
            // Resume browser filling automatically!
            await transitionApplication(prisma, request.params.id, 'FILLING', {
              eventType: 'ANSWERS_RESOLVED_AUTO_RESUME',
              message: 'All questions answered truthfully. Resuming form auto-fill.',
            });

            const jobId = `fill-resumed-${app.id}-${Date.now()}`;
            if (queues && queues['browser-application']) {
              await queues['browser-application'].add(
                'fill-application',
                {
                  applicationId: app.id,
                  mode: 'fill',
                  idempotencyKey: jobId,
                },
                { jobId }
              );
            }
          } else {
            // Pre-approval stage: advance to AWAITING_APPROVAL
            await transitionApplication(prisma, request.params.id, 'APPLICATION_PREPARED', {
              eventType: 'ANSWERS_RESOLVED',
              message: 'All questions have been answered truthfully.',
            });
            await transitionApplication(prisma, request.params.id, 'AWAITING_APPROVAL', {
              eventType: 'AWAITING_APPROVAL',
              message: 'Prepared application awaits explicit human approval.',
            });

            if (queues && queues['notification']) {
              await queues['notification'].add(
                'approval-required',
                {
                  type: 'AWAITING_APPROVAL',
                  applicationId: app.id,
                  jobId: app.jobId,
                  title: `Action Required: Application Ready for Approval (${app.job?.company})`,
                  subject: `Action Required: Application Ready for Approval (${app.job?.company})`,
                  text: `All answers are resolved for ${app.job?.title} at ${app.job?.company}.\nPlease review and approve autofill at: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/applications`,
                  to: profile?.identity?.email || profile?.candidate?.email || request.user?.email || process.env.NOTIFICATION_TO || null,
                  metadata: { applicationId: app.id, jobId: app.jobId },
                },
                { jobId: `notify-approval-${app.id}-${Date.now()}` }
              );
            }
          }
        }
        response.json(answer);
      } catch (error) {
        next(error);
      }
    }
  );

  // Gate 2: Confirm Submission after human recheck (for legacy or explicit confirm)
  router.post(
    '/:id/confirm-submit',
    validate(idParams, 'params'),
    validate(actorSchema),
    async (request, response, next) => {
      try {
        const application = await prisma.application.findFirst({
          where: { id: request.params.id, userId: request.user.id },
          include: { job: true },
        });
        if (!application) {
          return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
        }
        if (application.status !== 'FILLED_AWAITING_RECHECK') {
          return response.status(409).json({
            error: 'INVALID_STATE',
            message: `Application must be in FILLED_AWAITING_RECHECK state to confirm submit (current: ${application.status}).`,
          });
        }

        const approved = await transitionApplication(
          prisma,
          application.id,
          'RESUBMIT_APPROVED',
          {
            eventType: 'RESUBMIT_APPROVED',
            message: 'Second human approval recorded for final submission.',
            metadata: { actor: request.body.actor, note: request.body.note },
          }
        );

        await prisma.userApproval.create({
          data: {
            applicationId: application.id,
            userId: request.user.id,
            approved: true,
            actor: request.body.actor,
            note: request.body.note ?? 'Second gate: approved after human recheck',
          },
        });

        const jobId = `submit-${application.id}-${Date.now()}`;
        await queues['browser-application'].add(
          'submit-rechecked-application',
          {
            applicationId: application.id,
            mode: 'submit',
            idempotencyKey: jobId,
          },
          { jobId }
        );

        response.json(approved);
      } catch (error) {
        next(error);
      }
    }
  );

  // Reject application at any stage (Gate 1 or Gate 2)
  router.post(
    '/:id/reject',
    validate(idParams, 'params'),
    validate(actorSchema),
    async (request, response, next) => {
      try {
        const application = await prisma.application.findFirst({
          where: { id: request.params.id, userId: request.user.id },
        });
        if (!application) {
          return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
        }

        const rejected = await transitionApplication(prisma, application.id, 'REJECTED', {
          eventType: 'REJECTED',
          message: 'User rejected application.',
          metadata: { actor: request.body.actor, note: request.body.note },
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
    }
  );

  // Refill application after editing answers
  router.post(
    '/:id/refill',
    validate(idParams, 'params'),
    async (request, response, next) => {
      try {
        const application = await prisma.application.findFirst({
          where: { id: request.params.id, userId: request.user.id },
        });
        if (!application) {
          return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
        }

        const approved = await transitionApplication(prisma, application.id, 'APPROVED', {
          eventType: 'REFILL_REQUESTED',
          message: 'User requested a fresh autofill after review.',
        });

        const jobId = `fill-${application.id}-${Date.now()}`;
        await queues['browser-application'].add(
          'fill-application',
          {
            applicationId: approved.id,
            mode: 'fill',
            idempotencyKey: jobId,
          },
          { jobId }
        );

        response.json(approved);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post('/:id/retry', validate(idParams, 'params'), async (request, response, next) => {
    try {
      const application = await prisma.application.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!application) {
        return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
      }

      const approved = await transitionApplication(prisma, application.id, 'APPROVED', {
        eventType: 'RETRY_APPROVED',
        message: 'User requested a safe retry.',
      });
      const jobId = `retry-${approved.id}-${Date.now()}`;
      await queues['browser-application'].add(
        'retry-approved-application',
        {
          applicationId: approved.id,
          mode: 'fill',
          idempotencyKey: jobId,
        },
        { jobId }
      );
      response.json(approved);
    } catch (error) {
      next(error);
    }
  });

  // Mark application as submitted manually by the user
  router.post(
    '/:id/mark-submitted',
    validate(idParams, 'params'),
    validate(markSubmittedSchema),
    async (request, response, next) => {
      try {
        const application = await prisma.application.findFirst({
          where: { id: request.params.id, userId: request.user.id },
          include: { job: true },
        });
        if (!application) {
          return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' });
        }

        const note = request.body.note || 'Manually finished and submitted by candidate.';
        const submissionUrl = request.body.submissionUrl || application.submissionUrl || application.job.url;

        const submitted = await transitionApplication(prisma, application.id, 'SUBMITTED', {
          eventType: 'MANUALLY_SUBMITTED',
          message: note,
          metadata: {
            actor: request.body.actor,
            submissionUrl,
            previousStatus: application.status,
          },
        });

        await prisma.application.update({
          where: { id: application.id },
          data: {
            submittedAt: new Date(),
            submissionUrl,
            error: null,
          },
        });

        await prisma.userApproval.create({
          data: {
            applicationId: application.id,
            userId: request.user.id,
            approved: true,
            actor: request.body.actor,
            note,
          },
        });

        response.json(submitted);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
