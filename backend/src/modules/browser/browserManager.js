import { chromium } from 'playwright';

export class BrowserManager {
  /** @param {{headless:boolean, logger:import('pino').Logger}} config */
  constructor(config) {
    this.config = config;
    this.activeSessions = new Map();
  }

  async withPage(action) {
    const browser = await chromium.launch({ headless: this.config.headless });
    try {
      const page = await browser.newPage();
      return await action(page);
    } finally {
      await browser.close();
    }
  }

  /**
   * Creates and retains a browser session for human recheck.
   * @param {string} applicationId
   * @param {string} url
   */
  async createSession(applicationId, url) {
    await this.closeSession(applicationId);

    const browser = await chromium.launch({ headless: this.config.headless });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const timeout = globalThis.setTimeout(async () => {
      await this.closeSession(applicationId);
    }, 30 * 60 * 1000);

    const session = { browser, page, timeout, createdAt: Date.now() };
    this.activeSessions.set(applicationId, session);
    return session;
  }

  hasSession(applicationId) {
    const session = this.activeSessions.get(applicationId);
    return Boolean(session && !session.page.isClosed());
  }

  getSession(applicationId) {
    const session = this.activeSessions.get(applicationId);
    if (session && !session.page.isClosed()) {
      return session;
    }
    return null;
  }

  async closeSession(applicationId) {
    const session = this.activeSessions.get(applicationId);
    if (session) {
      globalThis.clearTimeout(session.timeout);
      try {
        if (!session.page.isClosed()) await session.page.close();
        await session.browser.close();
      } catch {
        // Ignore already closed errors
      }
      this.activeSessions.delete(applicationId);
    }
  }
}
