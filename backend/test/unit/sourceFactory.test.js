import { describe, expect, it } from 'vitest';
import { createJobSources } from '../../src/modules/jobs/sourceFactory.js';
import { ArbeitnowJobSource } from '../../src/modules/jobs/sources/arbeitnowJobSource.js';
import { AdzunaJobSource } from '../../src/modules/jobs/sources/adzunaJobSource.js';
import { NCSJobSource } from '../../src/modules/jobs/sources/ncsJobSource.js';
import { CompanyCareerSource } from '../../src/modules/jobs/sources/companyCareerSource.js';

describe('Job Source Factory (createJobSources)', () => {
  it('returns India-localized default sources (adzuna, ncs, arbeitnow) when no JOB_SOURCES is set', () => {
    const sources = createJobSources({});
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(sources.some((s) => s instanceof AdzunaJobSource && s.name === 'adzuna')).toBe(true);
    expect(sources.some((s) => s instanceof NCSJobSource && s.name === 'ncs')).toBe(true);
    expect(sources.some((s) => s instanceof ArbeitnowJobSource && s.name === 'arbeitnow')).toBe(true);
  });

  it('instantiates AdzunaJobSource with country=in when adzuna is specified', () => {
    const sources = createJobSources({
      JOB_SOURCES: 'adzuna',
      ADZUNA_APP_ID: 'test-app-id',
      ADZUNA_APP_KEY: 'test-app-key',
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toBeInstanceOf(AdzunaJobSource);
    expect(sources[0].name).toBe('adzuna');
    expect(sources[0].country).toBe('in');
  });

  it('instantiates NCSJobSource with API keys when ncs is specified', () => {
    const sources = createJobSources({
      JOB_SOURCES: 'ncs',
      NCS_API_KEY: 'test-key',
      NCS_RESOURCE_ID: 'test-resource',
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toBeInstanceOf(NCSJobSource);
    expect(sources[0].name).toBe('ncs');
    expect(sources[0].apiKey).toBe('test-key');
    expect(sources[0].resourceId).toBe('test-resource');
  });

  it('instantiates seeded Indian CompanyCareerSources when company is specified', () => {
    const sources = createJobSources({
      JOB_SOURCES: 'company',
    });
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(sources.every((s) => s instanceof CompanyCareerSource)).toBe(true);
    expect(sources.some((s) => s.name === 'razorpay')).toBe(true);
    expect(sources.some((s) => s.name === 'postman')).toBe(true);
    expect(sources.some((s) => s.name === 'cred')).toBe(true);
  });

  it('throws a loud error if no valid job sources are configured', () => {
    expect(() => {
      createJobSources({ JOB_SOURCES: 'nonexistent_source,invalid' });
    }).toThrow(/No job sources configured/i);
  });
});
