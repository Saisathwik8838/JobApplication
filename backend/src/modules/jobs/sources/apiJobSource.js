/** Public, unauthenticated source. Terms and rate limits must be reviewed before enabling in production. */
export class APIJobSource {
  constructor() { this.name = 'remotive'; this.type = 'api'; this.url = 'https://remotive.com/api/remote-jobs'; }
  /** @returns {Promise<object[]>} */
  async discover() { const response = await fetch(this.url, { headers: { accept: 'application/json', 'user-agent': 'AI-Job-Application-Agent/1.0 (respectful public-feed client)' } }); if (!response.ok) throw new Error(`Job API returned ${response.status}`); const body = await response.json(); return (body.jobs ?? []).map((job) => ({ source: this.name, sourceJobId: String(job.id), company: job.company_name, title: job.title, description: job.description, location: job.candidate_required_location || 'Remote', employmentType: job.job_type ?? null, salary: job.salary ?? null, url: job.url, postedAt: job.publication_date ? new Date(job.publication_date) : null })); }
}
