import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (value === true || value === false) return value;
  if (typeof value === 'string' && /^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  return value;
}, z.boolean());

const emptyToUndefined = (value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalPositiveInt = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LLM_PROVIDER: z.enum(['openai', 'anthropic']),
  LLM_MODEL: z.string().min(1),
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  MATCH_THRESHOLD: z.coerce.number().min(0).max(100).default(75),
  REQUIRE_APPROVAL: booleanFromString,
  MAX_APPLICATIONS_PER_DAY: z.coerce.number().int().positive().default(20),
  PROFILE_PATH: z.string().min(1),
  NOTIFICATION_FROM: z.string().email(),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPositiveInt,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().default('dev-secret-job-agent-jwt-change-in-production'),
  HEADLESS: booleanFromString.default(false),
  JOB_SOURCES: z.string().default('adzuna,ncs,arbeitnow'),
  INDIA_ONLY: booleanFromString.default(true),
  ADZUNA_APP_ID: optionalString,
  ADZUNA_APP_KEY: optionalString,
  ADZUNA_COUNTRY: z.string().default('in'),
  NCS_API_KEY: optionalString,
  NCS_RESOURCE_ID: optionalString,
  COMPANY_CAREER_SOURCES: optionalString,
  RSS_FEED_URLS: optionalString,
  NOTIFICATION_CHANNELS: z.string().default('email,webhook'),
  WEBHOOK_NOTIFICATION_URL: optionalString,
  NOTIFICATION_TO: optionalString,
  DISCOVERY_INTERVAL_CRON: z.string().default('*/15 * * * *'),
  FRONTEND_URL: z.string().default('http://localhost:5173')
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'development' && value.JWT_SECRET === 'dev-secret-job-agent-jwt-change-in-production') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET must be explicitly configured in non-development environments instead of using the default secret.',
    });
  }

  const isPlaceholderKey = (key) => !key || /^(your-|dummy|placeholder|change-me|<)/i.test(key.trim());

  if (value.LLM_PROVIDER === 'openai') {
    if (!value.OPENAI_API_KEY || isPlaceholderKey(value.OPENAI_API_KEY)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: "LLM_PROVIDER is set to 'openai' but OPENAI_API_KEY is missing or contains an unconfigured placeholder.",
      });
    }
  }

  if (value.LLM_PROVIDER === 'anthropic') {
    if (!value.ANTHROPIC_API_KEY || isPlaceholderKey(value.ANTHROPIC_API_KEY)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: "LLM_PROVIDER is set to 'anthropic' but ANTHROPIC_API_KEY is missing or contains an unconfigured placeholder.",
      });
    }
  }

  const channels = (value.NOTIFICATION_CHANNELS || '')
    .split(',')
    .map((c) => c.trim().toLowerCase());
  if (
    value.NODE_ENV === 'production' &&
    channels.includes('email') &&
    (!value.NOTIFICATION_TO || value.NOTIFICATION_TO === 'candidate@example.com')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NOTIFICATION_TO'],
      message: 'NOTIFICATION_TO is not set — notifications cannot be delivered. Configure NOTIFICATION_TO with a valid recipient email.',
    });
  }

  if (value.REQUIRE_APPROVAL !== true) context.addIssue({ code: z.ZodIssueCode.custom, path: ['REQUIRE_APPROVAL'], message: 'REQUIRE_APPROVAL must be true. Gate 1 human approval is required before browser automation starts, and automation may not submit while any required answer is unresolved.' });
});

/** @param {Record<string, unknown>} [overrides] @returns {z.infer<typeof configSchema>} */
export function loadConfig(overrides = {}) {
  const root = resolve(process.cwd(), '..');
  for (const candidate of [resolve(root, '.env.local'), resolve(root, '.env'), resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env')]) {
    if (existsSync(candidate)) loadDotenv({ path: candidate, override: false });
  }
  return configSchema.parse({ ...process.env, ...overrides });
}
