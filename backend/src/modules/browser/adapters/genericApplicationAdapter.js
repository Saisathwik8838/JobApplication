import { detectCaptcha, detectFormFields } from '../formFieldDetector.js';

export class GenericApplicationAdapter {
  constructor() {
    this.supportLevel = 'partially_supported';
    this.name = 'generic';
  }

  /** @param {string} _url @param {import('playwright').Page} page */
  async detect(_url, page) {
    return (await page.locator('form').count()) > 0;
  }

  /** @param {import('../applicationSession.js').ApplicationSession} session */
  async fill(session) {
    if (await detectCaptcha(session.page)) {
      return { status: 'MANUAL_INTERVENTION', reason: 'CAPTCHA detected', fieldsFilled: 0, filledValues: {} };
    }

    const fields = await detectFormFields(session.page);
    let fieldsFilled = 0;
    const filledValues = {};

    for (const answer of session.answers) {
      if (answer.status !== 'READY' || !answer.answer) continue;
      const target = session.page.getByLabel(answer.question, { exact: false });
      if (await target.count()) {
        await target.first().fill(answer.answer);
        fieldsFilled += 1;
        filledValues[answer.question] = answer.answer;
      }
    }

    const captured = await session.page
      .evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
        const state = {};
        for (const el of inputs) {
          const label =
            el.getAttribute('aria-label') ||
            document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ||
            el.name ||
            el.id;
          if (label && el.value) {
            state[label] = el.value;
          }
        }
        return state;
      })
      .catch(() => ({}));

    Object.assign(filledValues, captured);

    const missingUnlabeled = fields.filter((field) => field.required && !field.label && !field.name);
    if (missingUnlabeled.length) {
      return {
        status: 'MANUAL_INTERVENTION',
        reason: 'Unexpected required fields without label or name',
        missing: missingUnlabeled,
        fieldsFilled,
        filledValues,
      };
    }

    // Identify required fields that are not filled
    const missingRequired = [];
    for (const field of fields) {
      if (!field.required) continue;
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
