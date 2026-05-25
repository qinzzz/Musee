# Operator Context

Musee is an AI-powered art curation app: React/Vite web frontend (port 3000, Vercel), FastAPI backend (port 8000), React Native iOS app. CLAUDE.md has full build commands, key files, and conventions.

## Focus
Active development on the web client and backend. Do not touch `frontend/` (React Native iOS) without asking first.

## Approval
Escalate anything that could break existing functionality — API contract changes, DB schema changes, auth flow modifications, prompt rewrites.

## Communication
Be concise. Short updates, get to the point. Don't over-explain.

## Testing
No automated test framework. Test manually as needed. TypeScript type-check (`npx tsc --noEmit`) when touching shared types.

## Stack
- Web: React 19 + TypeScript + Vite; no test runner
- Backend: FastAPI + SQLAlchemy + Neon PostgreSQL; OpenAI (default), Claude, Gemini behind `AIClientInterface`
- Infra: Vercel for web; no CI/CD pipelines

## Notes
- AI provider keys in `.env.*` — don't commit secrets
- Prompts in `backend/app/prompts/*.txt` — edit there, restart backend
- Streaming endpoints (SSE) do NOT persist to DB; non-streaming ones do
- Recent work: LEARN sub-tabs, image compression, migrating some features off Gemini
