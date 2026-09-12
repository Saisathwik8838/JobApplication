import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { APIJobSource } from '../../src/modules/jobs/sources/apiJobSource.js';
import { ArbeitnowJobSource } from '../../src/modules/jobs/sources/arbeitnowJobSource.js';
import { AdzunaJobSource } from '../../src/modules/jobs/sources/adzunaJobSource.js';
import { createJobSources } from '../../src/modules/jobs/sourceFactory.js';
import { analyzeJob } from '../../src/modules/matching/matchingService.js';
import { runDiscovery } from '../../src/modules/jobs/discoveryService.js';

describe('Job Sources and India Localization Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('APIJobSource (Remotive India/Worldwide filtering)', () => {
    it('filters out location-restricted jobs and keeps India or Worldwide jobs', async () => {
      const mockRemotiveResponse = {
        jobs: [
          {
            id: 101,
            company_name: 'US Only Corp',
            title: 'Frontend Engineer',
            description: 'React developer',
            candidate_required_location: 'USA only',
            job_type: 'full_time',
            salary: '$120,000',
            url: 'https://remotive.com/job/101',
            publication_date: '2026-09-10T10:00:00Z',
          },
          {
            id: 102,
            company_name: 'India Tech Labs',
            title: 'Backend Engineer',
            description: 'Node.js & PostgreSQL',
            candidate_required_location: 'India',
            job_type: 'full_time',
            salary: '₹18 LPA',
            url: 'https://remotive.com/job/102',
            publication_date: '2026-09-11T10:00:00Z',
          },
          {
            id: 103,
            company_name: 'Global Distributed Ltd',
            title: 'Full Stack Engineer',
            description: 'TypeScript developer',
            candidate_required_location: 'Worldwide',
            job_type: 'full_time',
            salary: '',
            url: 'https://remotive.com/job/103',
            publication_date: '2026-09-12T10:00:00Z',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRemotiveResponse,
      });

      const source = new APIJobSource();
      const discovered = await source.discover();

      expect(discovered).toHaveLength(2);
      expect(discovered.map((j) => j.sourceJobId)).toEqual(['102', '103']);
      expect(discovered[0].company).toBe('India Tech Labs');
      expect(discovered[1].company).toBe('Global Distributed Ltd');
    });
  });

  describe('ArbeitnowJobSource (Worldwide & Remote Job Board)', () => {
    it('discovers and normalizes jobs from Arbeitnow public API', async () => {
      const mockArbeitnowResponse = {
        data: [
          {
            slug: 'senior-backend-engineer-delhi-123',
            company_name: 'Acme Systems',
            title: 'Senior Backend Engineer',
            description: 'We are hiring a Node developer.',
            remote: true,
            location: 'Remote, India',
            job_types: ['Full-Time'],
            url: 'https://arbeitnow.com/jobs/123',
            created_at: 1726000000,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockArbeitnowResponse,
      });

      const source = new ArbeitnowJobSource();
      const discovered = await source.discover();

      expect(discovered).toHaveLength(1);
      const job = discovered[0];
      expect(job.source).toBe('arbeitnow');
      expect(job.sourceJobId).toBe('senior-backend-engineer-delhi-123');
      expect(job.company).toBe('Acme Systems');
      expect(job.title).toBe('Senior Backend Engineer');
      expect(job.location).toContain('Remote');
      expect(job.employmentType).toBe('Full-Time');
    });
  });

  describe('AdzunaJobSource (India Search API)', () => {
    it('discovers and normalizes jobs from Adzuna India API with salary formatted in INR', async () => {
      const mockAdzunaResponse = {
        results: [
          {
            id: 'adzuna-999',
            title: 'Software Developer',
            company: { display_name: 'Infosys' },
            description: 'Building microservices in Java/Node.',
            location: { display_name: 'Bengaluru, Karnataka' },
            redirect_url: 'https://adzuna.in/land/999',
            salary_min: 1200000,
            salary_max: 1600000,
            contract_time: 'full_time',
            created: '2026-09-10T12:00:00Z',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAdzunaResponse,
      });

      const source = new AdzunaJobSource({ appId: 'test-app-id', appKey: 'test-app-key' });
      const discovered = await source.discover();

      expect(discovered).toHaveLength(1);
      const job = discovered[0];
      expect(job.source).toBe('adzuna');
      expect(job.sourceJobId).toBe('adzuna-999');
      expect(job.company).toBe('Infosys');
      expect(job.location).toBe('Bengaluru, Karnataka');
      expect(job.salary).toContain('₹');
    });

    it('gracefully returns empty array when Adzuna credentials are not configured', async () => {
      const source = new AdzunaJobSource({ appId: '', appKey: '' });
      const discovered = await source.discover();
      expect(discovered).toEqual([]);
    });
  });

  describe('Job Source Factory & Configuration Validation', () => {
    it('instantiates Arbeitnow and Adzuna when specified in JOB_SOURCES', () => {
      const sources = createJobSources({
        JOB_SOURCES: 'remotive,arbeitnow,adzuna',
        ADZUNA_APP_ID: 'id123',
        ADZUNA_APP_KEY: 'key123',
      });

      expect(sources).toHaveLength(3);
      expect(sources[0]).toBeInstanceOf(APIJobSource);
      expect(sources[1]).toBeInstanceOf(ArbeitnowJobSource);
      expect(sources[2]).toBeInstanceOf(AdzunaJobSource);
    });

    it('throws a loud error when no valid real sources are configured', () => {
      expect(() => {
        createJobSources({
          JOB_SOURCES: '',
        });
      }).toThrow(/No job sources configured/i);
    });
  });

  describe('Location Preference Scoring Boost', () => {
    it('applies a match score boost and strength note when job location matches candidate preference', async () => {
      const candidateProfile = {
        identity: { name: 'Sai Sathwik', email: 'sai@example.com' },
        experience: { level: 'mid', totalYears: 3 },
        preferences: {
          roles: ['Backend Engineer'],
          locations: ['Hyderabad', 'Bengaluru'],
        },
        skills: ['Node.js', 'PostgreSQL'],
      };

      const jobInHyderabad = {
        id: 'job-hyd-1',
        title: 'Backend Engineer',
        description: 'Requires 2+ years of Node.js experience.',
        location: 'Hyderabad, Telangana',
      };

      const mockProvider = {
        analyzeJob: vi.fn().mockResolvedValue({
          matchScore: 80,
          technicalMatch: 80,
          experienceMatch: 80,
          educationMatch: 80,
          roleMatch: 80,
          skillMatches: ['Node.js'],
          missingSkills: [],
          strengths: ['Solid technical foundation'],
          concerns: [],
          recommendation: 'apply',
          explanation: 'Good fit for the role.',
          _meta: { provider: 'test', model: 'mock-model', promptVersion: 'v1' },
        }),
      };

      const mockPrisma = {
        jobMatch: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
        },
        job: {
          update: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation((promises) => Promise.all(promises)),
      };

      const logger = { info: vi.fn() };

      const result = await analyzeJob({
        prisma: mockPrisma,
        provider: mockProvider,
        profile: candidateProfile,
        profileVersion: 'v1',
        resumeText: 'Resume text',
        job: jobInHyderabad,
        logger,
      });

      // Original match was 80, should receive +10 location boost = 90
      expect(result.match.matchScore).toBe(90);
      expect(result.match.strengths.some((s) => s.includes('Location matches candidate preference'))).toBe(true);
    });
  });

  describe('Discovery Summary Notification & Source Attribution', () => {
    it('enqueues discovery-summary notification with source attribution when new jobs are created', async () => {
      const mockJob = {
        source: 'arbeitnow',
        sourceJobId: 'job-arbeit-123',
        company: 'Razorpay',
        title: 'Backend Engineer',
        description: 'Design and build resilient payment gateways in Node.js.',
        location: 'Bengaluru, India',
        url: 'https://arbeitnow.com/jobs/123',
      };

      const mockSource = {
        name: 'arbeitnow',
        discover: vi.fn().mockResolvedValue([mockJob]),
      };

      const mockPrisma = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'db-job-1', ...mockJob }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({
            profile: { identity: { email: 'candidate@example.in' } },
          }),
        },
      };

      const mockNotificationQueue = {
        add: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      };

      const queues = {
        'notification': mockNotificationQueue,
      };

      const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

      const stats = await runDiscovery({
        prisma: mockPrisma,
        sources: [mockSource],
        logger,
        queues,
      });

      expect(stats.created).toBe(1);
      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'discovery-summary',
        expect.objectContaining({
          type: 'DISCOVERY_SUMMARY',
          subject: 'New jobs found: 1 added',
          to: 'candidate@example.in',
          text: expect.stringContaining('(Source: arbeitnow)'),
        }),
        expect.anything()
      );
    });
  });
});
