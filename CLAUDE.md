# CLAUDE.md

Project instructions for Claude Code when working with this repository.

NOTE:
Do not write new markdown files when making code changes. You should add only IMPORTANT changes to existing CHANGE_LOG.md files, other changes can be communicated through chat. The CHANGE_LOG.md is meant for AI coding assistants to prepend change logs for human developers to better keep track of.
Only if there are changes in project structure, high-level architecture, command to run the project, etc. then you update README.md.
Only create new .Md files when you are asked to.

## Project Overview

Musee is a React Native iOS app with Python FastAPI backend for AI-powered artwork analysis.

**Frontend**: React Native 0.81.4 + TypeScript
**Backend**: FastAPI + SQLAlchemy + OpenAI/Claude/Gemini

See [README.md](README.md) for complete documentation.

## Quick Commands

### Backend
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm start                     # Metro bundler
npm run ios                   # Physical device
npm run ios:sim               # iPhone 16 Pro simulator
npm test                      # Jest tests
npm run lint                  # ESLint
cd ios && pod install         # Update CocoaPods (after adding dependencies)
```

## Key Files

**Backend**:
- `app/main.py` - FastAPI app entry
- `app/routers/artwork.py` - Analysis endpoints
- `app/services/*_client.py` - AI service implementations
- `app/prompts/*.txt` - Editable prompts (no code changes needed)

**Frontend**:
- `App.tsx` - Main navigation
- `src/screens/*.tsx` - Screen components
- `src/constants/api.ts` - **API URL configuration** (update with Mac IP)

## Important Notes

### Network Configuration
Frontend must use Mac's IP address for physical device testing:
```typescript
// src/constants/api.ts
export const API_BASE_URL = 'http://YOUR_MAC_IP:8000';
```

Get IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`

### Code Style
- **No hardcoded strings**: Use constants
- **Type safety**: Full TypeScript on frontend
- **File-based prompts**: Edit `.txt` files in `backend/app/prompts/`
- **Clean separation**: AI services follow interface pattern

### Streaming vs Non-Streaming
- `/api/analyze` - **Streams** artwork analysis (better UX for long text)
- `/api/analyze-artist` - **Complete response** (easier parsing for structured data)

### Database
SQLite at `backend/musee.db` stores analysis history. **Note**: Streaming endpoints currently don't save to DB (can be added back if needed).

## Development Tips

- Frontend hot reload: Just save files
- Backend hot reload: Uses `--reload` flag
- Edit prompts: Modify `.txt` files, restart backend
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
