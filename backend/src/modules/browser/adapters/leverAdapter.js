import { GenericApplicationAdapter } from './genericApplicationAdapter.js';
import { detectCaptcha, detectFormFields } from '../formFieldDetector.js';

export class LeverAdapter extends GenericApplicationAdapter {
  constructor() {
    super();
    this.name = 'lever';
    this.supportLevel = 'fully_supported';
  }

  /**
   * @param {string} url
   * @param {import('playwright').Page} page
   */
  async detect(url, page) {
    return (
      /jobs\.lever\.co/i.test(url) ||
      (await page.locator('[data-qa="application-form"], [data-qa="application-page"], [data-qa="name-input"]').count()) > 0
    );
  }

  /**
   * Lever-specific form filling:
   * Uses Lever's distinct data-qa attributes directly instead of fuzzy label matching.
   *
   * @param {import('../applicationSession.js').ApplicationSession} session
   */
  async fill(session) {
    if (await detectCaptcha(session.page)) {
      return { status: 'MANUAL_INTERVENTION', reason: 'CAPTCHA detected', fieldsFilled: 0, filledValues: {} };
    }

    let fieldsFilled = 0;
    const filledValues = {};
    const page = session.page;

    // Direct mapping table for Lever's standard data-qa attributes
    const QA_SELECTORS = {
      name: '[data-qa="name-input"]',
      email: '[data-qa="email-input"]',
      phone: '[data-qa="phone-input"]',
      org: '[data-qa="org-input"]',
      urls: '[data-qa="urls-input"]',
      linkedin: '[data-qa="linkedin-input"], [data-qa*="linkedin"]',
      github: '[data-qa="github-input"], [data-qa*="github"]',
    };

    // 1. Fill standard fields using data-qa selectors
    for (const answer of session.answers) {
      if (answer.status !== 'READY' || !answer.answer) continue;

      const q = answer.question.toLowerCase();
      let selector = null;

      if (/first name|last name|full name|^name$/i.test(q)) {
        selector = QA_SELECTORS.name;
      } else if (/email/i.test(q)) {
        selector = QA_SELECTORS.email;
      } else if (/phone|mobile/i.test(q)) {
        selector = QA_SELECTORS.phone;
      } else if (/company|organization|current employer/i.test(q)) {
        selector = QA_SELECTORS.org;
      } else if (/linkedin/i.test(q)) {
        selector = QA_SELECTORS.linkedin;
      } else if (/github/i.test(q)) {
        selector = QA_SELECTORS.github;
      } else if (/website|portfolio|url/i.test(q)) {
        selector = QA_SELECTORS.urls;
      }

      if (selector) {
        const target = page.locator(selector);
        if ((await target.count()) > 0) {
          await target.first().fill(answer.answer);
          fieldsFilled += 1;
          filledValues[answer.question] = answer.answer;
          continue;
        }
      }

      // If not a standard data-qa field, check if Lever has a custom question with data-qa
      const customCard = page.locator(`[data-qa*="${q.slice(0, 15).replace(/[^a-z0-9]/g, '-')}"] input, [data-qa*="${q.slice(0, 15).replace(/[^a-z0-9]/g, '-')}"] textarea`);
      if ((await customCard.count()) > 0) {
        await customCard.first().fill(answer.answer);
        fieldsFilled += 1;
        filledValues[answer.question] = answer.answer;
        continue;
      }

      // Fallback to getByLabel for remaining custom questionnaire items
      const byLabel = page.getByLabel(answer.question, { exact: false });
      if ((await byLabel.count()) > 0) {
        await byLabel.first().fill(answer.answer);
        fieldsFilled += 1;
        filledValues[answer.question] = answer.answer;
      }
    }

    // 2. Lever resume upload via data-qa or file input
    let resumeUploaded = false;
    if (session.resumePath) {
      try {
        const resumeInput = page.locator(
          'input[data-qa="resume-upload-input"], input[data-qa*="resume"], input[name*="resume" i], input[type="file"]'
        );
        if ((await resumeInput.count()) > 0) {
          await resumeInput.first().setInputFiles(session.resumePath);
          resumeUploaded = true;
          fieldsFilled += 1;
          filledValues['resume'] = session.resumePath;
        }
      } catch {
        // Fallback gracefully
      }
    }

    // 3. Capture all filled input states
    const captured = await page
      .evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
        const state = {};
        for (const el of inputs) {
          const key =
            el.getAttribute('data-qa') ||
            el.getAttribute('aria-label') ||
            document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ||
            el.name ||
            el.id;
          if (key && el.value) {
            state[key] = el.value;
          }
        }
        return state;
      })
      .catch(() => ({}));

    Object.assign(filledValues, captured);

    // 4. Verify required fields
    const fields = await detectFormFields(page);
    const missingRequired = [];
    for (const field of fields) {
      if (!field.required) continue;
      if (field.type === 'file' && resumeUploaded) continue;

      const fieldId = field.label || field.name;
      const hasValue =
        filledValues[fieldId] ||
        (field.label && filledValues[field.label]) ||
        (field.name && filledValues[field.name]);

      if (!hasValue) {
        missingRequired.push(fieldId);
      }
    }

    if (missingRequired.length > 0) {
      return {
        status: 'NEEDS_USER_INPUT',
        reason: `Required form field "${missingRequired[0]}" requires user input.`,
        missingFields: missingRequired,
        fieldsFilled,
        filledValues,
      };
    }

    return { status: 'READY_FOR_REVIEW', fieldsFilled, filledValues };
  }
}
