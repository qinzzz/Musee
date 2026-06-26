# AGENTS.md

Project instructions for Codex when working with this repository.

NOTE:
Do not write new markdown files when making code changes. You should add only IMPORTANT changes to existing CHANGE_LOG.md files, other changes can be communicated through chat. The CHANGE_LOG.md is meant for AI coding assistants to prepend change logs for human developers to better keep track of.
Only if there are changes in project structure, high-level architecture, command to run the project, etc. then you update README.md.
Only create new .md files when you are asked to.

## Project Overview

Musee is a web app (React + Vite) with Python FastAPI backend for AI-powered artwork analysis.

**Frontend-web**: React + TypeScript + Vite (port 3000), deployed on Vercel
**Backend**: FastAPI + SQLAlchemy + Neon PostgreSQL (port 8000)
**AI providers**: OpenAI (default), Codex, Gemini — all behind AIClientInterface

See [README.md](README.md) for complete documentation.

## Quick Commands

### Backend
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend-web
```bash
cd frontend-web
npm run dev                   # Vite dev server (port 3000)
```

## Key Files

**Frontend-web**:
- `App.tsx` — Main entry: corridor/topography views, gallery state, OAuth, settings panel
- `api/*.ts` — Shared frontend API modules for analysis, artworks, collections, chat, and auth-adjacent helpers
- `session/api/sessions.ts` — Session-specific frontend API calls
- `components/InterpretationModal.tsx` — Full artwork interpretation + chat
- `components/ExhibitionHall.tsx` — Curator conversation (multi-artwork context)
- `components/GalleryCard.tsx` — Individual artwork card
- `types.ts` — TypeScript interfaces

**Backend**:
- `app/main.py` — FastAPI app entry
- `app/routers/artwork.py` — Analysis/chat endpoints (streaming & non-streaming)
- `app/services/ai_service.py` — AI orchestration, prompt loading, language support
- `app/services/*_client.py` — AI provider implementations (OpenAI, Codex, Gemini)
- `app/database/models.py` — User, SavedArtwork, Conversation, Tag, Session, Collection
- `app/config/settings.py` — Env-based config, API keys, DB URLs
- `app/prompts/*.txt` — Editable prompts (no code changes needed)

## Important Notes

### Code Style
- **No hardcoded strings**: Use constants
- **Type safety**: Full TypeScript on frontend
- **File-based prompts**: Edit `.txt` files in `backend/app/prompts/`
- **Clean separation**: AI services follow interface pattern
- **Check existing code first**: Before adding params or features, verify they don't already exist

### Streaming vs Non-Streaming
- `*-stream` endpoints — **SSE streaming** (chunk → complete → metrics events)
- Non-stream endpoints — **Complete JSON response**, persisted to DB
- Streaming endpoints currently do NOT save to DB (can be added back if needed)

### Database
Neon PostgreSQL (dev/prod URLs in settings). Models: User, SavedArtwork, Conversation, Tag, Session, Collection.

## Development Tips

- Frontend hot reload: Just save files (Vite HMR)
- Backend hot reload: Uses `--reload` flag
- Edit prompts: Modify `.txt` files, restart backend (cached by prompt_loader)
- API docs: Visit `http://localhost:8000/docs`
- Test API: See README.md for curl examples

## Architecture Pattern

```python
# AI Service Interface Pattern
class AIServiceInterface(ABC):
    async def analyze_artwork(...) -> AsyncGenerator[str, None]
    async def identify_artist(...) -> str

# Implementations: OpenAIClient, ClaudeClient, GeminiClient
```

Prompts loaded from files via `utils/prompt_loader.py` with caching.

## Memory Files

Accumulated project knowledge and session history live in `.Codex/memory/`:
- [project.md](.Codex/memory/project.md) — Full architecture, component inventory, DB models, SSE protocol
- [lessons.md](.Codex/memory/lessons.md) — Gotchas, fixes, patterns learned across sessions
- [sessions.md](.Codex/memory/sessions.md) — Rolling log of recent sessions

Consult these before making changes to understand existing patterns and avoid known pitfalls.
