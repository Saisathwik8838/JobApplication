import { detectCaptcha } from './formFieldDetector.js';
export class SubmissionManager {
  /** @param {{requireApproval:boolean}} config */
  constructor(config) { this.requireApproval = config.requireApproval; }
  /** @param {import('./applicationSession.js').ApplicationSession} session */
  async submit(session) { if (this.requireApproval && session.application.status !== 'APPROVED') return { status: 'BLOCKED', reason: 'Explicit approval is required.' }; if (session.answers.some((answer) => answer.status !== 'READY')) return { status: 'BLOCKED', reason: 'Application contains unknown answers.' }; if (await detectCaptcha(session.page)) return { status: 'MANUAL_INTERVENTION', reason: 'CAPTCHA detected.' }; const submit = session.page.getByRole('button', { name: /submit application|submit/i }); if (!await submit.count()) return { status: 'MANUAL_INTERVENTION', reason: 'Expected submit button was not found.' }; await submit.first().click(); return { status: 'SUBMITTED', confirmationUrl: session.page.url() }; }
}
