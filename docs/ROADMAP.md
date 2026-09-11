# Delivery Roadmap

## Implemented Architecture & Milestone Status

- [x] **Phase 1: Workspace & Profile Contract**: Candidate YAML profile, master resume markdown, truth layer claim hashing, and schema validation.
- [x] **Phase 2: Ingestion & Deduplication**: Multi-signal deduplication (canonical URL, company/title/location normalization, SHA-256 content hash).
- [x] **Phase 3: Real Job Discovery**: Configurable source factory (`JOB_SOURCES=remotive,rss,sample`) supporting Remotive API, RSS feeds, and sample fallback without code changes.
- [x] **Phase 4: Deterministic Eligibility & LLM Matching**: Synchronous hard qualification filter, provider abstraction (OpenAI, Anthropic), structured JSON extraction with repair retries, and Gate 0 high match alerts.
- [x] **Phase 5: Truth-Checked Tailoring**: LLM resume tailoring with strict claim traceability verification against the master resume and candidate profile.
- [x] **Phase 6: Two-Gate Human Approval State Machine**:
  - **Gate 1**: `AWAITING_APPROVAL -> APPROVED` explicit human approval before browser automation starts.
  - **Auto-Fill & Pause**: `FILLING -> FILLED_AWAITING_RECHECK` captures Playwright screenshot and structured field map; strictly halts before submission.
  - **Gate 2**: `FILLED_AWAITING_RECHECK -> RESUBMIT_APPROVED` human recheck via UI (`/api/applications/:id/confirm-submit`).
  - **Pre-Submit Re-Verification**: Re-evaluates live form inputs against reviewed snapshot before clicking submit; halts on mismatch.
- [x] **Phase 7: Multi-Channel Human Notifications**:
  - Multi-channel notification dispatcher supporting SMTP Email and Webhooks (Slack, Discord, Telegram, or custom endpoints).
  - Notifications triggered at: Gate 0 (High Match), Gate 1 (Review Request), and Gate 2 (Recheck Required).
  - Notifications are informative only; approvals strictly require authenticated API/UI actions.
- [x] **Phase 8: Human Recheck UI**:
  - Full-resolution screenshot preview and modal zoom.
  - Structured field-to-value written table.
  - Action buttons for Gate 1 (Approve / Reject) and Gate 2 (Approve & Submit / Edit & Refill / Reject).
- [x] **Phase 9: Comprehensive Tests & Verification**:
  - Unit tests for eligibility, truth layer, state machine, and notifications.
  - Playwright integration tests against realistic ATS sandbox forms (Greenhouse/Lever) validating the pause at Gate 2 and tamper prevention.
  - Docker Compose multi-service architecture (API, Worker, Frontend, PostgreSQL, Redis).

## Production Operationalization

1. **Adapter Maturation**: Expand adapter coverage for custom enterprise ATS configurations while maintaining zero CAPTCHA/anti-bot bypass principles.
2. **Telemetry & Audit Dashboards**: Export structured audit events and approval logs to external compliance monitoring systems.
3. **Advanced Recheck Tools**: Interactive field editing directly on the visual screenshot overlay before triggering re-fill.
