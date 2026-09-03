# AGENTS.md

Project instructions for coding agents (Codex, Cursor, and others) working in this repository.

**The canonical, up-to-date instructions live in [CLAUDE.md](CLAUDE.md).** Read that file — it covers the project overview, quick commands, key files, the session subsystems, database, and architecture patterns. This file intentionally does not duplicate that content, so the two can't drift apart.

NOTE:
Do not write new markdown files when making code changes. Add only IMPORTANT changes to existing CHANGE_LOG.md files; other changes can be communicated through chat. The CHANGE_LOG.md is meant for AI coding assistants to prepend change logs for human developers to better keep track of.
Only update README.md when project structure, high-level architecture, or run commands change.
Only create new .md files when you are asked to.

## Quick start

```bash
# Backend  (FastAPI + SQLAlchemy on Railway, Neon PostgreSQL)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend-web  (React + TypeScript + Vite)
cd frontend-web && npm run dev

# Mobile  (React Native + Expo development client)
npm run mobile:start
```

AI providers are OpenAI (default), Claude, and Gemini, all behind `AIClientInterface`. For everything else, see [CLAUDE.md](CLAUDE.md).

For iOS work, read [IOS_MIGRATION.md](IOS_MIGRATION.md) for product direction and
current sequencing, then [frontend-mobile/README.md](frontend-mobile/README.md)
for implemented architecture and engineering rules. Keep work-in-progress notes
out of both documents.

## Development preference

- For browser sessions likely to consume substantial tokens through repeated visual inspection or interaction, finish automated checks first and give the user a concise manual test checklist. Let the user operate the browser and report results by default. Take over browser testing only when the user explicitly asks, when reproducing a UI issue requires agent control, or when automated/manual evidence is insufficient.
