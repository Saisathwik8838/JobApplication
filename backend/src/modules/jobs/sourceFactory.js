import { APIJobSource } from './sources/apiJobSource.js';
import { ArbeitnowJobSource } from './sources/arbeitnowJobSource.js';
import { AdzunaJobSource } from './sources/adzunaJobSource.js';
import { RSSJobSource } from './sources/rssJobSource.js';

/**
 * Creates job sources based on system configuration.
 * Throws a loud startup error if no valid sources are configured.
 * @param {{ JOB_SOURCES?: string, RSS_FEED_URLS?: string, ADZUNA_APP_ID?: string, ADZUNA_APP_KEY?: string, logger?: import('pino').Logger }} config
 * @returns {Array<{ name: string, discover: () => Promise<object[]> }>}
 */
export function createJobSources(config = {}) {
  const sources = [];
  const requestedSources = (config.JOB_SOURCES ?? 'remotive,arbeitnow')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const name of requestedSources) {
    if (name === 'remotive' || name === 'api') {
      sources.push(new APIJobSource());
    } else if (name === 'arbeitnow') {
      sources.push(new ArbeitnowJobSource());
    } else if (name === 'adzuna') {
      sources.push(new AdzunaJobSource({
        appId: config.ADZUNA_APP_ID,
        appKey: config.ADZUNA_APP_KEY,
        logger: config.logger,
      }));
    }
  }

  if (config.RSS_FEED_URLS) {
    const urls = config.RSS_FEED_URLS.split(',').map((u) => u.trim()).filter(Boolean);
    urls.forEach((url, idx) => {
      sources.push(new RSSJobSource({ name: `rss-${idx + 1}`, url }));
    });
  }

  if (sources.length === 0) {
    throw new Error('No job sources configured — set JOB_SOURCES and the required API keys before starting discovery');
  }

  return sources;
}

