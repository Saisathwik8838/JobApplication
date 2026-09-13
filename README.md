# AI-Powered Job Application Agent (India & Global ATS Edition)

A safety-first JavaScript platform that turns job discovery into an approval-gated application pipeline: discover real jobs, deduplicate, check hard eligibility, rank/match, prepare truthful material, review at **Gate 1**, auto-fill the live application form, pause for human recheck at **Gate 2**, and submit safely only upon second approval.

## The Safety and Truth Model

This is deliberately **not an auto-apply bot**.
- **Two Human Approval Gates**:
  1. **Gate 1 (Pre-Fill)**: Reviews tailored resume and truthful answers before any browser automation opens or touches the application form.
  2. **Gate 2 (Post-Fill Recheck)**: After the browser fills the form, automation **pauses**. It captures a full screenshot and structured field-to-value map for user recheck. No submission occurs without explicit second approval.
- **Pre-Submit Tamper Verification**: Prior to clicking submit, the worker re-inspects live form values against the reviewed snapshot. If any field was modified or differs, it halts in `MANUAL_INTERVENTION` rather than submitting blindly.
- **Zero Anti-Bot Bypass**: Never bypasses CAPTCHA, authentication, rate limits, or anti-bot protections. Halts safely with `MANUAL_INTERVENTION`.
- **Truth Layer Integrity**: `profile/candidate_profile.yaml` and `profile/resume/master_resume.md` are the sole fact sources. Every generated claim is cryptographically source-verified against these sources.
- **Mandatory Approvals**: `REQUIRE_APPROVAL=true` is strictly enforced at all times.

---

## India Job Market Scope & Source Architecture

Configured specifically for Indian tech seekers and legitimate public job APIs:

### 1. Active Job Discovery Sources
- **Adzuna India (`adzuna`)**: Real-time listings filtered with `country=in`, covering major Indian tech hubs (Bengaluru, Hyderabad, Pune, Mumbai, Delhi-NCR, Chennai) with ₹ currency parsing.
- **National Career Service (`ncs`)**: Government of India job portal via `data.gov.in` API with graceful fallback when unconfigured.
- **Company Career Boards (`company-career`)**: Direct public API boards for Indian tech companies running Greenhouse (`boards-api.greenhouse.io/v1/boards/{token}/jobs`) or Lever (`api.lever.co/v0/postings/{token}`). Pre-configured with top Indian engineering teams (Razorpay, Postman, CRED).
- **Developer Tech Sources (`arbeitnow`, `remotive`)**: Global and India-remote engineering roles with exponential-backoff retry and ₹ salary formatting.

### 2. Excluded Job Portals (Strictly Out of Scope)
> [!IMPORTANT]
> **Naukri, Foundit, Indeed, Shine, TimesJobs, and Apna are strictly OUT OF SCOPE.**
> All six portals prohibit automated scraping and bot access in their published Terms of Service, run commercial anti-bot defenses (e.g. Naukri runs Akamai Bot Manager), and do not provide public job APIs.
> 
> This agent adheres to ethical automation and terms of service:
> - **No scraping workarounds** or bot-detection evasion.
> - **No session/cookie spoofing**.
> - If browser automation lands on any site presenting CAPTCHA or bot challenges, it halts cleanly into `MANUAL_INTERVENTION` for human hand-off.

### 3. Location Normalization & ₹ Currency
- **Location Normalization**: Built-in canonical mapping for Indian metropolitan areas (e.g., `Bangalore` -> `Bengaluru`, `Bombay` -> `Mumbai`, `Gurgaon` -> `Gurugram`, `Calcutta` -> `Kolkata`, `Madras` -> `Chennai`).
- **Currency Formatting**: Formats salaries in Indian Rupee (₹) with `en-IN` numbering conventions (e.g. ₹12,00,000 / ₹35,00,000).

---

## Supported ATS Adapters & Browser Automation

Playwright browser automation drives standard ATS workflows while preserving Gate 2 pauses:

