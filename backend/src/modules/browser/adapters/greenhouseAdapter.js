import { GenericApplicationAdapter } from './genericApplicationAdapter.js';
export class GreenhouseAdapter extends GenericApplicationAdapter { constructor() { super(); this.name = 'greenhouse'; this.supportLevel = 'partially_supported'; } async detect(url, page) { return /greenhouse\.io|\/embed\/job_app/i.test(url) || await page.locator('[id*="application" i]').count() > 0; } }
