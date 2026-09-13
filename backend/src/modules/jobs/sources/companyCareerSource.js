import { fetchWithRetry } from '../httpRetry.js';
import { normalizeIndianLocation } from '../localization.js';

/**
 * Company career source adapter supporting public Greenhouse and Lever boards
 * as well as custom JSON endpoints.
 */
export class CompanyCareerSource {
  /**
   * @param {{
   *   name: string,
   *   companyName?: string,
   *   boardType?: 'greenhouse' | 'lever' | 'custom',
   *   board?: string,
   *   endpoint?: string,
   *   mapJob?: (raw: unknown) => object[],
   *   logger?: import('pino').Logger
   * }} config
   */
  constructor(config) {
    this.name = config.name;
    this.companyName = config.companyName || config.name;
    this.boardType = config.boardType || (config.endpoint?.includes('greenhouse') ? 'greenhouse' : config.endpoint?.includes('lever') ? 'lever' : 'custom');
    this.board = config.board;
    this.logger = config.logger;
    this.type = 'company-careers';

    if (config.endpoint) {
      this.endpoint = config.endpoint;
    } else if (this.boardType === 'greenhouse' && this.board) {
      this.endpoint = `https://boards-api.greenhouse.io/v1/boards/${this.board}/jobs?content=true`;
    } else if (this.boardType === 'lever' && this.board) {
      this.endpoint = `https://api.lever.co/v0/postings/${this.board}?mode=json`;
    } else {
      this.endpoint = config.endpoint || '';
    }

    this.customMapJob = config.mapJob;
  }

  /**
   * Fetches and normalizes listings from the public board.
   * @returns {Promise<Array<object>>}
   */
  async discover() {
    if (!this.endpoint) {
      return [];
    }

    const response = await fetchWithRetry(
      this.endpoint,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'AI-Job-Application-Agent/1.0 (respectful career-board client)',
        },
      },
      {
        sourceName: this.name,
        logger: this.logger,
      }
    );

    if (!response.ok) {
      throw new Error(`Company career source "${this.name}" returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (typeof this.customMapJob === 'function') {
      return this.customMapJob(data);
    }

    if (this.boardType === 'greenhouse') {
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      return jobs
        .filter((job) => {
          const loc = (job.location?.name || '').toLowerCase();
          return (
            !loc ||
            loc.includes('india') ||
            loc.includes('bengaluru') ||
            loc.includes('bangalore') ||
            loc.includes('remote') ||
            loc.includes('hyderabad') ||
            loc.includes('mumbai') ||
            loc.includes('pune') ||
            loc.includes('delhi') ||
            loc.includes('gurgaon') ||
            loc.includes('gurugram') ||
            loc.includes('noida') ||
            loc.includes('chennai')
          );
        })
        .map((job) => ({
          source: this.name,
          sourceJobId: String(job.id),
          company: this.companyName,
          title: job.title,
          description: job.content ? stripHtml(job.content) : '',
          location: normalizeIndianLocation(job.location?.name || 'India (Remote)'),
          employmentType: 'Full-time',
          salary: null,
          url: job.absolute_url,
          postedAt: job.updated_at ? new Date(job.updated_at) : null,
        }));
    }

    if (this.boardType === 'lever') {
      const postings = Array.isArray(data) ? data : [];
      return postings
        .filter((posting) => {
          const loc = (posting.categories?.location || '').toLowerCase();
          return (
            !loc ||
            loc.includes('india') ||
            loc.includes('bengaluru') ||
            loc.includes('bangalore') ||
            loc.includes('remote') ||
            loc.includes('hyderabad') ||
            loc.includes('mumbai') ||
            loc.includes('pune') ||
            loc.includes('delhi') ||
            loc.includes('gurgaon') ||
            loc.includes('gurugram') ||
            loc.includes('noida') ||
            loc.includes('chennai')
          );
        })
        .map((posting) => ({
          source: this.name,
          sourceJobId: String(posting.id),
          company: this.companyName,
          title: posting.text,
          description: posting.descriptionPlain || (posting.description ? stripHtml(posting.description) : ''),
          location: normalizeIndianLocation(posting.categories?.location || 'India (Remote)'),
          employmentType: posting.categories?.commitment || 'Full-time',
          salary: null,
          url: posting.hostedUrl || posting.applyUrl,
          postedAt: posting.createdAt ? new Date(posting.createdAt) : null,
        }));
    }

    return [];
  }
}

/**
 * Basic HTML tag stripper for board job descriptions.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
