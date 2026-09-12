/**
 * Arbeitnow public job board API source.
 * Public, unauthenticated API providing remote and tech jobs worldwide.
 * Terms allow automated polling via public API endpoints.
 */
export class ArbeitnowJobSource {
  constructor(options = {}) {
    this.name = 'arbeitnow';
    this.type = 'api';
    this.url = options.url || 'https://www.arbeitnow.com/api/job-board-api';
  }

  /**
   * Discovers and normalizes jobs from Arbeitnow.
   * @returns {Promise<Array<object>>}
   */
  async discover() {
    const response = await fetch(this.url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'AI-Job-Application-Agent/1.0 (respectful public-feed client)',
      },
    });

    if (!response.ok) {
      throw new Error(`Arbeitnow API returned HTTP ${response.status}`);
    }

    const body = await response.json();
    const items = Array.isArray(body.data) ? body.data : [];

    return items
      .filter((item) => {
        // Keep remote jobs or jobs with India/Worldwide relevance
        const loc = (item.location || '').toLowerCase();
        return item.remote === true || !loc || loc.includes('india') || loc.includes('remote') || loc.includes('worldwide');
      })
      .map((item) => {
        let location = 'Remote';
        if (item.remote && item.location) {
          location = `${item.location} (Remote)`;
        } else if (item.location) {
          location = item.location;
        }

        const employmentType = Array.isArray(item.job_types)
          ? item.job_types.join(', ')
          : (item.job_types || null);

        return {
          source: this.name,
          sourceJobId: String(item.slug || item.id || Math.random().toString(36).slice(2)),
          company: item.company_name || 'Unknown Company',
          title: item.title,
          description: item.description || '',
          location,
          employmentType,
          salary: null,
          url: item.url,
          postedAt: item.created_at ? new Date(item.created_at * 1000) : null,
        };
      });
  }
}
