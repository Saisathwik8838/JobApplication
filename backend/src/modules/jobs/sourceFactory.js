import { APIJobSource } from './sources/apiJobSource.js';
import { ArbeitnowJobSource } from './sources/arbeitnowJobSource.js';
import { AdzunaJobSource } from './sources/adzunaJobSource.js';
import { SampleJobSource } from './sources/sampleJobSource.js';
import { RSSJobSource } from './sources/rssJobSource.js';

/**
 * Checks if the fallback sample source is currently active in the given source list.
 * @param {Array<{ name: string }>} sources
 * @returns {boolean}
 */
export function isSampleFallbackActive(sources = []) {
  return sources.some((s) => s.name === 'sample' || s instanceof SampleJobSource);
}

/**
 * Creates job sources based on system configuration.
 * @param {{ JOB_SOURCES?: string, RSS_FEED_URLS?: string, ADZUNA_APP_ID?: string, ADZUNA_APP_KEY?: string, logger?: import('pino').Logger }} config
 * @returns {Array<{ name: string, discover: () => Promise<object[]> }>}
 */
export function createJobSources(config = {}) {
  const sources = [];
  const requestedSources = (config.JOB_SOURCES ?? 'remotive')
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
    } else if (name === 'sample') {
      sources.push(new SampleJobSource());
    }
  }

  if (config.RSS_FEED_URLS) {
    const urls = config.RSS_FEED_URLS.split(',').map((u) => u.trim()).filter(Boolean);
    urls.forEach((url, idx) => {
      sources.push(new RSSJobSource({ name: `rss-${idx + 1}`, url }));
    });
  }

  // Fallback to sample job source if no valid sources configured
  if (sources.length === 0) {
    const warnMsg = '⚠️ LOUD WARNING: No valid job sources configured! Falling back to synthetic SampleJobSource. Discovered jobs will be fake placeholders.';
    if (config.logger) {
      config.logger.warn(warnMsg);
    } else {
      console.warn(warnMsg);
    }
    sources.push(new SampleJobSource());
  }

  return sources;
}
