/** @typedef {{name:string, url:string}} RSSSourceConfig */
export class RSSJobSource {
  /** @param {RSSSourceConfig} config */
  constructor(config) { this.name = config.name; this.type = 'rss'; this.url = config.url; }
  /** Fetches a public RSS/Atom feed; parsing is deliberately limited to standard item fields. @returns {Promise<object[]>} */
  async discover() { const response = await fetch(this.url, { headers: { accept: 'application/rss+xml, application/xml' } }); if (!response.ok) throw new Error(`RSS source returned ${response.status}`); const xml = await response.text(); return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => { const item = match[1]; const field = (name) => (item.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, 'i'))?.[1] ?? '').trim(); const link = field('link'); return { source: this.name, company: this.name, title: field('title'), description: field('description').replace(/<[^>]+>/g, ' '), location: 'Unknown', url: link, sourceJobId: link, postedAt: field('pubDate') ? new Date(field('pubDate')) : null }; }).filter((job) => job.title && job.description && job.url); }
}
