import { APIJobSource } from './sources/apiJobSource.js';
import { SampleJobSource } from './sources/sampleJobSource.js';
import { RSSJobSource } from './sources/rssJobSource.js';

/**
 * Creates job sources based on system configuration.
 * @param {{ JOB_SOURCES?: string, RSS_FEED_URLS?: string, logger?: import('pino').Logger }} config
 * @returns {Array<{ name: string, discover: () => Promise<object[]> }>}
 */
export function createJobSources(config = {}) {
  const sources = [];
  const requestedSources = (config.JOB_SOURCES ?? 'remotive,sample')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const name of requestedSources) {
    if (name === 'remotive' || name === 'api') {
      sources.push(new APIJobSource());
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
    sources.push(new SampleJobSource());
  }

  return sources;
}
