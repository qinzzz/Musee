# Deployment Guide

## Architecture

```
Frontend (Vercel)  →  Backend (Railway)  →  Database (Neon PostgreSQL)
musee-web              musee-backend          holy-shape-61879548
```

## Services

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel (`musee-web`) | https://musee-web.vercel.app |
| Backend | Railway (`musee-backend`) | Project: `55fc7d9e-bfa1-4f91-b384-480bceff6ac3` |
| Database | Neon PostgreSQL | Project: `holy-shape-61879548`, dev/prod branch split |

## Frontend — Vercel

**Project**: `musee-web` (https://vercel.com/qzone/musee-web/deployments)

- Framework: Vite
- Root directory: `frontend-web/`
- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrites configured in `frontend-web/vercel.json`

**Environment Variables** (Vercel dashboard):
```
VITE_API_BASE_URL=<railway backend URL>
```

## Backend — Railway

**Project**: `musee-backend` (https://railway.com/project/55fc7d9e-bfa1-4f91-b384-480bceff6ac3)

- Runtime: Python (FastAPI + Uvicorn)
- Root directory: `backend/`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

**Environment Variables** (Railway dashboard):

Required:
```
ENV=prod
PORT=8000

# Database (Neon prod branch)
NEON_DATABASE_URL_PROD=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# AI API keys (at least one required)
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Auth
GOOGLE_CLIENT_ID=...
SECRET_KEY=<random-secret-for-jwt>

# Image storage
STORAGE_TYPE=vercel_blob
BLOB_READ_WRITE_TOKEN=vercel_...
```

Optional:
```
AI_PROVIDER=openai                # Default AI provider
AI_MODEL_OVERRIDE=                # Force specific provider
OPENAI_REASONING_EFFORT=          # low/medium/high
PHOTOROOM_API_KEY=                # Background removal
ACCESS_TOKEN_EXPIRE_MINUTES=30    # JWT expiry
AI_TIMEOUT=115                    # Seconds before AI call timeout
```

## Database — Neon PostgreSQL

**Project**: `holy-shape-61879548` (https://console.neon.tech/app/projects/holy-shape-61879548)

Branch split:
- **dev** branch → used for local development (`NEON_DATABASE_URL_DEV`)
- **prod** branch → used by Railway production (`NEON_DATABASE_URL_PROD`)

The backend selects the database URL based on the `ENV` variable:
- `ENV=dev` → uses `NEON_DATABASE_URL_DEV`
- `ENV=prod` → uses `NEON_DATABASE_URL_PROD`
- Fallback: `NEON_DATABASE_URL` (if env-specific not set)

Tables are auto-created by SQLAlchemy on startup (`Base.metadata.create_all`).

## Local Development

### `.env.development.local` (project root)
```
ENV=dev
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
GOOGLE_CLIENT_ID=...
NEON_DATABASE_URL_DEV=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
STORAGE_TYPE=local
SECRET_KEY=dev-secret
```

### Running locally
```bash
# Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend-web
npm run dev
```

Frontend dev server runs on port 3000, proxied to backend at localhost:8000.

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENV` | No | `dev` | `dev` or `prod` |
| `OPENAI_API_KEY` | Yes* | - | OpenAI API key |
| `CLAUDE_API_KEY` | Yes* | - | Anthropic API key |
| `GEMINI_API_KEY` | Yes* | - | Google Gemini API key |
| `AI_PROVIDER` | No | `openai` | Default AI provider |
| `AI_MODEL_OVERRIDE` | No | - | Force specific provider |
| `NEON_DATABASE_URL` | No | - | Fallback DB URL |
| `NEON_DATABASE_URL_DEV` | No | - | Dev branch DB URL |
| `NEON_DATABASE_URL_PROD` | No | - | Prod branch DB URL |
| `GOOGLE_CLIENT_ID` | No | - | Google OAuth client ID |
| `SECRET_KEY` | Yes | (insecure default) | JWT signing secret |
| `STORAGE_TYPE` | No | `local` | `local` or `vercel_blob` |
| `BLOB_READ_WRITE_TOKEN` | No | - | Vercel Blob token (if `vercel_blob`) |
| `PHOTOROOM_API_KEY` | No | - | PhotoRoom background removal |
| `AI_TIMEOUT` | No | `115` | AI call timeout in seconds |
| `DEBUG` | No | `true` | Debug mode |

*At least one AI API key required.
