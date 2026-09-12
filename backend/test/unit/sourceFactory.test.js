import { describe, expect, it } from 'vitest';
import { createJobSources } from '../../src/modules/jobs/sourceFactory.js';
import { APIJobSource } from '../../src/modules/jobs/sources/apiJobSource.js';
import { SampleJobSource } from '../../src/modules/jobs/sources/sampleJobSource.js';

describe('Job Source Factory (createJobSources)', () => {
  it('returns only an APIJobSource (Remotive) and not SampleJobSource when no JOB_SOURCES is set', () => {
    const sources = createJobSources({});
    expect(sources).toHaveLength(1);
    expect(sources[0]).toBeInstanceOf(APIJobSource);
    expect(sources[0].name).toBe('remotive');
    expect(sources.some((s) => s instanceof SampleJobSource)).toBe(false);
  });

  it('returns a SampleJobSource when JOB_SOURCES=sample is explicitly set', () => {
    const sources = createJobSources({ JOB_SOURCES: 'sample' });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toBeInstanceOf(SampleJobSource);
    expect(sources[0].name).toBe('sample');
  });

  it('returns both APIJobSource and SampleJobSource when JOB_SOURCES=remotive,sample is set', () => {
    const sources = createJobSources({ JOB_SOURCES: 'remotive,sample' });
    expect(sources).toHaveLength(2);
    expect(sources.some((s) => s instanceof APIJobSource && s.name === 'remotive')).toBe(true);
    expect(sources.some((s) => s instanceof SampleJobSource && s.name === 'sample')).toBe(true);
  });
});
