import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/config.js';

describe('Config Validation and Security Guard Tests', () => {
  const baseValidOverrides = {
    DATABASE_URL: 'postgresql://jobagent:jobagent@localhost:5432/jobagent?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    LLM_PROVIDER: 'openai',
    LLM_MODEL: 'gpt-4.1-mini',
    OPENAI_API_KEY: 'test-key',
    REQUIRE_APPROVAL: true,
    PROFILE_PATH: 'profile/candidate_profile.yaml',
    NOTIFICATION_FROM: 'job-agent@example.test',
  };

  it('allows default JWT_SECRET in development environment', () => {
    const config = loadConfig({
      ...baseValidOverrides,
      NODE_ENV: 'development',
      JWT_SECRET: 'dev-secret-job-agent-jwt-change-in-production',
    });

    expect(config.JWT_SECRET).toBe('dev-secret-job-agent-jwt-change-in-production');
  });

  it('fails loudly when default JWT_SECRET is used in production environment', () => {
    expect(() => {
      loadConfig({
        ...baseValidOverrides,
        NODE_ENV: 'production',
        JWT_SECRET: 'dev-secret-job-agent-jwt-change-in-production',
      });
    }).toThrow(/JWT_SECRET must be explicitly configured/i);
  });

  it('passes in production when custom secure JWT_SECRET is provided', () => {
    const config = loadConfig({
      ...baseValidOverrides,
      NODE_ENV: 'production',
      JWT_SECRET: 'super-secure-production-secret-987654321',
    });

    expect(config.JWT_SECRET).toBe('super-secure-production-secret-987654321');
  });
});
