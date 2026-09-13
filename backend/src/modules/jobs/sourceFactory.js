import { APIJobSource } from './sources/apiJobSource.js';
import { ArbeitnowJobSource } from './sources/arbeitnowJobSource.js';
import { AdzunaJobSource } from './sources/adzunaJobSource.js';
import { NCSJobSource } from './sources/ncsJobSource.js';
import { CompanyCareerSource } from './sources/companyCareerSource.js';
import { RSSJobSource } from './sources/rssJobSource.js';

/**
 * Default seeded Indian tech companies publishing public Greenhouse/Lever boards.
 */
export const DEFAULT_COMPANY_CAREER_SOURCES = [
  {
    name: 'razorpay',
    companyName: 'Razorpay',
    boardType: 'greenhouse',
    board: 'razorpaysoftwareprivatelimited',
  },
  {
    name: 'postman',
    companyName: 'Postman',
    boardType: 'greenhouse',
    board: 'postman',
  },
  {
    name: 'cred',
    companyName: 'CRED',
    boardType: 'lever',
    board: 'cred',
  },
];

/**
 * Parses company career sources from configuration.
 * @param {string|Array<object>} [rawConfig]
 * @param {import('pino').Logger} [logger]
 * @returns {Array<object>}
 */
function parseCompanySources(rawConfig, logger) {
  if (!rawConfig) return DEFAULT_COMPANY_CAREER_SOURCES;
  if (Array.isArray(rawConfig)) return rawConfig;

  try {
    const parsed = JSON.parse(rawConfig);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_COMPANY_CAREER_SOURCES;
  } catch (err) {
    if (logger) {
      logger.warn({ err: err.message }, 'Failed to parse COMPANY_CAREER_SOURCES JSON; using default seeded sources');
    }
    return DEFAULT_COMPANY_CAREER_SOURCES;
  }
}

/**
 * Inspects configured sources and checks whether required API credentials are present.
 * @param {object} [config]
 * @returns {Array<{ name: string, type: string, country?: string, configured: boolean, active: boolean, reason: string|null, companies?: string[] }>}
 */
export function getSourceStatus(config = {}) {
  const requestedSources = (config.JOB_SOURCES ?? 'adzuna,ncs,arbeitnow')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const statuses = [];

  for (const name of requestedSources) {
    if (name === 'adzuna') {
      const configured = Boolean(config.ADZUNA_APP_ID && config.ADZUNA_APP_KEY);
      statuses.push({
        name: 'adzuna',
        type: 'api',
        country: config.ADZUNA_COUNTRY || 'in',
        configured,
        active: configured,
        reason: configured ? null : 'ADZUNA_APP_ID or ADZUNA_APP_KEY not set',
      });
    } else if (name === 'ncs') {
      const configured = Boolean(config.NCS_API_KEY && config.NCS_RESOURCE_ID);
      statuses.push({
        name: 'ncs',
        type: 'api',
        country: 'in',
        configured,
        active: configured,
        reason: configured ? null : 'NCS_API_KEY or NCS_RESOURCE_ID not set',
      });
    } else if (name === 'arbeitnow') {
      statuses.push({
        name: 'arbeitnow',
        type: 'api',
        configured: true,
        active: true,
        reason: null,
      });
    } else if (name === 'remotive' || name === 'api') {
      statuses.push({
        name: 'remotive',
        type: 'api',
        configured: true,
        active: true,
        reason: null,
      });
    } else if (name === 'company' || name === 'company-careers' || name === 'careers') {
      const companyConfigs = parseCompanySources(config.COMPANY_CAREER_SOURCES, config.logger);
      statuses.push({
        name: 'company',
        type: 'company-boards',
        configured: companyConfigs.length > 0,
        active: companyConfigs.length > 0,
        companies: companyConfigs.map((c) => c.companyName || c.name),
        reason: null,
      });
    }
  }

  return statuses;
}

/**
 * Creates job sources based on system configuration.
 * Throws a loud startup error if no valid sources are configured.
 * Default sources for India job seekers: adzuna, ncs, arbeitnow
 *
 * @param {{
 *   JOB_SOURCES?: string,
 *   RSS_FEED_URLS?: string,
 *   ADZUNA_APP_ID?: string,
 *   ADZUNA_APP_KEY?: string,
 *   ADZUNA_COUNTRY?: string,
 *   NCS_API_KEY?: string,
 *   NCS_RESOURCE_ID?: string,
 *   COMPANY_CAREER_SOURCES?: string|Array<object>,
 *   logger?: import('pino').Logger
 * }} config
 * @returns {Array<{ name: string, discover: () => Promise<object[]> }>}
 */
export function createJobSources(config = {}) {
  const sources = [];
  const requestedSources = (config.JOB_SOURCES ?? 'adzuna,ncs,arbeitnow')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const statuses = getSourceStatus(config);
  const activeCount = statuses.filter((s) => s.active).length;

  for (const st of statuses) {
    if (!st.configured && st.reason && config.logger) {
      config.logger.warn({ source: st.name }, `${st.reason} — ${st.name} source disabled, only ${activeCount} sources active.`);
    }
  }

  let companySourcesAdded = false;

  for (const name of requestedSources) {
    if (name === 'adzuna') {
      sources.push(
        new AdzunaJobSource({
          appId: config.ADZUNA_APP_ID,
          appKey: config.ADZUNA_APP_KEY,
          country: config.ADZUNA_COUNTRY || 'in',
          logger: config.logger,
        })
      );
    } else if (name === 'ncs') {
      sources.push(
        new NCSJobSource({
          apiKey: config.NCS_API_KEY,
          resourceId: config.NCS_RESOURCE_ID,
          logger: config.logger,
        })
      );
    } else if (name === 'arbeitnow') {
      sources.push(new ArbeitnowJobSource({ logger: config.logger }));
    } else if (name === 'remotive' || name === 'api') {
      sources.push(new APIJobSource({ logger: config.logger }));
    } else if (name === 'company' || name === 'company-careers' || name === 'careers') {
      const companyConfigs = parseCompanySources(config.COMPANY_CAREER_SOURCES, config.logger);
      for (const comp of companyConfigs) {
        sources.push(new CompanyCareerSource({ ...comp, logger: config.logger }));
      }
      companySourcesAdded = true;
    }
  }

  // If COMPANY_CAREER_SOURCES was explicitly provided in config but "company" wasn't listed in JOB_SOURCES, still add them
  if (config.COMPANY_CAREER_SOURCES && !companySourcesAdded) {
    const companyConfigs = parseCompanySources(config.COMPANY_CAREER_SOURCES, config.logger);
    for (const comp of companyConfigs) {
      sources.push(new CompanyCareerSource({ ...comp, logger: config.logger }));
    }
  }

  if (config.RSS_FEED_URLS) {
    const urls = config.RSS_FEED_URLS.split(',').map((u) => u.trim()).filter(Boolean);
    urls.forEach((url, idx) => {
      sources.push(new RSSJobSource({ name: `rss-${idx + 1}`, url, logger: config.logger }));
    });
  }

  if (sources.length === 0) {
    throw new Error('No job sources configured — set JOB_SOURCES and the required API keys before starting discovery');
  }

  return sources;
}
