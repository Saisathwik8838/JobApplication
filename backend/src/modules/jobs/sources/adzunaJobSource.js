/**
 * Adzuna India Job Search API source.
 * Official developer API with dedicated India job listings.
 * Requires ADZUNA_APP_ID and ADZUNA_APP_KEY (free tier available at developer.adzuna.com).
 */
export class AdzunaJobSource {
  constructor(options = {}) {
    this.name = 'adzuna';
    this.type = 'api';
    this.appId = options.appId || process.env.ADZUNA_APP_ID || '';
    this.appKey = options.appKey || process.env.ADZUNA_APP_KEY || '';
    this.country = options.country || 'in';
    this.baseUrl = options.baseUrl || `https://api.adzuna.com/v1/api/jobs/${this.country}/search/1`;
    this.logger = options.logger;
  }

  /**
   * Discovers and normalizes jobs from Adzuna India.
   * @returns {Promise<Array<object>>}
   */
  async discover() {
    if (!this.appId || !this.appKey) {
      if (this.logger) {
        this.logger.info('Adzuna job source skipped: ADZUNA_APP_ID and/or ADZUNA_APP_KEY not configured.');
      }
      return [];
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set('app_id', this.appId);
    url.searchParams.set('app_key', this.appKey);
    url.searchParams.set('results_per_page', '50');
    url.searchParams.set('content-type', 'application/json');

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
        'user-agent': 'AI-Job-Application-Agent/1.0 (respectful public-feed client)',
      },
    });

    if (!response.ok) {
      throw new Error(`Adzuna API returned HTTP ${response.status}`);
    }

    const body = await response.json();
    const results = Array.isArray(body.results) ? body.results : [];

    return results.map((item) => {
      let salary = null;
      if (item.salary_min || item.salary_max) {
        if (item.salary_min && item.salary_max) {
          salary = `₹${item.salary_min.toLocaleString('en-IN')} - ₹${item.salary_max.toLocaleString('en-IN')}`;
        } else if (item.salary_min) {
          salary = `From ₹${item.salary_min.toLocaleString('en-IN')}`;
        } else {
          salary = `Up to ₹${item.salary_max.toLocaleString('en-IN')}`;
        }
      }

      const location = item.location?.display_name || 'India';

      return {
        source: this.name,
        sourceJobId: String(item.id),
        company: item.company?.display_name || 'Unknown Company',
        title: item.title,
        description: item.description || '',
        location,
        employmentType: item.contract_time ? item.contract_time.replace('_', ' ') : null,
        salary,
        url: item.redirect_url,
        postedAt: item.created ? new Date(item.created) : null,
      };
    });
  }
}
