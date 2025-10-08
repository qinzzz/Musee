# Vercel Deployment Guide

## Problem: SQLite Not Supported on Vercel

**Error**: `sqlite3.OperationalError: unable to open database file`

**Cause**: Vercel uses serverless functions with read-only filesystem. SQLite needs writable storage.

**Solution**: Disable database for Vercel deployment.

## Quick Deploy to Vercel

### 1. Set Environment Variable

In Vercel dashboard, add:
```
USE_DATABASE=false
```

This disables database features (collection endpoints) but keeps analysis endpoints working.

### 2. Add AI API Keys

Required (at least one):
```
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
```

### 3. Deploy

```bash
vercel deploy
```

## What Works Without Database

✅ **Working Endpoints**:
- `/api/analyze` - Streaming artwork analysis
- `/api/analyze-artist` - Artist identification
- `/api/providers` - Available AI providers
- `/health` - Health check

❌ **Disabled Endpoints** (require database):
- `/api/collection` - View saved analyses
- `/api/collection/stats` - Statistics
- `/api/collection/search` - Search
- `/api/analysis/{id}` - Get/delete specific analysis

## Database Options for Production

### Option 1: PostgreSQL (Recommended)

**Vercel Postgres**:
```bash
# Install Vercel Postgres
vercel postgres create

# Add to environment
DATABASE_URL=postgres://...
USE_DATABASE=true
```

**Supabase** (free tier):
```
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
USE_DATABASE=true
```

**Neon** (serverless Postgres):
```
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname
USE_DATABASE=true
```

### Option 2: Disable Collection Features

Keep `USE_DATABASE=false` - app works without history/collection.

## Environment Variables Reference

| Variable | Required | Default | Vercel Value |
|----------|----------|---------|--------------|
| `USE_DATABASE` | No | `true` | `false` |
| `OPENAI_API_KEY` | Yes* | - | `sk-...` |
| `CLAUDE_API_KEY` | Yes* | - | `sk-ant-...` |
| `GEMINI_API_KEY` | Yes* | - | `...` |
| `AI_PROVIDER` | No | `openai` | `openai` |
| `DEBUG` | No | `true` | `false` |

*At least one AI API key required

## Local Development

**With Database** (default):
```bash
# .env
USE_DATABASE=true
DATABASE_URL=sqlite:///./musee.db
```

**Without Database** (test Vercel config):
```bash
# .env
USE_DATABASE=false
```

## Vercel Configuration

Create `vercel.json`:
```json
{
  "builds": [
    {
      "src": "backend/app/main.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "backend/app/main.py"
    }
  ]
}
```

## Testing Deployment

```bash
# Health check
curl https://your-app.vercel.app/health

# Should return:
{
  "status": "healthy",
  "ai_provider": "openai",
  "database_enabled": false
}
```

## Summary

**For Vercel**: Set `USE_DATABASE=false` in environment variables.

**For Production with Database**: Use PostgreSQL (Vercel Postgres, Supabase, or Neon).
