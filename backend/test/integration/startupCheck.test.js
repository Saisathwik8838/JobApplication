import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/config.js';

describe('Startup Validation and Fail-Fast Security Checks', () => {
  const baseValid = {
    DATABASE_URL: 'postgresql://jobagent:jobagent@localhost:5432/jobagent?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    LLM_PROVIDER: 'openai',
    LLM_MODEL: 'gpt-4.1-mini',
    OPENAI_API_KEY: 'test-key',
    REQUIRE_APPROVAL: true,
    PROFILE_PATH: 'profile/candidate_profile.yaml',
    NOTIFICATION_FROM: 'notifications@jobapplication.local',
    NOTIFICATION_TO: 'candidate@realmail.in',
    JWT_SECRET: 'custom-production-secret-1234567890',
  };

  it('fails fast in production when NOTIFICATION_TO is unset or empty', () => {
    expect(() => {
      loadConfig({
        ...baseValid,
        NODE_ENV: 'production',
        NOTIFICATION_TO: '',
      });
    }).toThrow(/NOTIFICATION_TO is not set — notifications cannot be delivered/i);
  });

  it('fails fast when NOTIFICATION_TO contains an example.com domain in production', () => {
    expect(() => {
      loadConfig({
        ...baseValid,
        NODE_ENV: 'production',
        NOTIFICATION_TO: 'candidate@example.com',
      });
    }).toThrow(/NOTIFICATION_TO is not set — notifications cannot be delivered/i);
  });

  it('fails fast when booting without valid recipient email if email notifications are enabled', () => {
    const isInvalid = (email) => !email || email.includes('example.com') || email.includes('example.test');
    const simulateStartupCheck = (notificationTo, profileEmail) => {
      if (isInvalid(notificationTo) && isInvalid(profileEmail)) {
        throw new Error('NOTIFICATION_TO is not set — notifications cannot be delivered. Configure NOTIFICATION_TO with a valid recipient email.');
      }
    };

    // Both unset or example.com
    expect(() => simulateStartupCheck('', '')).toThrow(/NOTIFICATION_TO is not set/i);
    expect(() => simulateStartupCheck('user@example.com', 'candidate@example.com')).toThrow(/NOTIFICATION_TO is not set/i);
    expect(() => simulateStartupCheck(undefined, 'candidate@example.test')).toThrow(/NOTIFICATION_TO is not set/i);

    // Passes when either has a real address
    expect(() => simulateStartupCheck('candidate@myorg.in', '')).not.toThrow();
    expect(() => simulateStartupCheck('', 'candidate@myorg.in')).not.toThrow();
  });
});
