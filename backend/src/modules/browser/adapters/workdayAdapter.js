import { GenericApplicationAdapter } from './genericApplicationAdapter.js';
export class WorkdayAdapter extends GenericApplicationAdapter { constructor() { super(); this.name = 'workday'; this.supportLevel = 'partially_supported'; } async detect(url, page) { return /myworkdayjobs\.com/i.test(url) || await page.locator('[data-automation-id="jobPostingPage"]').count() > 0; } }
