import { Router } from 'express';
/** @param {import('../app.js').AppDependencies} dependencies */
export function automationRunsRouter({ prisma }) { const router = Router(); router.get('/', async (_request, response, next) => { try { response.json(await prisma.automationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 })); } catch (error) { next(error); } }); return router; }