1. **Greenhouse (`greenhouseAdapter.js`)**:
   - Matches standard fields (`first_name`, `last_name`, `email`, `phone`).
   - Dynamic array fields: handles "Add another" inputs (e.g., websites, previous employers).
   - Resume dropzone: auto-uploads tailored PDF resume generated on disk.
2. **Lever (`leverAdapter.js`)**:
   - `data-qa` attribute-based selector resolution (`name`, `email`, `phone`, `org`, `urls[LinkedIn]`, `comments`).
   - Targets `input[type="file"][data-qa="resume-upload-input"]` for resume attachment.
3. **Workday (`workdayAdapter.js`)**:
   - Multi-step wizard navigation with visible step detection (`My Information`, `My Experience`, `Review`).
   - Advances using "Save and Continue" / "Next" buttons.
   - **Gate 2 Guarantee**: Halts at the Review step without clicking submit, capturing screenshot and state for human review.
   - Resilience: Halts to `MANUAL_INTERVENTION` after max 2 unrecognized wizard steps.
4. **Resume PDF Rendering (`pdfRenderer.js`)**:
   - Generates valid standard PDF 1.4 files from tailored candidate resume markdown.
   - Stores locally in `storage/resumes/resume-{applicationId}.pdf` and attaches cleanly to file inputs.

---

## Source Resilience & Dashboard Health

- **Exponential Backoff (`httpRetry.js`)**: Retries transient network failures and 5xx/429 responses up to 3 times with exponential jitter.
- **Source Isolation**: When a source encounters a 429 rate limit or network error, it is recorded in the `SourceHealth` table without impacting other active sources.
- **Pipeline Dashboard**: Surfaces real-time source health badges (`HEALTHY`, `RATE_LIMITED`, `ERROR`), discovery timestamps, and an on-demand **Run discovery now** action.

---

## Two-Gate Workflow

```
[Job Sources (Adzuna IN / NCS / Company Boards / Arbeitnow)]
                ↓
    [Deduplication & Eligibility]
                ↓
        [LLM Matcher] ──(Match >= 75%)──> [Gate 0 Notification: High Match]
                ↓
  [Truth-Checked Application Prep]
  [Tailored PDF Resume Generated]
                ↓
[AWAITING_APPROVAL (Gate 1)] ────────────> [Gate 1 Notification: Review Request]
                ↓  (User approves via API/UI)
        [Browser: FILLING]
                ↓  (Form filled, screenshot captured, fields recorded)
[FILLED_AWAITING_RECHECK (Gate 2)] ──────> [Gate 2 Notification: Recheck Required]
                ↓  (User inspects screenshot & field table)
[RESUBMIT_APPROVED (Second Approval)]
                ↓
    [Re-verify Fields Match Snapshot]
        ├── Mismatch ──> [MANUAL_INTERVENTION]
        └── Match
                ↓
       [Worker: SUBMITTING]
                ↓
          [SUBMITTED]
```

---

## Setup & Running

1. **Environment Configuration**:
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Configure your LLM provider (`OPENAI` or `ANTHROPIC`), API keys, and notification channels (`NOTIFICATION_CHANNELS=email,webhook`).
2. **Start Infrastructure**:
   ```bash
   docker compose up -d postgres redis
   ```
3. **Database Migration**:
   ```bash
   npm run prisma:generate -w @job-agent/backend
   npm run prisma:migrate -w @job-agent/backend
   ```
4. **Run All Services**:
   - In development mode: `npm run dev`
   - Or fully via Docker: `docker compose up -d --build`

Access the UI at `http://localhost:5173`. Health check is at `http://localhost:3000/health`.

---

## Testing & Verification

- **Unit & Integration Tests**: `npm test -w backend` (98 tests across localization, NCS, company sources, HTTP retry, eligibility, truth layer, source health).
- **E2E Playwright Browser Tests**: `npm run test:e2e -w backend` (7 browser tests: Greenhouse, Lever data-qa, Workday multi-step wizard, CAPTCHA halts, tamper verification).
- **Frontend Component Tests**: `npm test -w @job-agent/frontend` (20 tests covering filters, dashboard, approvals, inline truth answering).
- **Frontend Production Build**: `npm run build -w @job-agent/frontend` (Vite production bundle verification).

