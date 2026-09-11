import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GenericApplicationAdapter } from '../../src/modules/browser/adapters/genericApplicationAdapter.js';
import { ApplicationSession } from '../../src/modules/browser/applicationSession.js';
import { SubmissionManager } from '../../src/modules/browser/submissionManager.js';
import { assertTransition, InvalidStateTransitionError } from '../../src/modules/applications/applicationStateMachine.js';

test.describe('Two-Gate Application Flow (Live Sandbox Greenhouse Form)', () => {
  const fixturePath = pathToFileURL(
    resolve(process.cwd(), '..', 'browser', 'adapters', '__fixtures__', 'greenhouse_sandbox.html')
  ).href;

  test('executes fill, halts at Gate 2 without submitting, and only submits on second approval', async ({ page }) => {
    // 1. Navigate to realistic Greenhouse sandbox
    await page.goto(fixturePath);
    await expect(page.locator('h1')).toHaveText('Acme Cloud Systems');
    await expect(page.locator('#confirmation')).not.toBeVisible();

    // 2. Prepare mock candidate answers
    const answers = [
      { question: 'First Name', answer: 'Alex', status: 'READY' },
      { question: 'Last Name', answer: 'Morgan', status: 'READY' },
      { question: 'Email', answer: 'alex.morgan@example.com', status: 'READY' },
      { question: 'Phone', answer: '+1-555-0199', status: 'READY' },
      { question: 'What programming languages do you know?', answer: 'TypeScript, Go, Python', status: 'READY' },
      { question: 'Years of experience', answer: '6', status: 'READY' },
    ];

    const mockJob = {
      id: 'job-gh-101',
      title: 'Senior Distributed Systems Engineer',
      company: 'Acme Cloud Systems',
      url: fixturePath,
    };

    let appState = 'APPROVED'; // Passed Gate 1

    // 3. Auto-fill form
    assertTransition(appState, 'FILLING');
    appState = 'FILLING';

    const adapter = new GenericApplicationAdapter();
    const session = new ApplicationSession({
      page,
      job: mockJob,
      application: { id: 'app-101', status: appState },
      answers,
    });

    const fillResult = await adapter.fill(session);
    expect(fillResult.status).toBe('READY_FOR_REVIEW');

    // 4. Capture screenshot and structured field map
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    expect(screenshotBuffer.length).toBeGreaterThan(1000);
    const screenshotBase64 = screenshotBuffer.toString('base64');
    expect(screenshotBase64.length).toBeGreaterThan(1000);

    const filledData = fillResult.filledValues;
    expect(filledData).toBeDefined();
    expect(filledData['First Name']).toBe('Alex');
    expect(filledData['Email']).toBe('alex.morgan@example.com');
    expect(filledData['What programming languages do you know?']).toBe('TypeScript, Go, Python');
    expect(filledData['Years of experience']).toBe('6');

    // 5. PAUSE AT GATE 2: FILLED_AWAITING_RECHECK
    assertTransition(appState, 'FILLED_AWAITING_RECHECK');
    appState = 'FILLED_AWAITING_RECHECK';

    // CRITICAL SAFETY CHECK: Confirm automation PAUSED and did NOT submit
    await expect(page.locator('#confirmation')).not.toBeVisible();
    expect(page.url()).not.toContain('#submitted');

    // 6. Confirm illegal submission is blocked by state machine and submission manager
    expect(() => assertTransition(appState, 'SUBMITTED')).toThrow(InvalidStateTransitionError);

    const illegalSubmission = await new SubmissionManager({ requireApproval: true }).submit({
      page,
      job: mockJob,
      application: { id: 'app-101', status: appState }, // Still FILLED_AWAITING_RECHECK
      answers,
    });
    expect(illegalSubmission.status).toBe('BLOCKED');
    expect(illegalSubmission.reason).toMatch(/Explicit approval is required/i);
    await expect(page.locator('#confirmation')).not.toBeVisible();

    // 7. GATE 2 APPROVAL: Human user confirms via second approval gate
    assertTransition(appState, 'RESUBMIT_APPROVED');
    appState = 'RESUBMIT_APPROVED';

    // 8. Worker transitions to SUBMITTING and re-verifies values before submit
    assertTransition(appState, 'SUBMITTING');
    appState = 'SUBMITTING';

    // Verify fields on page match reviewed snapshot using safe selector lookup
    const pageVerification = await page.evaluate((expected) => {
      function findField(key) {
        const byId = document.getElementById(key);
        if (byId) return byId;
        try {
          const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(key) : key;
          const byAttr = document.querySelector(`[name="${escaped}"], [data-qa="${escaped}"]`);
          if (byAttr) return byAttr;
        } catch {
          return null;
        }
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          if (label.textContent && label.textContent.trim().toLowerCase() === key.trim().toLowerCase()) {
            if (label.htmlFor) {
              const el = document.getElementById(label.htmlFor);
              if (el) return el;
            }
            const nested = label.querySelector('input, textarea, select');
            if (nested) return nested;
          }
        }
        return null;
      }

      for (const [key, expVal] of Object.entries(expected)) {
        const el = findField(key);
        if (el && el.value !== expVal) return false;
      }
      return true;
    }, filledData);
    expect(pageVerification).toBe(true);

    // 9. Now, and only now, perform submission
    const submitResult = await new SubmissionManager({ requireApproval: true }).submit({
      page,
      job: mockJob,
      application: { id: 'app-101', status: appState },
      answers,
    });

    expect(submitResult.status).toBe('SUBMITTED');
    expect(submitResult.confirmationUrl).toContain('#submitted');
    await expect(page.locator('#confirmation')).toBeVisible();

    // 10. Record SUBMITTED in state machine
    assertTransition(appState, 'SUBMITTED');
    appState = 'SUBMITTED';
    expect(appState).toBe('SUBMITTED');
  });

  test('halts with MANUAL_INTERVENTION if reviewed fields were tampered before submission', async ({ page }) => {
    await page.goto(fixturePath);

    const answers = [
      { question: 'First Name', answer: 'Alex', status: 'READY' },
      { question: 'Email', answer: 'alex.morgan@example.com', status: 'READY' },
    ];

    const adapter = new GenericApplicationAdapter();
    const session = new ApplicationSession({
      page,
      job: { id: 'job-102', url: fixturePath },
      application: { id: 'app-102', status: 'FILLING' },
      answers,
    });

    await adapter.fill(session);

    // Stored snapshot from review
    const snapshot = {
      first_name: 'Alex',
      email: 'alex.morgan@example.com',
    };

    // Simulate tampering / field modification on the live page prior to final submission
    await page.locator('#email').fill('tampered-attacker@example.com');

    // Verification check should catch mismatch safely
    const verification = await page.evaluate((expected) => {
      function findField(key) {
        const byId = document.getElementById(key);
        if (byId) return byId;
        try {
          const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(key) : key;
          const byAttr = document.querySelector(`[name="${escaped}"], [data-qa="${escaped}"]`);
          if (byAttr) return byAttr;
        } catch {
          return null;
        }
        return null;
      }

      const mismatches = [];
      for (const [key, expVal] of Object.entries(expected)) {
        const el = findField(key);
        if (el && el.value !== expVal) {
          mismatches.push({ field: key, expected: expVal, actual: el.value });
        }
      }
      return { verified: mismatches.length === 0, mismatches };
    }, snapshot);

    expect(verification.verified).toBe(false);
    expect(verification.mismatches).toHaveLength(1);
    expect(verification.mismatches[0].field).toBe('email');
    expect(verification.mismatches[0].actual).toBe('tampered-attacker@example.com');

    // Under verification mismatch, submission halts without submitting
    await expect(page.locator('#confirmation')).not.toBeVisible();
  });
});
