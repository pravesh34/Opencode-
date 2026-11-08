# JobPilot AI

API-powered AI job discovery, application, and career agent (local-first, macOS-oriented).

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind
- **Backend**: FastAPI + SQLAlchemy + SQLite (PostgreSQL-compatible models)
- **Browser automation**: Playwright (Chromium)
- **AI**: External API providers only (Gemini/OpenAI/Anthropic/OpenAI-compatible). No local LLM inference.
- **Scheduler**: APScheduler background jobs

## Quick start (macOS)
```bash
cp .env.example .env
# add API keys in .env
./start.sh
```

- Frontend: http://127.0.0.1:5173
- Backend API/docs: http://127.0.0.1:8000/docs

## Safety defaults
- Browser submission requires explicit approval policy (`manual_review` default).
- Candidate facts are stored with source/confidence; the system does not invent experience/credentials.
- Provider keys are read from environment variables.

## What works in this build
- Candidate profile (editable defaults from prompt) with fact provenance fields
- AI provider abstraction + task routing config + health/cost tracking scaffolding
- Job discovery pipeline (ingest/manual/import + normalization + dedupe hooks + scoring)
- Match scoring with transparent breakdown
- Resume/answer generation service (API-driven when keys configured; safe fallback templates)
- Application CRM, status tracking, follow-up records
- Playwright browser automation service (session/profile/screenshot/log hooks) + form-mapping workflow
- Approval-gated application execution flow
- Dashboard UI for profile, jobs, matches, applications, settings, agent runs

## Notes
Some external job platforms require authenticated sessions, CAPTCHAs, or site-specific adapters. The system provides a modular adapter/agent framework; configure credentials and review each site's terms before automated submission.
