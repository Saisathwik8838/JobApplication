import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CompanyCareerSource } from '../../src/modules/jobs/sources/companyCareerSource.js';

describe('CompanyCareerSource (Greenhouse and Lever boards)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses Greenhouse public board listings and normalizes locations', async () => {
    const mockGreenhouseResponse = {
      jobs: [
        {
          id: 12345,
          title: 'Software Engineer II - Backend',
          updated_at: '2026-09-12T12:00:00Z',
          absolute_url: 'https://boards.greenhouse.io/razorpay/jobs/12345',
          location: { name: 'Bangalore, India' },
          content: '<p>Looking for skilled Go and Node.js developers.</p>',
        },
        {
          id: 67890,
          title: 'Engineering Manager',
          updated_at: '2026-09-11T12:00:00Z',
          absolute_url: 'https://boards.greenhouse.io/razorpay/jobs/67890',
          location: { name: 'San Francisco, CA' }, // Excluded (not India/remote)
          content: '<p>US only role.</p>',
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockGreenhouseResponse,
    });

    const source = new CompanyCareerSource({
      name: 'razorpay',
      companyName: 'Razorpay',
      boardType: 'greenhouse',
      board: 'razorpaysoftwareprivatelimited',
    });

    const jobs = await source.discover();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Software Engineer II - Backend');
    expect(jobs[0].company).toBe('Razorpay');
    expect(jobs[0].location).toBe('Bengaluru, India');
    expect(jobs[0].source).toBe('razorpay');
    expect(jobs[0].description).toContain('Looking for skilled Go and Node.js developers');
  });

  it('parses Lever public postings and normalizes locations', async () => {
    const mockLeverResponse = [
      {
        id: 'lever-999',
        text: 'Product Engineer - Frontend',
        createdAt: 1789100000000,
        hostedUrl: 'https://jobs.lever.co/cred/lever-999',
        categories: {
          location: 'Bangalore',
          department: 'Engineering',
          commitment: 'Full-time',
        },
        descriptionPlain: 'Build fluid mobile-first web interfaces with React and TypeScript.',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockLeverResponse,
    });

    const source = new CompanyCareerSource({
      name: 'cred',
      companyName: 'CRED',
      boardType: 'lever',
      board: 'cred',
    });

    const jobs = await source.discover();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Product Engineer - Frontend');
    expect(jobs[0].company).toBe('CRED');
    expect(jobs[0].location).toBe('Bengaluru');
    expect(jobs[0].employmentType).toBe('Full-time');
    expect(jobs[0].source).toBe('cred');
  });
});
