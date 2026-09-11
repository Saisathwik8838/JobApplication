import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

import { loadConfig } from '../config/config.js';
import { logger } from '../logger.js';
import { loadCandidateProfile } from '../modules/candidate/profileRepository.js';
import { getLLMProvider } from '../modules/ai/providerFactory.js';
import { createQueues } from '../queues/queues.js';
import { runDiscovery } from '../modules/jobs/discoveryService.js';
import { createJobSources } from '../modules/jobs/sourceFactory.js';
import { analyzeJob } from '../modules/matching/matchingService.js';
import { BrowserManager } from '../modules/browser/browserManager.js';
import { ApplicationSession } from '../modules/browser/applicationSession.js';
import { selectAdapter } from '../modules/browser/adapterRegistry.js';
import { SubmissionManager } from '../modules/browser/submissionManager.js';
import { transitionApplication } from '../modules/applications/applicationStateMachine.js';
import { NotificationDispatcher } from '../modules/notifications/notificationDispatcher.js';

const config = loadConfig();
const prisma = new PrismaClient();

const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const queues = createQueues(connection);

let profilePath = resolve(process.cwd(), config.PROFILE_PATH);
if (!existsSync(profilePath)) {
  const alternate = resolve(process.cwd(), config.PROFILE_PATH.replace(/^\.\.\//, ''));
  if (existsSync(alternate)) profilePath = alternate;
}

const { profile, version: profileVersion } =
  await loadCandidateProfile(profilePath);

let masterResumePath = resolve(dirname(profilePath), 'resume', 'master_resume.md');
if (!existsSync(masterResumePath)) {
  const fallback = resolve(process.cwd(), '..', 'profile', 'resume', 'master_resume.md');
  if (existsSync(fallback)) masterResumePath = fallback;
}

const provider = getLLMProvider({
  ...config,
  logger,
});

const browserManager = new BrowserManager({
  headless: config.HEADLESS,
  logger,
});

const notificationDispatcher = new NotificationDispatcher({
  channels: config.NOTIFICATION_CHANNELS,
  emailConfig: {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER,
    password: config.SMTP_PASSWORD,
    from: config.NOTIFICATION_FROM,
  },
  webhookConfig: {
    url: config.WEBHOOK_NOTIFICATION_URL,
  },
  logger,
});

const workerOptions = {
  connection,
  concurrency: 2,
};

/**
 * Evaluates the page inputs against expected snapshot values before submission.
 * @param {import('playwright').Page} page
 * @param {Record<string, string>} expectedData
 */
async function verifyPageFields(page, expectedData) {
  if (!expectedData || Object.keys(expectedData).length === 0) {
    return { verified: true, mismatches: [] };
  }
  return page.evaluate((expected) => {
    const mismatches = [];

    function findFieldElement(key) {
      const byId = document.getElementById(key);
      if (byId) return byId;

      try {
        const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(key) : key;
        const byAttr = document.querySelector(`[name="${escaped}"], [data-qa="${escaped}"], [aria-label="${escaped}"]`);
        if (byAttr) return byAttr;
      } catch {
        // Ignore CSS selector escape error
      }

      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        if (label.textContent && label.textContent.trim().toLowerCase() === key.trim().toLowerCase()) {
          if (label.htmlFor) {
            const el = document.getElementById(label.htmlFor);
            if (el) return el;
          }
          const nested = label.querySelector('input, textarea, select');
          if (nested) return nested;
        }
      }
      return null;
    }

    for (const [key, expVal] of Object.entries(expected)) {
      if (expVal === undefined || expVal === null) continue;
      const el = findFieldElement(key);
      if (el) {
        const actualVal = el.value;
        if (actualVal !== expVal) {
          mismatches.push({ field: key, expected: expVal, actual: actualVal });
        }
      }
    }
    return { verified: mismatches.length === 0, mismatches };
  }, expectedData);
}

new Worker(
  'job-discovery',
  async (job) => {
    const run = await prisma.automationRun.upsert({
      where: {
        idempotencyKey: job.data.idempotencyKey,
      },
      update: {},
      create: {
        type: 'job-discovery',
        idempotencyKey: job.data.idempotencyKey,
        status: 'RUNNING',
      },
    });

    const stats = await runDiscovery({
      prisma,
      sources: createJobSources(config),
      logger,
      queues,
    });

    await prisma.automationRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: 'COMPLETED',
        stats,
        completedAt: new Date(),
      },
    });

    return stats;
  },
  workerOptions,
);

