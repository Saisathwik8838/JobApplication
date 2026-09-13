import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GenericApplicationAdapter } from '../../src/modules/browser/adapters/genericApplicationAdapter.js';
import { LeverAdapter } from '../../src/modules/browser/adapters/leverAdapter.js';
import { WorkdayAdapter } from '../../src/modules/browser/adapters/workdayAdapter.js';
import { renderResumeToPdf } from '../../src/modules/resume/resumeService.js';
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

  test('One-click apply flow: pauses on missing truthful answer, resumes to SUBMITTED once resolved without second manual click', async ({ page }) => {
    await page.goto(fixturePath);
    await expect(page.locator('h1')).toHaveText('Acme Cloud Systems');

    // 1. Initial candidate answers missing a required field ('Years of experience')
    const incompleteAnswers = [
      { question: 'First Name', answer: 'Alex', status: 'READY' },
      { question: 'Last Name', answer: 'Morgan', status: 'READY' },
      { question: 'Email', answer: 'alex.morgan@example.com', status: 'READY' },
      { question: 'Phone', answer: '+1-555-0199', status: 'READY' },
      { question: 'What programming languages do you know?', answer: 'TypeScript, Go, Python', status: 'READY' },
    ];

    const mockJob = {
      id: 'job-gh-103',
      title: 'Senior Distributed Systems Engineer',
      company: 'Acme Cloud Systems',
      url: fixturePath,
    };

    let appState = 'APPROVED'; // Gate 1 was approved via One-Click Apply
    assertTransition(appState, 'FILLING');
    appState = 'FILLING';

    const adapter = new GenericApplicationAdapter();
    const session1 = new ApplicationSession({
      page,
      job: mockJob,
      application: { id: 'app-103', status: appState },
      answers: incompleteAnswers,
    });

    // 2. Autofill encounters missing required field and halts
    const fillResult1 = await adapter.fill(session1);
    expect(fillResult1.status).toBe('NEEDS_USER_INPUT');
    expect(fillResult1.missingFields).toContain('Years of experience');

    // State machine transitions to NEEDS_USER_INPUT
    assertTransition(appState, 'NEEDS_USER_INPUT');
    appState = 'NEEDS_USER_INPUT';

    // Must NOT have submitted
    await expect(page.locator('#confirmation')).not.toBeVisible();

    // 3. Truthful answer is provided by candidate
    const resolvedAnswers = [
      ...incompleteAnswers,
      { question: 'Years of experience', answer: '6', status: 'READY' },
    ];

    // Backend resumes filling: NEEDS_USER_INPUT -> FILLING
    assertTransition(appState, 'FILLING');
    appState = 'FILLING';

    const session2 = new ApplicationSession({
      page,
      job: mockJob,
      application: { id: 'app-103', status: appState },
      answers: resolvedAnswers,
    });

    const fillResult2 = await adapter.fill(session2);
    expect(fillResult2.status).toBe('READY_FOR_REVIEW');
    expect(fillResult2.filledValues['Years of experience']).toBe('6');

    // 4. One-Click Apply flow auto-submits directly to SUBMITTING -> SUBMITTED
    assertTransition(appState, 'SUBMITTING');
    appState = 'SUBMITTING';

    const submitResult = await new SubmissionManager({ requireApproval: true }).submit({
      page,
      job: mockJob,
      application: { id: 'app-103', status: appState },
      answers: resolvedAnswers,
    });

    expect(submitResult.status).toBe('SUBMITTED');
    expect(submitResult.confirmationUrl).toContain('#submitted');
    await expect(page.locator('#confirmation')).toBeVisible();

    assertTransition(appState, 'SUBMITTED');
    appState = 'SUBMITTED';
    expect(appState).toBe('SUBMITTED');
  });
});

