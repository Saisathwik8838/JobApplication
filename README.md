# AI-Powered Job Application Agent

A safety-first JavaScript platform that turns job discovery into an approval-gated application pipeline: discover real jobs, deduplicate, check hard eligibility, rank/match, prepare truthful material, review at **Gate 1**, auto-fill the form, pause for human recheck at **Gate 2**, and submit safely only upon second approval.

## The Safety and Truth Model

This is deliberately **not an auto-apply bot**.
- **Two Human Approval Gates**:
  1. **Gate 1 (Pre-Fill)**: Reviews tailored resume and truthful answers before any browser automation opens or touches the application form.
  2. **Gate 2 (Post-Fill Recheck)**: After the browser fills the form, automation **pauses**. It captures a full screenshot and structured field-to-value map for user recheck. No submission occurs without explicit second approval.
- **Pre-Submit Tamper Verification**: Prior to clicking submit, the worker re-inspects live form values against the reviewed snapshot. If any field was modified or differs, it halts in `MANUAL_INTERVENTION` rather than submitting blindly.
- **Zero Anti-Bot Bypass**: Never bypasses CAPTCHA, authentication, rate limits, or anti-bot protections. Halts safely with `MANUAL_INTERVENTION`.
- **Truth Layer Integrity**: `profile/candidate_profile.yaml` and `profile/resume/master_resume.md` are the sole fact sources. Every generated claim is cryptographically source-verified against these sources.
- **Mandatory Approvals**: `REQUIRE_APPROVAL=true` is strictly enforced at all times.

## Two-Gate Workflow

```
[Job Sources (Remotive / RSS / API)]
                ↓
    [Deduplication & Eligibility]
                ↓
        [LLM Matcher] ──(Match >= 80%)──> [Gate 0 Notification: High Match]
                ↓
  [Truth-Checked Application Prep]
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

## Multi-Channel Notifications

Notifications alert the candidate at every action gate:
- **Gate 0**: High-match job discovered.
- **Gate 1**: Application prepared and awaiting pre-fill approval.
- **Gate 2**: Application form filled and paused awaiting recheck.

Channels are configurable via `NOTIFICATION_CHANNELS` (`email` via SMTP and `webhook` supporting Slack, Discord, Telegram, or custom webhooks). Approval is **never** executed via notification—always via authenticated API.

## Testing & Verification

- **Unit Tests**: `npm run test:unit -w backend` (state machine transitions, eligibility engine, truth layer, notification dispatcher).
- **E2E Playwright Tests**: `npm run test:e2e -w backend` (tests the full two-gate workflow against a realistic Greenhouse ATS sandbox).
- **LLM Matcher Evaluation**: `npm run eval` (verifies eligibility and match accuracy).
