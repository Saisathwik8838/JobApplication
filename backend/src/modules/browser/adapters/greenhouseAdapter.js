import { GenericApplicationAdapter } from './genericApplicationAdapter.js';
import { detectCaptcha } from '../formFieldDetector.js';

export class GreenhouseAdapter extends GenericApplicationAdapter {
  constructor() {
    super();
    this.name = 'greenhouse';
    this.supportLevel = 'fully_supported';
  }

  /**
   * @param {string} url
   * @param {import('playwright').Page} page
   */
  async detect(url, page) {
    return (
      /greenhouse\.io|\/embed\/job_app|boards\.greenhouse\.io/i.test(url) ||
      (await page.locator('#application_form, #resume_fieldset, [id*="application" i]').count()) > 0
    );
  }

  /**
   * Greenhouse-specific form filling:
   * Handles resume dropzone / file upload input and "Add another" dynamic array fields.
   *
   * @param {import('../applicationSession.js').ApplicationSession} session
   */
  async fill(session) {
    if (await detectCaptcha(session.page)) {
      return { status: 'MANUAL_INTERVENTION', reason: 'CAPTCHA detected', fieldsFilled: 0, filledValues: {} };
    }

    // 1. Greenhouse resume upload dropzone
    if (session.resumePath) {
      try {
        const ghResumeInput = session.page.locator(
          '#resume_fieldset input[type="file"], input[type="file"][id*="resume" i], input[type="file"][name*="resume" i], input[type="file"]'
        );
        if ((await ghResumeInput.count()) > 0) {
          await ghResumeInput.first().setInputFiles(session.resumePath);
        }
      } catch {
        // Fall back to generic file upload in super.fill
      }
    }

    // 2. Handle "Add another" array fields (e.g. multiple links, websites, references)
    try {
      const addAnotherButtons = session.page.locator(
        'button:has-text("Add another"), a:has-text("Add another"), button:has-text("Add"), [data-qa="add-another"]'
      );
      const addCount = await addAnotherButtons.count();
      if (addCount > 0) {
        // Check if session answers contain multiple values for the same question or array answers
        const arrayAnswers = session.answers.filter((a) => Array.isArray(a.answer) && a.answer.length > 1);
        for (const arrAns of arrayAnswers) {
          for (let i = 1; i < arrAns.answer.length; i += 1) {
            if ((await addAnotherButtons.first().count()) > 0) {
              await addAnotherButtons.first().click();
              await session.page.waitForTimeout(100);
            }
          }
        }
      }
    } catch {
      // Continue if dynamic addition is not needed
    }

    // 3. Delegate to generic filler for standard answer mapping & validation
    return super.fill(session);
  }
}
