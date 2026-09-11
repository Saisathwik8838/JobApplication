# AI-Powered Job Application Agent

A safety-first JavaScript platform that turns job discovery into an approval-gated application pipeline: discover, deduplicate, check hard eligibility, rank, prepare truthful material, review, approve, and submit through a conservative browser worker.

## The safety and truth model

This is deliberately not an auto-apply bot. It never bypasses CAPTCHA, authentication, rate limits, anti-bot controls, or site restrictions. It stops for unknown mandatory answers, sensitive questions, unexpected forms, login, or CAPTCHA. It never submits without explicit approval.

`profile/candidate_profile.yaml` and `profile/resume/master_resume.md` are the only candidate fact sources. The truth layer rejects generated output without source references that exactly occur in those sources. Treat the supplied profile as a sample and replace it with accurate information before running anything.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the Mermaid diagram, data flow, database, AI, security, browser, and deployment design. The stack is Node/Express, React/Vite, Zod, Prisma/PostgreSQL, Redis/BullMQ, Playwright, Pino, Docker Compose, and GitHub Actions.

## Setup

1. Copy `.env.example` to `.env.local`, retain `REQUIRE_APPROVAL=true`, and supply database/Redis/notification values. Set `LLM_PROVIDER`/`LLM_MODEL`; use `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for the selected provider.
2. Replace the sample candidate YAML and master resume with truthful data only.
3. Ensure Docker Desktop is running, then start infrastructure: `docker compose up -d postgres redis`.
4. Generate and migrate: `npm run prisma:generate -w @job-agent/backend` then `npm run prisma:migrate -w @job-agent/backend`.
5. Start locally with `npm run dev`, or all services with `docker compose up -d --build`.

The frontend is at `http://localhost:5173`; API health is at `http://localhost:3000/health`.

## API and workflow

The UI calls `GET /api/dashboard`, job/application endpoints, profile, discovery, and automation run endpoints. Jobs enter through public sources (the initial source is Remotive’s public API) or `POST /api/jobs`; four dedupe signals eliminate repetition. Eligibility is pure and runs before AI matching. Matches cache on job-description and profile hashes. Prepared content is source-validated, then moves through `APPLICATION_PREPARED → AWAITING_APPROVAL → APPROVED → SUBMITTING → SUBMITTED`. Illegal transitions throw a domain error and every transition has an event.

Browser automation runs only in a BullMQ worker. The shared Docker image installs Playwright Chromium for that worker. Greenhouse, Lever, Workday, and generic adapters report partial support; local fixture tests prove filling and manual-intervention behavior, not compatibility with every live form.

## Test and evaluate

Run `npm test`, `npm run test:e2e -w @job-agent/backend`, and `npm run eval`. Run `npx playwright install` once before browser tests. Evaluation details are in [docs/EVALUATION.md](docs/EVALUATION.md).

## Limitations and roadmap

Site terms vary and adapters must be reviewed before enabling them. The generic adapter intentionally does not guess fields. Human review remains required. Email needs SMTP configuration; notifications otherwise log a safe warning. Matching quality needs a reviewed labeled evaluation set before tuning. See [docs/ROADMAP.md](docs/ROADMAP.md).

Dashboard screenshots are intentionally represented by the runnable local UI rather than fabricated images.
