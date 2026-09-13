import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NCSJobSource } from '../../src/modules/jobs/sources/ncsJobSource.js';

describe('NCSJobSource (National Career Service via data.gov.in)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('degrades gracefully and returns empty array if API key or resource ID is not configured', async () => {
    const source = new NCSJobSource({ apiKey: '', resourceId: '' });
    const jobs = await source.discover();
    expect(jobs).toEqual([]);
  });

  it('discovers and normalizes jobs from data.gov.in records', async () => {
    const mockApiResponse = {
      index_name: 'ncs_vacancies',
      title: 'National Career Service Vacancies',
      records: [
        {
          id: 'ncs-1001',
          job_title: 'Junior Software Engineer',
          employer_name: 'National Informatics Centre',
          job_location: 'Bangalore, Karnataka',
          job_description: 'Development of government web portals using JavaScript and Node.js',
          salary: '₹6,00,000 - ₹9,00,000',
          employment_type: 'Full-time',
          date_of_posting: '2026-09-10',
          link: 'https://ncs.gov.in/job/1001',
        },
        {
          id: 'ncs-1002',
          post_name: 'Database Administrator',
          organization: 'State IT Mission',
          district: 'Bombay',
          duties: 'PostgreSQL administration',
          min_salary: 800000,
          max_salary: 1200000,
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockApiResponse,
    });

    const source = new NCSJobSource({
      apiKey: 'mock-ogd-api-key',
      resourceId: 'mock-ncs-resource-id',
    });

    const jobs = await source.discover();
    expect(jobs).toHaveLength(2);

    expect(jobs[0].title).toBe('Junior Software Engineer');
    expect(jobs[0].company).toBe('National Informatics Centre');
    expect(jobs[0].location).toBe('Bengaluru, Karnataka'); // Normalized from Bangalore
    expect(jobs[0].salary).toBe('₹6,00,000 - ₹9,00,000');
    expect(jobs[0].source).toBe('ncs');

    expect(jobs[1].title).toBe('Database Administrator');
    expect(jobs[1].company).toBe('State IT Mission');
    expect(jobs[1].location).toBe('Mumbai'); // Normalized from Bombay
    expect(jobs[1].salary).toBe('₹8,00,000 - ₹12,00,000');
  });

  it('degrades gracefully on HTTP errors or malformed schema', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });

    const source = new NCSJobSource({
      apiKey: 'test-key',
      resourceId: 'invalid-resource',
    });

    const jobs = await source.discover();
    expect(jobs).toEqual([]);
  });
});
