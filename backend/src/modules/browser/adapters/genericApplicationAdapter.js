import { detectCaptcha, detectFormFields, isApplicationForm, ensureApplicationForm } from '../formFieldDetector.js';

export class GenericApplicationAdapter {
  constructor() {
    this.supportLevel = 'partially_supported';
    this.name = 'generic';
  }

  /** @param {string} _url @param {import('playwright').Page} page */
  async detect(_url, page) {
    return await isApplicationForm(page);
  }

  /** @param {import('../applicationSession.js').ApplicationSession} session */
  async fill(session) {
    if (await detectCaptcha(session.page)) {
      return { status: 'MANUAL_INTERVENTION', reason: 'CAPTCHA detected', fieldsFilled: 0, filledValues: {} };
    }

    const formCheck = await ensureApplicationForm(session.page);
    if (!formCheck.isForm) {
      return {
        status: 'MANUAL_INTERVENTION',
        reason: 'landed on a listing page, not an application form',
        fieldsFilled: 0,
        filledValues: {},
      };
    }
    if (formCheck.page && formCheck.page !== session.page) {
      session.page = formCheck.page;
    }

    const fields = await detectFormFields(session.page);
    let fieldsFilled = 0;
    const filledValues = {};

    // 1. Text and select fields from resolved truthful answers
    for (const answer of session.answers) {
      if (answer.status !== 'READY' || !answer.answer) continue;
      const target = session.page.getByLabel(answer.question, { exact: false });
      if (await target.count()) {
        await target.first().fill(answer.answer);
        fieldsFilled += 1;
        filledValues[answer.question] = answer.answer;
      }
    }

    // 2. Shared resume file upload step (if session.resumePath is provided)
    let resumeUploaded = false;
    if (session.resumePath) {
      try {
        const fileInputs = session.page.locator('input[type="file"]');
        const fileInputCount = await fileInputs.count();
        if (fileInputCount > 0) {
          let targetInput = null;
          for (let i = 0; i < fileInputCount; i += 1) {
            const input = fileInputs.nth(i);
            const id = (await input.getAttribute('id')) || '';
            const name = (await input.getAttribute('name')) || '';
            const aria = (await input.getAttribute('aria-label')) || '';
            if (/resume|cv/i.test(`${id} ${name} ${aria}`) || fileInputCount === 1) {
              targetInput = input;
              break;
            }
          }
          if (!targetInput) {
            targetInput = fileInputs.first();
          }

          await targetInput.setInputFiles(session.resumePath);
          resumeUploaded = true;
          fieldsFilled += 1;
          filledValues['resume'] = session.resumePath;
        }
      } catch {
        // Continue gracefully if file input cannot be attached directly
      }
    }

    // 3. Capture filled values from DOM
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

    // 4. Validate unexpected required fields
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

    // 5. Identify required fields that are not filled
    const missingRequired = [];
    for (const field of fields) {
      if (!field.required) continue;

      // If this is a file upload field and resume was uploaded, it is satisfied
      if (field.type === 'file' && resumeUploaded) {
        continue;
      }

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
