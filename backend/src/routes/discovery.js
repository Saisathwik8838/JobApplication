import { Router } from 'express';
/** @param {import('../app.js').AppDependencies} dependencies */
export function discoveryRouter({ queues }) { const router = Router(); router.post('/run', async (_request, response, next) => { try { const idempotencyKey = `manual-discovery:${Date.now()}`; const job = await queues['job-discovery'].add('discover', { mode: 'manual', idempotencyKey }, { jobId: idempotencyKey }); response.status(202).json({ queued: true, queueJobId: job.id }); } catch (error) { next(error); } }); return router; }
