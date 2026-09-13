import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import {
  analyzeJob,
  LLMResponseInvalidError,
} from '../../src/modules/matching/matchingService.js';
import { LLMRateLimitError } from '../../src/modules/ai/errors.js';

describe('Job Matching Service Error Handling & Retries', () => {
  const dummyProfile = {
    candidate: { name: 'Sai Sathwik', email: 'saisathwik@gmail.com', location: 'Bengaluru' },
    education: { degree: 'B.Tech', branch: 'CSE', college: 'College', graduation_year: 2024 },
    experience: { years: 2, level: 'Mid' },
    skills: { programming: ['JavaScript', 'Node.js'], backend: [], cloud: [], devops: [], databases: [], ai: [], frontend: [], core_cs: [] },
    preferences: { roles: ['Software Engineer'], locations: ['Bengaluru'], remote: true, hybrid: true, onsite: true },
    rules: { minimum_match_score: 75, auto_prepare: true, require_approval: true },
  };

  const dummyJob = {
    id: 'test-job-123',
    title: 'Software Engineer',
    company: 'Tech Corp',
    location: 'Bengaluru',
    description: 'Looking for a Software Engineer with JavaScript.',
    status: 'DISCOVERED',
  };

  const mockLogger = pino({ enabled: false });

  it('retries once when provider returns schema-violating object, and succeeds on second attempt', async () => {
    let attempts = 0;
    const mockProvider = {
      name: 'test-provider',
      analyzeJob: vi.fn(async ({ strictRetry }) => {
        attempts += 1;
        if (attempts === 1) {
          expect(strictRetry).toBe(false);
          // Missing required fields like matchScore, technicalMatch, etc.
          return {
            _meta: { provider: 'test', model: 'test', promptVersion: '1.0' },
            invalidField: 'not in schema',
          };
        }
        expect(strictRetry).toBe(true);
        // Valid object on retry
        return {
          _meta: { provider: 'test', model: 'test', promptVersion: '1.0' },
          matchScore: 85,
          technicalMatch: 85,
          experienceMatch: 80,
          educationMatch: 90,
          roleMatch: 85,
          skillMatches: ['JavaScript'],
          missingSkills: [],
          strengths: ['Relevant tech stack'],
          concerns: [],
          recommendation: 'apply',
          explanation: 'Good match',
        };
      }),
    };

    const mockPrisma = {
      job: {
        update: vi.fn(async () => {}),
      },
      jobMatch: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'match-1' })),
      },
      $transaction: vi.fn(async (ops) => ops),
    };

    const result = await analyzeJob({
      prisma: mockPrisma,
      provider: mockProvider,
      profile: dummyProfile,
      profileVersion: 'v1',
      resumeText: 'Resume with JavaScript',
      job: dummyJob,
      logger: mockLogger,
      userId: 'user-1',
    });

    expect(attempts).toBe(2);
    expect(result.match.matchScore).toBeGreaterThanOrEqual(85);
    expect(result.match.recommendation).toBe('apply');
  });

  it('handles persistent schema violation by retrying once, marking MATCH_FAILED, and throwing LLMResponseInvalidError', async () => {
    let attempts = 0;
    const mockProvider = {
      name: 'test-provider',
      analyzeJob: vi.fn(async () => {
        attempts += 1;
        return {
          _meta: { provider: 'test', model: 'test', promptVersion: '1.0' },
          badData: true,
        };
      }),
    };

    const mockPrisma = {
      job: {
        update: vi.fn(async () => {}),
      },
      jobMatch: {
        findUnique: vi.fn(async () => null),
      },
    };

    await expect(
      analyzeJob({
        prisma: mockPrisma,
        provider: mockProvider,
        profile: dummyProfile,
        profileVersion: 'v1',
        resumeText: 'Resume text',
        job: dummyJob,
        logger: mockLogger,
      })
    ).rejects.toThrow(LLMResponseInvalidError);

    expect(attempts).toBe(2);
    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: dummyJob.id },
        data: { status: 'MATCH_FAILED' },
      })
    );
  });

  it('handles malformed JSON from provider by marking MATCH_FAILED and throwing LLMResponseInvalidError', async () => {
    const mockProvider = {
      name: 'test-provider',
      analyzeJob: vi.fn(async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      }),
    };

    const mockPrisma = {
      job: {
        update: vi.fn(async () => {}),
      },
      jobMatch: {
        findUnique: vi.fn(async () => null),
      },
    };

    await expect(
      analyzeJob({
        prisma: mockPrisma,
        provider: mockProvider,
        profile: dummyProfile,
        profileVersion: 'v1',
        resumeText: 'Resume text',
        job: dummyJob,
        logger: mockLogger,
      })
    ).rejects.toThrow(LLMResponseInvalidError);

    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: dummyJob.id },
        data: { status: 'MATCH_FAILED' },
      })
    );
  });

  it('marks MATCH_FAILED and re-throws specific LLMRateLimitError when provider returns 429', async () => {
    const mockProvider = {
      name: 'test-provider',
      analyzeJob: vi.fn(async () => {
        throw new LLMRateLimitError('Rate limit exceeded: 429');
      }),
    };

    const mockPrisma = {
      job: {
        update: vi.fn(async () => {}),
      },
      jobMatch: {
        findUnique: vi.fn(async () => null),
      },
    };

    await expect(
      analyzeJob({
        prisma: mockPrisma,
        provider: mockProvider,
        profile: dummyProfile,
        profileVersion: 'v1',
        resumeText: 'Resume text',
        job: dummyJob,
        logger: mockLogger,
      })
    ).rejects.toThrow(LLMRateLimitError);

    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: dummyJob.id },
        data: { status: 'MATCH_FAILED' },
      })
    );
  });
});
