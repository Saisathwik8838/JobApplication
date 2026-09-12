import { describe, expect, it } from 'vitest';
import { createJobSources } from '../../src/modules/jobs/sourceFactory.js';
import { APIJobSource } from '../../src/modules/jobs/sources/apiJobSource.js';
import { ArbeitnowJobSource } from '../../src/modules/jobs/sources/arbeitnowJobSource.js';
import { AdzunaJobSource } from '../../src/modules/jobs/sources/adzunaJobSource.js';

describe('Job Source Factory (createJobSources)', () => {
  it('returns real default sources (remotive and arbeitnow) when no JOB_SOURCES is set', () => {
    const sources = createJobSources({});
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.some((s) => s instanceof APIJobSource && s.name === 'remotive')).toBe(true);
    expect(sources.some((s) => s instanceof ArbeitnowJobSource && s.name === 'arbeitnow')).toBe(true);
  });

  it('instantiates AdzunaJobSource when adzuna is specified in JOB_SOURCES', () => {
    const sources = createJobSources({
      JOB_SOURCES: 'adzuna',
      ADZUNA_APP_ID: 'test-app-id',
      ADZUNA_APP_KEY: 'test-app-key',
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toBeInstanceOf(AdzunaJobSource);
    expect(sources[0].name).toBe('adzuna');
  });

  it('throws a loud error if no valid job sources are configured', () => {
    expect(() => {
      createJobSources({ JOB_SOURCES: 'nonexistent_source,invalid' });
    }).toThrow(/No job sources configured/i);
  });
});
