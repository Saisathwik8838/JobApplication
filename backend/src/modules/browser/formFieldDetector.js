/** @param {import('playwright').Page} page */
export async function detectCaptcha(page) { return (await page.locator('iframe[src*="captcha" i], [data-sitekey], .g-recaptcha, .h-captcha').count()) > 0; }
/** @param {import('playwright').Page} page */
export async function detectFormFields(page) { return page.locator('input:not([type="hidden"]), textarea, select').evaluateAll((elements) => elements.map((element) => ({ name: element.getAttribute('name') ?? '', type: element.getAttribute('type') ?? element.tagName.toLowerCase(), required: element.required || element.getAttribute('aria-required') === 'true', label: element.getAttribute('aria-label') ?? document.querySelector(`label[for="${element.id}"]`)?.textContent?.trim() ?? '' }))); }