new Worker(
  'ai-matching',
  async (job) => {
    const found = await prisma.job.findUnique({
      where: {
        id: job.data.jobId,
      },
    });

    if (!found) {
      throw new Error('Job no longer exists.');
    }

    const result = await analyzeJob({
      prisma,
      provider,
      profile,
      profileVersion,
      resumeText: await readFile(masterResumePath, 'utf8'),
      job: found,
      logger,
    });

    // Gate 0 Notification: High match discovered
    if (result && result.matchScore >= config.MATCH_THRESHOLD) {
      try {
        await queues['notification'].add(
          'gate0-high-match',
          {
            type: 'HIGH_MATCH',
            subject: `High Match Alert: ${found.title} at ${found.company} (${Math.round(result.matchScore * 100)}%)`,
            text: `Found a strong match for your profile!\n\nRole: ${found.title}\nCompany: ${found.company}\nMatch Score: ${Math.round(result.matchScore * 100)}%\nRecommendation: ${result.recommendation}\n\nExplanation:\n${result.explanation || result.reasoning || 'Strong alignment with your background.'}\n\nReview job and prepare application:\nhttp://localhost:5173/jobs?selected=${found.id}`,
            to: profile?.candidate?.email || config.NOTIFICATION_TO || 'candidate@example.com',
            metadata: {
              jobId: found.id,
              jobTitle: found.title,
              company: found.company,
              url: found.url,
              matchScore: result.matchScore,
              recommendation: result.recommendation,
              actionUrl: `http://localhost:5173/jobs?selected=${found.id}`,
            },
          },
          {
            jobId: `match-${found.id}-${Date.now()}`,
          }
        );
      } catch (notifyErr) {
        logger.warn({ error: notifyErr.message }, 'Failed to enqueue high-match notification');
      }
    }

    return result;
  },
  workerOptions,
);

