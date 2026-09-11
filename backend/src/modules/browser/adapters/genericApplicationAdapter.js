import { detectCaptcha, detectFormFields } from '../formFieldDetector.js';
export class GenericApplicationAdapter {
  constructor() { this.supportLevel = 'partially_supported'; this.name = 'generic'; }
  /** @param {string} _url @param {import('playwright').Page} page */
  async detect(_url, page) { return (await page.locator('form').count()) > 0; }
  /** @param {import('../applicationSession.js').ApplicationSession} session */
  async fill(session) { if (await detectCaptcha(session.page)) return { status: 'MANUAL_INTERVENTION', reason: 'CAPTCHA detected', fieldsFilled: 0 }; const fields = await detectFormFields(session.page); let fieldsFilled = 0; for (const answer of session.answers) { if (answer.status !== 'READY' || !answer.answer) continue; const target = session.page.getByLabel(answer.question, { exact: false }); if (await target.count()) { await target.first().fill(answer.answer); fieldsFilled += 1; } }
    const missing = fields.filter((field) => field.required && !field.label).map((field) => field.name); if (missing.length) return { status: 'MANUAL_INTERVENTION', reason: 'Unexpected required fields', missing, fieldsFilled }; return { status: 'READY_FOR_REVIEW', fieldsFilled }; }
}
