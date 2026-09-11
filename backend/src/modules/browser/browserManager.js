import { chromium } from 'playwright';
export class BrowserManager {
  /** @param {{headless:boolean, logger:import('pino').Logger}} config */
  constructor(config) { this.config = config; }
  async withPage(action) { const browser = await chromium.launch({ headless: this.config.headless }); try { const page = await browser.newPage(); return await action(page); } finally { await browser.close(); } }
}
