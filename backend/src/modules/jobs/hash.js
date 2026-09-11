import { createHash } from 'node:crypto';

/** @param {string} value @returns {string} */
export function normalizeText(value) { return value.toLowerCase().replace(/\s+/g, ' ').trim(); }
/** @param {string} description @returns {string} */
export function contentHash(description) { return createHash('sha256').update(normalizeText(description)).digest('hex'); }
/** @param {string} url @returns {string} */
export function canonicalizeUrl(url) { const parsed = new URL(url); parsed.hash = ''; for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|ref|source)/i.test(key)) parsed.searchParams.delete(key); return parsed.toString().replace(/\/$/, ''); }
/** @param {{company:string,title:string,location?:string|null}} job @returns {string} */
export function jobFingerprint(job) { return [job.company, job.title, job.location ?? ''].map(normalizeText).join('|'); }
