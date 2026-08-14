# Musee Backend Architecture

The Musee backend is a high-performance FastAPI application designed to orchestrate complex AI operations for artwork analysis, history management, and conversational art curation.

## System Architecture

The system follows a modular, interface-driven architecture to ensure scalability and easy integration of new AI providers.

```mermaid
graph TD
    A[Client: iOS/Web] -->|HTTP/SSE| B[FastAPI Routers]
    B --> C[AI Orchestration Service]
    B --> D[Database: Neon/PostgreSQL]
    C --> E[AI Service Factory]
    E --> F[OpenAI Client]
    E --> G[Claude Client]
    E --> H[Gemini Client]
    C --> I[Prompt Engine]
    B --> J[Storage Service: Vercel/Local]
```

### Core Modules

- **`app.routers`**: Handles API endpoints, including streaming (SSE) and standard REST requests.
- **`app.services`**: The brain of the application. 
    - `AIService`: Orchestrates prompts, image encoding, and provider-specific calls.
    - `AIClientInterface`: Polymorphic interface for all AI providers.
    - `StorageService`: Pluggable storage for artwork images.
- **`app.prompts`**: A dynamic prompt management system with support for multiple identities (personas) and languages.
- **`app.database`**: Managed via SQLAlchemy and Neon PostgreSQL for persistent storage of artworks, conversations, and tags.
- **`app.utils`**: Image processing, prompt loading, and validation utilities.

## Developer Manual

### Prerequisites
- Python 3.9+
- PostgreSQL (Neon recommended)
- API Keys: OpenAI, Anthropic, or Google Gemini

### 1. Local Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.local
```

### 2. Environment Configuration
Key variables in your `.env.local`:
- `NEON_DATABASE_URL`: Your PostgreSQL connection string.
- `AI_PROVIDER`: `gemini`, `openai`, or `claude`.
- `MAX_FILE_SIZE_MB`: Defaults to 10.
- `LOG_LEVEL`: `INFO` or `DEBUG`.
- `SECRET_KEY`: Required in production for signing short-lived access tokens.
- `AUTH_ALLOWED_ORIGINS`: Comma-separated frontend origins allowed to renew or revoke cookie sessions.
- `REFRESH_COOKIE_SECURE`: Defaults to enabled in production. Set explicitly only when deployment topology requires it.
- `REFRESH_COOKIE_SAMESITE`: Defaults to `lax`; cross-site frontend/API deployments require `none` together with secure cookies.

### 3. Running the Server
```bash
python scripts/run_dev_server.py
```
- The launcher clears stale `8000` listeners before starting `uvicorn`, which helps avoid the common local dev state where the port is occupied but the backend is not serving.
- For more stable phone/device testing, run without the file watcher:
```bash
python scripts/run_dev_server.py --no-reload
```
- **Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health**: [http://localhost:8000/health](http://localhost:8000/health)

### 4. Database Migrations
Apply the versioned database migrations before deploying:
```bash
alembic upgrade head
```

## AI Orchestration

To add a new AI provider:
1. Implement the `AIClientInterface` in `app/services/`.
2. Register the provider in `AIServiceFactory`.
3. Update `AIProvider` enum in `app/models/artwork.py`.

### Prompt personae
The system supports multiple curator identities (e.g., `default`, `professional`, `sarcastic`). These are defined in `app/prompts/identities/` and merged with instructions in `app/prompts/instructions/`.

## Deployment

The backend is configured for **Vercel** via `vercel.json` but can run on any ASGI-compliant platform.
- **Streaming**: Uses `StreamingResponse` with SSE for real-time analysis.
- **Pooling**: SQLAlchemy is configured with `pool_pre_ping=True` and `pool_recycle=300` for stable cloud connections.

---
*Built for the future of art curation.*
