import { Router } from 'express'; import { z } from 'zod'; import { validate } from '../middleware/validate.js'; import { transitionApplication } from '../modules/applications/applicationStateMachine.js';
const idParams = z.object({ id: z.string().min(1) }); const editAnswerSchema = z.object({ answer: z.string().min(1).max(10000) });
/** @param {import('../app.js').AppDependencies} dependencies */
export function applicationsRouter({ prisma, queues }) { const router = Router();
  router.get('/', async (_request, response, next) => { try { response.json(await prisma.application.findMany({ include: { job: true, resumeVersion: true, answers: true, events: { orderBy: { timestamp: 'desc' } }, approvals: true }, orderBy: { updatedAt: 'desc' } })); } catch (error) { next(error); } });
  router.get('/:id', validate(idParams, 'params'), async (request, response, next) => { try { const application = await prisma.application.findUnique({ where: { id: request.params.id }, include: { job: true, resumeVersion: true, answers: true, events: { orderBy: { timestamp: 'desc' } }, approvals: true } }); if (!application) return response.status(404).json({ error: 'APPLICATION_NOT_FOUND' }); response.json(application); } catch (error) { next(error); } });
  router.patch('/:id/answers/:answerId', validate(z.object({ id: z.string(), answerId: z.string() }), 'params'), validate(editAnswerSchema), async (request, response, next) => {
    try {
      const existing = await prisma.applicationAnswer.findUnique({ where: { id: request.params.answerId } });
      if (!existing || existing.applicationId !== request.params.id) return response.status(404).json({ error: 'ANSWER_NOT_FOUND' });
      const answer = await prisma.applicationAnswer.update({ where: { id: request.params.answerId }, data: { answer: request.body.answer, status: 'READY', confidence: 'medium' } });
      const remainingNeeded = await prisma.applicationAnswer.count({ where: { applicationId: request.params.id, status: 'NEEDS_USER_INPUT' } });
      if (remainingNeeded === 0) {
        const app = await prisma.application.findUnique({ where: { id: request.params.id } });
        if (app && app.status === 'NEEDS_USER_INPUT') {
          await transitionApplication(prisma, request.params.id, 'APPLICATION_PREPARED', { eventType: 'ANSWERS_RESOLVED', message: 'All questions have been answered truthfully.' });
          await transitionApplication(prisma, request.params.id, 'AWAITING_APPROVAL', { eventType: 'AWAITING_APPROVAL', message: 'Prepared application awaits explicit human approval.' });
        }
      }
      response.json(answer);
    } catch (error) { next(error); }
  });
  router.post('/:id/retry', validate(idParams, 'params'), async (request, response, next) => { try { const approved = await transitionApplication(prisma, request.params.id, 'APPROVED', { eventType: 'RETRY_APPROVED', message: 'User requested a safe retry.' }); await queues['browser-application'].add('retry-approved-application', { applicationId: approved.id, idempotencyKey: `retry:${approved.id}:${approved.updatedAt.toISOString()}` }); response.json(approved); } catch (error) { next(error); } });
  return router; }
