import { GreenhouseAdapter } from './adapters/greenhouseAdapter.js'; import { LeverAdapter } from './adapters/leverAdapter.js'; import { WorkdayAdapter } from './adapters/workdayAdapter.js'; import { GenericApplicationAdapter } from './adapters/genericApplicationAdapter.js';
export const defaultAdapters = [new GreenhouseAdapter(), new LeverAdapter(), new WorkdayAdapter(), new GenericApplicationAdapter()];
/** @param {string} url @param {import('playwright').Page} page @param {object[]} [adapters] */
export async function selectAdapter(url, page, adapters = defaultAdapters) { for (const adapter of adapters) if (await adapter.detect(url, page)) return adapter; return null; }
