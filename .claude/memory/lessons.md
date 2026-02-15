# Musee — Lessons & Gotchas

## Streaming JSON Parsing
- SSE events are split by `\n\n`, each has `event:` and `data:` headers
- Frontend uses `response.body.getReader()` + `TextDecoder` — must handle partial chunks across reads
- Buffer incomplete data between reads; only process complete events (ending with `\n\n`)
- Handle escaped characters and incomplete JSON strings when parsing progressively

## Language Flow
- `localStorage musee_language` → `getLanguage()` in apiService → `language` FormData field → backend `prompt_loader` appends instruction
- Backend supports 12 languages; frontend currently offers EN and 中文
- **Gotcha**: Backend already had `language` param on all endpoints — always check existing code before adding

## Responsive Design
- Use Tailwind `p-3 sm:p-6` pattern consistently (mobile-first breakpoints)
- Test on both mobile and desktop viewports

## ExhibitionHall
- `initialMessage` prop pattern: pass message, auto-send on mount with `useRef` guard to prevent double-send in StrictMode
- Streaming responses use same SSE protocol as artwork analysis

## Backend Import Issues
- Router modules must be correctly exported in `routers/__init__.py` — caused AttributeError when missing
- Database schema changes need migration or recreation — Neon PostgreSQL in prod

## Image Handling
- Frontend downscales to 1600px max width before upload
- Base64 data URLs used for preview, server stores to Vercel Blob (prod) or local `/uploads` (dev)
- EXIF date parsing handles multiple formats: ISO, custom EXIF (`YYYY:MM:DD HH:MM:SS`), timestamps

## Auth & User Management
- Anonymous users get `web-[timestamp]-[random]` UUID
- On Google OAuth login, anonymous data migrates to authenticated account
- JWT stored in `musee_auth_token` localStorage key
- Token expiry: 30 minutes

## Streaming Endpoints & DB
- Streaming analysis endpoints currently do NOT save to database
- Non-streaming endpoints do persist to DB
- Can be added back if needed — noted in CLAUDE.md

## Prompt Editing
- Edit `.txt` files in `backend/app/prompts/` — no code changes needed
- Prompts are cached by `prompt_loader.py` — restart backend after changes
- Main analysis prompt outputs structured JSON: artist, title, date, medium, description, tags (max 5)

## Deployment
- Frontend: Vercel (auto-deploys from git)
- Backend: needs Neon PostgreSQL connection string in env
- Missing components in git caused Vercel build failures (commit 6260efc fixed this)
