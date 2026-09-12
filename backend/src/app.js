import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { errorHandler } from './middleware/errors.js';
import { notFound } from './middleware/notFound.js';

import { authRouter } from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';
import { jobsRouter } from './routes/jobs.js';
import { applicationsRouter } from './routes/applications.js';
import { dashboardRouter } from './routes/dashboard.js';
import { profileRouter } from './routes/profile.js';
import { discoveryRouter } from './routes/discovery.js';
import { automationRunsRouter } from './routes/automationRuns.js';

/**
 * @typedef {{
 *   prisma: any,
 *   queues: any,
 *   profile: import('@job-agent/shared-schemas').CandidateProfile,
 *   profileVersion: string,
 *   profilePath: string,
 *   masterResumePath: string,
 *   readMasterResume: () => Promise<string>,
 *   provider: import('./modules/ai/types.js').LLMProvider,
 *   logger: import('pino').Logger,
 *   config: any,
 *   sources: any[],
 *   mockGoogleVerify?: (credential: string) => Promise<{ googleId: string, email: string, name?: string }>
 * }} AppDependencies
 */

/**
 * @param {AppDependencies} dependencies
 */
export function createApp(dependencies) {
  const app = express();

  const allowedOrigins = dependencies.config.ALLOWED_ORIGINS
    ? dependencies.config.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:5173'];

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  app.use(
    pinoHttp({
      logger: dependencies.logger,
    }),
  );

  app.get('/health', (_request, response) =>
    response.json({ status: 'ok' }),
  );

  const auth = authMiddleware(dependencies.config.JWT_SECRET);

  app.use('/api/auth', authRouter(dependencies));
  app.use('/api/jobs', auth, jobsRouter(dependencies));
  app.use('/api/applications', auth, applicationsRouter(dependencies));
  app.use('/api/dashboard', auth, dashboardRouter(dependencies));
  app.use('/api/profile', auth, profileRouter(dependencies));
  app.use('/api/discovery', auth, discoveryRouter(dependencies));
  app.use('/api/automation/runs', auth, automationRunsRouter(dependencies));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
