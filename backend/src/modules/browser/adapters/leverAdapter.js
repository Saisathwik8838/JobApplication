import { GenericApplicationAdapter } from './genericApplicationAdapter.js';
export class LeverAdapter extends GenericApplicationAdapter { constructor() { super(); this.name = 'lever'; this.supportLevel = 'partially_supported'; } async detect(url, page) { return /jobs\.lever\.co/i.test(url) || await page.locator('[data-qa="application-form"]').count() > 0; } }