new Worker(
  'browser-application',
  async (job) => {
    const { applicationId, mode = 'fill' } = job.data;
    const application = await prisma.application.findUnique({
      where: {
        id: applicationId,
      },
      include: {
        job: true,
        answers: true,
      },
    });

    if (!application) {
      return { skipped: true, reason: 'Application not found.' };
    }

    if (mode === 'fill') {
      if (!['APPROVED', 'FILLED_AWAITING_RECHECK', 'MANUAL_INTERVENTION'].includes(application.status)) {
        return {
          skipped: true,
          reason: `Application status ${application.status} is not eligible for filling.`,
        };
      }

      await transitionApplication(
        prisma,
        application.id,
        'FILLING',
        {
          eventType: 'AUTOFILL_STARTED',
          message: 'Auto-fill form started.',
        },
      );

      let sessionObj;
      try {
        sessionObj = await browserManager.createSession(application.id, application.job.url);
      } catch (err) {
        logger.error({ error: err.message }, 'Failed to launch browser session');
        return transitionApplication(
          prisma,
          application.id,
          'MANUAL_INTERVENTION',
          {
            eventType: 'BROWSER_ERROR',
            message: `Browser launch failed: ${err.message}`,
          },
        );
      }

      const { page } = sessionObj;
      const adapter = await selectAdapter(application.job.url, page);

      if (!adapter) {
        await browserManager.closeSession(application.id);
        return transitionApplication(
          prisma,
          application.id,
          'MANUAL_INTERVENTION',
          {
            eventType: 'NO_ADAPTER',
            message: 'No safe adapter exists for this application.',
          },
        );
      }

      const session = new ApplicationSession({
        page,
        job: application.job,
        application,
        answers: application.answers,
      });

      const filled = await adapter.fill(session);

      if (filled.status !== 'READY_FOR_REVIEW') {
        await browserManager.closeSession(application.id);
        return transitionApplication(
          prisma,
          application.id,
          'MANUAL_INTERVENTION',
          {
            eventType: 'AUTOMATION_PAUSED',
            message: filled.reason ?? 'Automation requires manual intervention.',
            metadata: filled,
          },
        );
      }

      // Capture screenshot and structured field values
      let screenshotBase64 = null;
      try {
        const buffer = await page.screenshot({ fullPage: true });
        screenshotBase64 = buffer.toString('base64');
      } catch (err) {
        logger.warn({ error: err.message }, 'Failed to capture screenshot');
      }

      const filledData = filled.filledValues || {};

      await prisma.application.update({
        where: { id: application.id },
        data: {
          filledData,
          screenshot: screenshotBase64,
        },
      });

      // Pause automation at Gate 2: FILLED_AWAITING_RECHECK (do NOT submit)
      const updated = await transitionApplication(
        prisma,
        application.id,
        'FILLED_AWAITING_RECHECK',
        {
          eventType: 'AUTOFILL_COMPLETED',
          message: 'Application form filled. Paused awaiting user recheck approval.',
          metadata: {
            fieldsCount: Object.keys(filledData).length,
            hasScreenshot: Boolean(screenshotBase64),
          },
        },
      );

      // Gate 2 Notification
      try {
        await queues['notification'].add(
          'gate2-recheck-approval',
          {
            type: 'GATE2_RECHECK',
            subject: `Action Required: Recheck Filled Application (${application.job.company})`,
            text: `Application for ${application.job.title} at ${application.job.company} has been auto-filled.\n\nPlease review the screenshot and filled fields before final submission:\nhttp://localhost:5173/applications`,
            to: profile?.candidate?.email || config.NOTIFICATION_TO || 'candidate@example.com',
            applicationId: application.id,
            jobTitle: application.job.title,
            company: application.job.company,
            url: application.job.url,
            fieldsCount: Object.keys(filledData).length,
            actionUrl: 'http://localhost:5173/applications',
            metadata: {
              applicationId: application.id,
              jobId: application.jobId,
              fieldsCount: Object.keys(filledData).length,
            },
          },
          {
            jobId: `gate2-${application.id}-${Date.now()}`,
          },
        );
      } catch (notifyErr) {
        logger.warn({ error: notifyErr.message }, 'Failed to enqueue gate 2 notification');
      }

      return updated;
    }

    if (mode === 'submit') {
      if (application.status !== 'RESUBMIT_APPROVED') {
        return {
          skipped: true,
          reason: `Application status ${application.status} is not approved for final submission.`,
        };
      }

      const submitting = await transitionApplication(
        prisma,
        application.id,
        'SUBMITTING',
        {
          eventType: 'SUBMISSION_STARTED',
          message: 'Approved browser submission started.',
        },
      );

      let page;
      let adapter;

      if (browserManager.hasSession(application.id)) {
        page = browserManager.getSession(application.id).page;
        adapter = await selectAdapter(application.job.url, page);
      } else {
        const sessionObj = await browserManager.createSession(application.id, application.job.url);
        page = sessionObj.page;
        adapter = await selectAdapter(application.job.url, page);

        if (!adapter) {
          await browserManager.closeSession(application.id);
          return transitionApplication(
            prisma,
            application.id,
            'MANUAL_INTERVENTION',
            {
              eventType: 'NO_ADAPTER',
              message: 'No safe adapter exists for this application.',
            },
          );
        }

        const session = new ApplicationSession({
          page,
          job: application.job,
          application,
          answers: application.answers,
        });

        const reFilled = await adapter.fill(session);
        if (reFilled.status !== 'READY_FOR_REVIEW') {
          await browserManager.closeSession(application.id);
          return transitionApplication(
            prisma,
            application.id,
            'MANUAL_INTERVENTION',
            {
              eventType: 'AUTOMATION_PAUSED',
              message: 'Re-filling form failed prior to submission.',
              metadata: reFilled,
            },
          );
        }
      }

      // Re-verify filled form values against saved snapshot
      const verification = await verifyPageFields(page, application.filledData);
      if (!verification.verified) {
        await browserManager.closeSession(application.id);
        return transitionApplication(
          prisma,
          application.id,
          'MANUAL_INTERVENTION',
          {
            eventType: 'VERIFICATION_MISMATCH',
            message: 'Form fields changed and no longer match reviewed snapshot.',
            metadata: { mismatches: verification.mismatches },
          },
        );
      }

      const session = new ApplicationSession({
        page,
        job: application.job,
        application,
        answers: application.answers,
      });

      const result = await new SubmissionManager({
        requireApproval: config.REQUIRE_APPROVAL,
      }).submit({
        ...session,
        application: submitting,
      });

      await browserManager.closeSession(application.id);

      if (result.status === 'SUBMITTED') {
        await prisma.application.update({
          where: {
            id: application.id,
          },
          data: {
            submittedAt: new Date(),
            submissionUrl: result.confirmationUrl,
          },
        });

        return transitionApplication(
          prisma,
          application.id,
          'SUBMITTED',
          {
            eventType: 'SUBMITTED',
            message: 'Submission confirmation captured.',
            metadata: result,
          },
        );
      }

      return transitionApplication(
        prisma,
        application.id,
        'MANUAL_INTERVENTION',
        {
          eventType: 'AUTOMATION_PAUSED',
          message: result.reason,
          metadata: result,
        },
      );
    }

    return { skipped: true, reason: `Unknown mode ${mode}` };
  },
  {
    ...workerOptions,
    concurrency: 1,
  },
);

new Worker(
  'notification',
  async (job) => notificationDispatcher.send(job.data),
  workerOptions,
);

logger.info('Workers started');

async function close() {
  for (const [appId] of browserManager.activeSessions) {
    await browserManager.closeSession(appId);
  }
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