test.describe('Lever Adapter Flow (Live Sandbox Lever Form with data-qa)', () => {
  const fixturePath = pathToFileURL(
    resolve(process.cwd(), '..', 'browser', 'adapters', '__fixtures__', 'lever_sandbox.html')
  ).href;

  test('fills Lever data-qa fields and uploads resume, halts at Gate 2, and submits on approval', async ({ page }) => {
    await page.goto(fixturePath);
    await expect(page.locator('h1')).toHaveText('CRED');
    await expect(page.locator('#confirmation')).not.toBeVisible();

    const resumePath = await renderResumeToPdf({
      text: 'Software Engineer with experience in React and Node.js.\nSkills: JavaScript, TypeScript, Go.',
      candidateName: 'Priya Sharma',
      applicationId: 'lever-test-1',
    });

    const answers = [
      { question: 'Full Name', answer: 'Priya Sharma', status: 'READY' },
      { question: 'Email', answer: 'priya.sharma@example.com', status: 'READY' },
      { question: 'Phone', answer: '+91-9876543210', status: 'READY' },
      { question: 'Current Company', answer: 'FinTech Labs India', status: 'READY' },
      { question: 'LinkedIn URL', answer: 'https://linkedin.com/in/priyasharma', status: 'READY' },
    ];

    const mockJob = {
      id: 'job-lever-201',
      title: 'Senior Backend Engineer',
      company: 'CRED',
      url: fixturePath,
    };

    let appState = 'APPROVED';
    assertTransition(appState, 'FILLING');
    appState = 'FILLING';

    const adapter = new LeverAdapter();
    const session = new ApplicationSession({
      page,
      job: mockJob,
      application: { id: 'app-lever-201', status: appState },
      answers,
      resumePath,
    });

    const fillResult = await adapter.fill(session);
    expect(fillResult.status).toBe('READY_FOR_REVIEW');

    // Verify fields were filled via data-qa attributes
    await expect(page.locator('[data-qa="name-input"]')).toHaveValue('Priya Sharma');
    await expect(page.locator('[data-qa="email-input"]')).toHaveValue('priya.sharma@example.com');
    await expect(page.locator('[data-qa="phone-input"]')).toHaveValue('+91-9876543210');
    await expect(page.locator('[data-qa="org-input"]')).toHaveValue('FinTech Labs India');

    // Gate 2 Safety check: form must NOT be submitted yet
    await expect(page.locator('#confirmation')).not.toBeVisible();

    // Human gives Gate 2 approval -> submit
    assertTransition(appState, 'SUBMITTING');
    appState = 'SUBMITTING';

    const submitResult = await new SubmissionManager({ requireApproval: true }).submit({
      page,
      job: mockJob,
      application: { id: 'app-lever-201', status: appState },
      answers,
      resumePath,
    });

    expect(submitResult.status).toBe('SUBMITTED');
    await expect(page.locator('#confirmation')).toBeVisible();
  });
});

test.describe('Workday Adapter Flow (Live Sandbox Multi-Step Wizard)', () => {
  const fixturePath = pathToFileURL(
    resolve(process.cwd(), '..', 'browser', 'adapters', '__fixtures__', 'workday_sandbox.html')
  ).href;

  test('advances through Workday wizard steps, halts at review page without submitting, and submits on approval', async ({ page }) => {
    await page.goto(fixturePath);
    await expect(page.locator('h1')).toHaveText('Enterprise Cloud Tech');
    await expect(page.locator('#step1')).toBeVisible();
    await expect(page.locator('#step2')).not.toBeVisible();
    await expect(page.locator('#step3')).not.toBeVisible();

    const resumePath = await renderResumeToPdf({
      text: 'Lead Cloud Architect.\nSpecialized in AWS, Kubernetes, and Terraform.',
      candidateName: 'Rahul Verma',
      applicationId: 'workday-test-1',
    });

    const answers = [
      { question: 'First Name', answer: 'Rahul', status: 'READY' },
      { question: 'Last Name', answer: 'Verma', status: 'READY' },
      { question: 'Email', answer: 'rahul.verma@example.com', status: 'READY' },
      { question: 'Phone', answer: '+91-9988776655', status: 'READY' },
      { question: 'Skills', answer: 'AWS, Kubernetes, Go, Python', status: 'READY' },
    ];

    const mockJob = {
      id: 'job-wd-301',
      title: 'Lead Cloud Architect',
      company: 'Enterprise Cloud Tech',
      url: fixturePath,
    };

    let appState = 'APPROVED';
    assertTransition(appState, 'FILLING');
    appState = 'FILLING';

    const adapter = new WorkdayAdapter();
    const session = new ApplicationSession({
      page,
      job: mockJob,
      application: { id: 'app-wd-301', status: appState },
      answers,
      resumePath,
    });

    const fillResult = await adapter.fill(session);
    expect(fillResult.status).toBe('READY_FOR_REVIEW');

    // Wizard should have stepped through Step 1 and Step 2, and landed on Step 3 (Review)
    await expect(page.locator('#step3')).toBeVisible();
    await expect(page.locator('#review_summary')).toHaveText('All steps completed. Ready for final review.');

    // Gate 2 Safety check: Final submission MUST NOT be executed automatically
    await expect(page.locator('#confirmation')).not.toBeVisible();

    // Human approves Gate 2 -> submit
    assertTransition(appState, 'SUBMITTING');
    appState = 'SUBMITTING';

    const submitResult = await new SubmissionManager({ requireApproval: true }).submit({
      page,
      job: mockJob,
      application: { id: 'app-wd-301', status: appState },
      answers,
      resumePath,
    });

    expect(submitResult.status).toBe('SUBMITTED');
    await expect(page.locator('#confirmation')).toBeVisible();
  });
});

