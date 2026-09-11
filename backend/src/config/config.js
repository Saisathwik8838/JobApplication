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

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LLM_PROVIDER: z.enum(['openai', 'anthropic']),
  LLM_MODEL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  MATCH_THRESHOLD: z.coerce.number().min(0).max(100).default(75),
  REQUIRE_APPROVAL: booleanFromString,
  MAX_APPLICATIONS_PER_DAY: z.coerce.number().int().positive().default(20),
  PROFILE_PATH: z.string().min(1),
  NOTIFICATION_FROM: z.string().email(),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().optional(), SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  HEADLESS: booleanFromString.default(false)
}).superRefine((value, context) => {
  if (value.LLM_PROVIDER === 'openai' && !value.OPENAI_API_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ['OPENAI_API_KEY'], message: 'OPENAI_API_KEY is required when LLM_PROVIDER=openai' });
  if (value.LLM_PROVIDER === 'anthropic' && !value.ANTHROPIC_API_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ['ANTHROPIC_API_KEY'], message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic' });
  if (value.REQUIRE_APPROVAL !== true) context.addIssue({ code: z.ZodIssueCode.custom, path: ['REQUIRE_APPROVAL'], message: 'REQUIRE_APPROVAL must be true. Automatic submissions are prohibited.' });
});

/** @param {Record<string, unknown>} [overrides] @returns {z.infer<typeof configSchema>} */
export function loadConfig(overrides = {}) {
  const root = resolve(process.cwd(), '..');
  for (const candidate of [resolve(root, '.env.local'), resolve(root, '.env'), resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env')]) {
    if (existsSync(candidate)) loadDotenv({ path: candidate, override: false });
  }
  return configSchema.parse({ ...process.env, ...overrides });
}
