import { describe, expect, it } from 'vitest';
import { isIndiaRelevant } from '../../src/modules/jobs/locationFilter.js';

describe('India Job Market Relevance Filter (isIndiaRelevant)', () => {
  it('rejects a UK-only job', () => {
    const ukJob = {
      title: 'Senior Software Engineer',
      location: 'London, UK',
      description: 'UK-based only. Must be legally authorized to work in the UK without sponsorship.',
      source: 'arbeitnow',
    };
    expect(isIndiaRelevant(ukJob)).toBe(false);
  });

  it('rejects a generic "remote, worldwide" job with no India mention', () => {
    const genericRemoteJob = {
      title: 'Full Stack Developer',
      location: 'Remote (Worldwide)',
      description: 'We are seeking a talented developer to collaborate with our globally distributed team.',
      source: 'remotive',
    };
    expect(isIndiaRelevant(genericRemoteJob)).toBe(false);
  });

  it('passes an explicit India job (city/state/India)', () => {
    const indiaJob = {
      title: 'Backend Node.js Engineer',
      location: 'Bengaluru, Karnataka, India',
      description: 'Work with our high-scale microservices engineering team in Bengaluru.',
      source: 'arbeitnow',
    };
    expect(isIndiaRelevant(indiaJob)).toBe(true);
  });

  it('passes a remote job that explicitly mentions India in the description', () => {
    const remoteIndiaJob = {
      title: 'Cloud DevOps Engineer',
      location: 'Remote',
      description: 'Remote position available for candidates residing anywhere in India.',
      source: 'remotive',
    };
    expect(isIndiaRelevant(remoteIndiaJob)).toBe(true);
  });

  it('rejects remote jobs requiring US work authorization despite saying remote', () => {
    const usRemoteJob = {
      title: 'Lead Architect',
      location: 'Remote, India / Worldwide',
      description: 'Fully remote. US work authorization required. Must be authorized to work in the US.',
      source: 'arbeitnow',
    };
    expect(isIndiaRelevant(usRemoteJob)).toBe(false);
  });

  it('passes National Career Service (ncs) jobs automatically', () => {
    const ncsJob = {
      title: 'Data Analyst',
      location: 'New Delhi',
      description: 'National public sector opportunity.',
      source: 'ncs',
    };
    expect(isIndiaRelevant(ncsJob)).toBe(true);
  });

  it('passes Adzuna India jobs when country=in', () => {
    const adzunaJob = {
      title: 'Frontend React Developer',
      location: 'Hyderabad',
      country: 'in',
      description: 'Leading technology consulting firm.',
      source: 'adzuna',
    };
    expect(isIndiaRelevant(adzunaJob)).toBe(true);
  });

  it('allows non-India jobs if indiaOnly is explicitly set to false', () => {
    const globalJob = {
      title: 'Staff Engineer',
      location: 'San Francisco, CA',
      description: 'US only.',
      source: 'arbeitnow',
    };
    expect(isIndiaRelevant(globalJob, { indiaOnly: false })).toBe(true);
  });
});
