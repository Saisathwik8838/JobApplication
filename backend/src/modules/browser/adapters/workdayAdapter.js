import { GenericApplicationAdapter } from './genericApplicationAdapter.js';
import { detectCaptcha, detectFormFields } from '../formFieldDetector.js';

export class WorkdayAdapter extends GenericApplicationAdapter {
  constructor() {
    super();
    this.name = 'workday';
    this.supportLevel = 'fully_supported';
  }

  /**
   * @param {string} url
   * @param {import('playwright').Page} page
   */
  async detect(url, page) {
    return (
      /myworkdayjobs\.com/i.test(url) ||
      (await page.locator('[data-automation-id="jobPostingPage"], [data-automation-id="applicationPage"], [data-automation-id*="workday" i]').count()) > 0
    );
  }

  /**
   * Workday-specific multi-step wizard form filling.
   * Detects wizard steps, fills recognized inputs, advances via "Next" / "Save and Continue",
   * and halts cleanly to MANUAL_INTERVENTION if an unrecognized step is encountered after 2 tries.
   * Never guesses or clicks submit.
   *
   * @param {import('../applicationSession.js').ApplicationSession} session
   */
  async fill(session) {
    const page = session.page;
    let fieldsFilled = 0;
    const filledValues = {};

    let stepCount = 0;
    const maxSteps = 10;
    let unrecognizedRetries = 0;

    while (stepCount < maxSteps) {
      // 1. CAPTCHA / anti-bot detection at each step
      if (await detectCaptcha(page)) {
        return {
          status: 'MANUAL_INTERVENTION',
          reason: 'CAPTCHA detected on Workday wizard step',
          fieldsFilled,
          filledValues,
        };
      }

      // 2. Step detection: identify current wizard step type on visible elements
      const stepHeaders = await page
        .locator('h1:visible, h2:visible, h3:visible, [data-automation-id*="step" i]:visible, legend:visible')
        .allInnerTexts()
        .catch(() => []);

      const stepText = stepHeaders.join(' ').toLowerCase();
      const inputElements = await page.locator('input:visible:not([type="hidden"]), textarea:visible, select:visible').count();

      const isRecognizedStep =
        /information|contact|experience|resume|history|education|question|disclosure|review|summary|preview/i.test(stepText) ||
        inputElements > 0;

      if (!isRecognizedStep) {
        unrecognizedRetries += 1;
        if (unrecognizedRetries >= 2) {
          return {
            status: 'MANUAL_INTERVENTION',
            reason: 'Unrecognized Workday wizard step after 2 tries — manual intervention required.',
            stepCount,
            fieldsFilled,
            filledValues,
          };
        }
        await page.waitForTimeout(300);
        continue;
      }

      unrecognizedRetries = 0;

      // 3. Fill answers for fields on current step (MUST be visible)
      for (const answer of session.answers) {
        if (answer.status !== 'READY' || !answer.answer) continue;

        const candidate = page
          .locator(`[data-automation-id*="${answer.question.toLowerCase().replace(/\s+/g, '-')}"]`)
          .or(page.getByLabel(answer.question, { exact: false }));
        const target = candidate.filter({ visible: true });

        if ((await target.count()) > 0) {
          try {
            await target.first().fill(answer.answer);
            fieldsFilled += 1;
            filledValues[answer.question] = answer.answer;
          } catch {
            // Some select/dropdown controls require selectOption
          }
        }
      }

      // 4. Handle resume upload on experience/resume step
      if (session.resumePath) {
        try {
          const fileInputs = page.locator(
            '[data-automation-id="file-upload-drop-zone"]:visible input[type="file"], [data-automation-id*="resume" i]:visible input[type="file"], input[type="file"]:visible'
          );
          if ((await fileInputs.count()) > 0) {
            await fileInputs.first().setInputFiles(session.resumePath);
            fieldsFilled += 1;
            filledValues['resume'] = session.resumePath;
          }
        } catch {
          // File input not on this step
        }
      }

      // 5. Capture values filled on current step (only visible inputs)
      const stepCaptured = await page
        .evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
          const state = {};
          for (const el of inputs) {
            if (el.offsetParent === null && el.type !== 'file') continue;
            const key =
              el.getAttribute('data-automation-id') ||
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

      Object.assign(filledValues, stepCaptured);

      // 6. Check if we reached the final review step or if submit is presented
      const isReviewStep =
        (await page.locator('[data-automation-id="reviewPage"]:visible, section.active[data-automation-id*="review" i]').count()) > 0 ||
        /review|summary|preview/i.test(stepText);

      const submitButton = page.locator(
        '[data-automation-id="bottom-navigation-submit-button"]:visible, button:has-text("Submit Application"):visible'
      );
      const hasSubmit = (await submitButton.count()) > 0;

      if (isReviewStep || hasSubmit) {
        // Halt at review step for Gate 2 human recheck — never click submit automatically!
        break;
      }

      // 7. Find wizard advance button ("Next" or "Save and Continue")
      const advanceButton = page.locator(
        '[data-automation-id="bottom-navigation-next-button"]:visible, button:has-text("Save and Continue"):visible, button:has-text("Next"):visible, button:has-text("Continue"):visible'
      );

      if ((await advanceButton.count()) > 0) {
        await advanceButton.first().click();
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(300);
        stepCount += 1;
      } else {
        // No advance button found; wizard completed or single-step
        break;
      }
    }

    // 8. Validate required fields across the captured state
    const formFields = await detectFormFields(page);
    const missingRequired = [];
    for (const field of formFields) {
      if (!field.required) continue;
      if (field.type === 'file' && session.resumePath) continue;

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
