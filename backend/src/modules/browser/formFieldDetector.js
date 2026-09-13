/** @param {import('playwright').Page} page */
export async function detectCaptcha(page) {
  return (
    (await page
      .locator('iframe[src*="captcha" i], [data-sitekey], .g-recaptcha, .h-captcha')
      .count()) > 0
  );
}

/** @param {import('playwright').Page} page */
export async function detectFormFields(page) {
  return page.locator('input:not([type="hidden"]), textarea, select').evaluateAll((elements) =>
    elements.map((element) => ({
      name: element.getAttribute('name') ?? '',
      type: element.getAttribute('type') ?? element.tagName.toLowerCase(),
      required: element.required || element.getAttribute('aria-required') === 'true',
      label:
        element.getAttribute('aria-label') ??
        document.querySelector(`label[for="${element.id}"]`)?.textContent?.trim() ??
        '',
    })),
  );
}

/**
 * Detects if the current page contains a legitimate job application form
 * as opposed to an aggregator job listing or search results page.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
export async function isApplicationForm(page) {
  return await page
    .evaluate(() => {
      // 1. File input is an almost definitive signal of an application form
      if (document.querySelector('input[type="file"]')) return true;

      // 2. Known ATS form containers
      if (
        document.querySelector('#application_form, #application-form, form.application_form') ||
        document.querySelector('[data-qa="job-application"]') ||
        document.querySelector('[data-automation-id="workdayApplication"]') ||
        document.querySelector('iframe[src*="greenhouse"], iframe[src*="lever.co"]')
      ) {
        return true;
      }

      // 3. Check for applicant input fields vs search/aggregator fields
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
      if (inputs.length === 0) return false;

      const applicantFieldPattern =
        /name|first.*name|last.*name|email|phone|mobile|resume|cv|portfolio|linkedin|github|experience|skills|cover.*letter/i;
      const searchPattern = /search|keyword|query|location-search|newsletter|subscribe|alert/i;

      let applicantFieldCount = 0;
      for (const input of inputs) {
        const text = `${input.name || ''} ${input.id || ''} ${input.getAttribute('aria-label') || ''} ${input.placeholder || ''} ${document.querySelector(`label[for="${input.id}"]`)?.textContent || ''}`;
        if (searchPattern.test(text)) continue;
        if (applicantFieldPattern.test(text)) applicantFieldCount += 1;
      }

      if (applicantFieldCount >= 1) return true;

      // 4. Check for a submit button inside a form with inputs
      const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
      const submitText = submitBtn?.textContent || submitBtn?.value || '';
      if (/submit.*application|apply.*now|send.*application/i.test(submitText) && inputs.length >= 1) {
        return true;
      }

      return false;
    })
    .catch(() => false);
}

/**
 * Ensures the page is an application form. If it looks like a listing/redirect page,
 * tries to follow the primary "Apply" or "View job" link once.
 * If still not a form, halts with a clear reason.
 * @param {import('playwright').Page} page
 * @param {import('pino').Logger} [logger]
 * @returns {Promise<{ isForm: boolean, page: import('playwright').Page, reason?: string }>}
 */
export async function ensureApplicationForm(page, logger) {
  if (await isApplicationForm(page)) {
    return { isForm: true, page };
  }

  // Listing page detected. Attempt to follow the primary "Apply" link once.
  const applyLinkSelectors = [
    'a:has-text("Apply on company website")',
    'a:has-text("Apply on company site")',
    'a:has-text("Apply on employer site")',
    'a:has-text("Apply Now")',
    'a:has-text("Apply for this job")',
    'a:has-text("Apply online")',
    'a:has-text("Apply")',
    'a[href*="/apply"]',
    'a:has-text("View job")',
    'button:has-text("Apply on company website")',
    'button:has-text("Apply Now")',
  ];

  for (const selector of applyLinkSelectors) {
    try {
      const loc = page.locator(selector).first();
      if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
        if (logger) {
          logger.info({ selector }, 'Listing page detected: following external apply link once');
        }

        const [popup] = await Promise.all([
          page.waitForEvent('popup', { timeout: 4000 }).catch(() => null),
          loc.click({ timeout: 5000 }).catch(() => null),
        ]);

        const targetPage = popup || page;
        await targetPage.waitForLoadState('domcontentloaded').catch(() => {});
        await targetPage.waitForTimeout(1000);

        if (await isApplicationForm(targetPage)) {
          return { isForm: true, page: targetPage };
        }
        break;
      }
    } catch {
      // Continue to next selector
    }
  }

  return {
    isForm: false,
    page,
    reason: 'landed on a listing page, not an application form',
  };
}
