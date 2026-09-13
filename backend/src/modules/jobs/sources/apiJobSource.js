import { fetchWithRetry } from '../httpRetry.js';
import { normalizeIndianLocation } from '../localization.js';

/** Public, unauthenticated source. Terms and rate limits must be reviewed before enabling in production. */
export class APIJobSource {
  constructor(options = {}) {
    this.name = 'remotive';
    this.type = 'api';
    this.url = options.url || 'https://remotive.com/api/remote-jobs';
    this.logger = options.logger;
  }

  /** @returns {Promise<object[]>} */
  async discover() {
    const response = await fetchWithRetry(
      this.url,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'AI-Job-Application-Agent/1.0 (respectful public-feed client)',
        },
      },
      {
        sourceName: this.name,
        logger: this.logger,
      }
    );

    if (!response.ok) throw new Error(`Job API returned ${response.status}`);
    const body = await response.json();

    return (body.jobs ?? [])
      .filter((job) => {
        const loc = (job.candidate_required_location || '').toLowerCase().trim();
        // Keep jobs where candidate location includes India, Worldwide, Anywhere, or is unrestricted
        return !loc || loc.includes('india') || loc.includes('worldwide') || loc.includes('anywhere');
      })
      .map((job) => ({
        source: this.name,
        sourceJobId: String(job.id),
        company: job.company_name,
        title: job.title,
        description: job.description,
        location: normalizeIndianLocation(job.candidate_required_location || 'Remote (Worldwide)'),
        employmentType: job.job_type ?? null,
        salary: job.salary ?? null,
        url: job.url,
        postedAt: job.publication_date ? new Date(job.publication_date) : null,
      }));
  }
}
