import { fetchWithRetry } from '../httpRetry.js';
import { normalizeIndianLocation, formatIndianSalary } from '../localization.js';

/**
 * National Career Service (NCS) - Government of India (Ministry of Labour & Employment)
 * Vacancy data published via Open Government Data (OGD) Platform India (data.gov.in).
 *
 * API format: https://api.data.gov.in/resource/{resource_id}?api-key={key}&format=json
 * Requires NCS_API_KEY and NCS_RESOURCE_ID env vars.
 * Degrades gracefully (returns []) when unconfigured, unreachable, or schema differs.
 */
export class NCSJobSource {
  /**
   * @param {{
   *   apiKey?: string,
   *   resourceId?: string,
   *   baseUrl?: string,
   *   logger?: import('pino').Logger
   * }} [options={}]
   */
  constructor(options = {}) {
    this.name = 'ncs';
    this.type = 'government-api';
    this.apiKey = options.apiKey || process.env.NCS_API_KEY || '';
    this.resourceId = options.resourceId || process.env.NCS_RESOURCE_ID || '';
    this.baseUrl = options.baseUrl || 'https://api.data.gov.in/resource';
    this.logger = options.logger;
  }

  /**
   * Discovers job vacancies from the National Career Service dataset on data.gov.in.
   * @returns {Promise<Array<object>>}
   */
  async discover() {
    if (!this.apiKey || !this.resourceId) {
      if (this.logger) {
        this.logger.info(
          'NCS job source skipped: NCS_API_KEY and/or NCS_RESOURCE_ID not configured (free key at data.gov.in).'
        );
      }
      return [];
    }

    const endpoint = `${this.baseUrl}/${this.resourceId}?api-key=${encodeURIComponent(this.apiKey)}&format=json&limit=50`;

    try {
      const response = await fetchWithRetry(
        endpoint,
        {
          headers: {
            accept: 'application/json',
            'user-agent': 'AI-Job-Application-Agent/1.0 (respectful government-data client)',
          },
        },
        {
          sourceName: this.name,
          logger: this.logger,
        }
      );

      if (!response.ok) {
        throw new Error(`NCS API returned HTTP ${response.status}`);
      }

      const body = await response.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        if (this.logger) {
          this.logger.warn({ source: this.name }, 'NCS API returned non-JSON response; degrading gracefully');
        }
        return [];
      }

      // data.gov.in standard response schema returns records in body.records
      const records = Array.isArray(body.records) ? body.records : [];
      if (records.length === 0 && !Array.isArray(body.records)) {
        if (this.logger) {
          this.logger.warn({ source: this.name, bodyKeys: Object.keys(body) }, 'NCS dataset schema does not contain records array; degrading gracefully');
        }
        return [];
      }

      return records
        .map((rec, index) => {
          // Flexible key resolution across varying OGD platform dataset schemas
          const title =
            rec.job_title ||
            rec.title ||
            rec.designation ||
            rec.post_name ||
            rec.position ||
            rec.job_role ||
            rec.vacancy_title;

          if (!title) return null;

          const company =
            rec.company_name ||
            rec.employer_name ||
            rec.organization ||
            rec.organization_name ||
            rec.company ||
            rec.department ||
            'National Career Service (Govt of India)';

          const rawLocation =
            rec.job_location ||
            rec.location ||
            rec.district ||
            rec.city ||
            rec.state ||
            rec.place_of_posting ||
            'India';

          const location = normalizeIndianLocation(String(rawLocation));

          const description =
            rec.job_description ||
            rec.description ||
            rec.job_desc ||
            rec.duties ||
            rec.qualification ||
            rec.eligibility ||
            `Vacancy at ${company} in ${location}.`;

          const rawSalary =
            rec.salary ||
            rec.wage_pay_scale ||
            rec.remuneration ||
            rec.salary_range ||
            rec.pay_scale ||
            null;

          let salary = null;
          if (rawSalary) {
            salary = formatIndianSalary(rawSalary);
          } else if (rec.min_salary || rec.max_salary) {
            salary = formatIndianSalary(rec.min_salary, rec.max_salary);
          }

          const id = String(
            rec.id ||
            rec.job_id ||
            rec.vacancy_id ||
            rec.reference_id ||
            `ncs-${index}-${title.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`
          );

          const url =
            rec.url ||
            rec.job_url ||
            rec.link ||
            rec.apply_url ||
            `https://www.ncs.gov.in/job-seeker/Pages/JobDetails.aspx?JobId=${encodeURIComponent(id)}`;

          const postedAt = rec.posted_date || rec.created_date || rec.date_of_posting
            ? new Date(rec.posted_date || rec.created_date || rec.date_of_posting)
            : null;

          return {
            source: this.name,
            sourceJobId: id,
            company: String(company),
            title: String(title),
            description: String(description),
            location,
            employmentType: rec.employment_type || rec.job_type || 'Full-time',
            salary,
            url: String(url),
            postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
          };
        })
        .filter(Boolean);
    } catch (error) {
      if (this.logger) {
        this.logger.error(
          { source: this.name, error: error.message },
          'Failed to discover jobs from NCS dataset; degrading gracefully'
        );
      }
      // Re-throw rate limit errors so discoveryService can isolate this source
      if (error.isRateLimited) {
        throw error;
      }
      // For general network / schema issues, degrade gracefully
      return [];
    }
  }
}
