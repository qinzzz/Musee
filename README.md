# Musee - AI-Powered Artwork Analysis

React Native iOS app + Python FastAPI backend for analyzing artwork with AI.

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
# Add API keys to .env: OPENAI_API_KEY, CLAUDE_API_KEY, or GEMINI_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm install
cd ios && pod install && cd ..
# Edit src/constants/api.ts with your Mac's IP (see Network Setup)
npm run ios  # Physical device: Chelsea's iPhone
npm run ios:sim  # Simulator: iPhone 16 Pro
```

## Network Setup

### Get Your Mac's IP
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# Example output: 10.0.0.17
```

### Configure Frontend
**File**: `frontend/src/constants/api.ts`
```typescript
export const API_BASE_URL = 'http://YOUR_MAC_IP:8000';  // e.g., http://10.0.0.17:8000
```

### Requirements
- Mac and iPhone on **same Wi-Fi network**
- Backend uses `host: "0.0.0.0"` (already configured)
- iOS allows local networking (already configured)

### Test Connection
```bash
curl http://YOUR_MAC_IP:8000/health
# iPhone Safari: http://YOUR_MAC_IP:8000/health
```

## Features

### Frontend
- **Camera**: Capture artwork photos
- **Artist Identification**: AI identifies artist with confidence scores + manual input option
- **Streaming Analysis**: Real-time AI artwork descriptions with 5 tones (professional, general, sarcastic, educational, poetic)
- **3 AI Models**: OpenAI, Claude, Gemini

### Backend
- **Streaming API**: `/api/analyze` streams artwork analysis
- **Artist API**: `/api/analyze-artist` identifies artist (non-streaming)
- **Collection**: `/api/collection` - view, search, filter saved analyses
- **File-Based Prompts**: All prompts in `backend/app/prompts/` for easy editing

## API Endpoints

| Endpoint | Method | Streaming | Purpose |
|----------|--------|-----------|---------|
| `/api/analyze` | POST | Yes | Artwork analysis with tone |
| `/api/analyze-artist` | POST | No | Artist identification |
| `/api/collection` | GET | No | View saved analyses (paginated) |
| `/api/collection/stats` | GET | No | Collection statistics |
| `/api/collection/search` | GET | No | Search analyses |
| `/api/analysis/{id}` | GET/DELETE | No | Get/delete specific analysis |
| `/health` | GET | No | Health check |

### Test API
```bash
# Test streaming
curl -X POST "http://localhost:8000/api/analyze" \
  -F "image=@artwork.jpg" \
  -F "tone=professional" \
  -N

# Test artist identification
curl -X POST "http://localhost:8000/api/analyze-artist" \
  -F "image=@artwork.jpg"
```

## Database Schema

**Table**: `artwork_analyses` (SQLite at `./musee.db`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `image_path` | String | File path to uploaded image |
| `image_metadata` | JSON | {filename, size, dimensions, format} |
| `tone` | String | Analysis tone used |
| `ai_model` | String | AI provider (openai/claude/gemini) |
| `analysis_text` | Text | Full AI analysis |
| `user_id` | String | For future auth (nullable) |
| `created_at` | DateTime | Creation timestamp |
| `updated_at` | DateTime | Update timestamp |

**Note**: `/analyze` and `/analyze-artist` currently **don't save** to database (streaming removed this). Collection endpoints still work for manually saved data.

### View Database
```bash
cd backend
sqlite3 musee.db
sqlite> SELECT COUNT(*) FROM artwork_analyses;
sqlite> .quit
```

## Prompt Management

All AI prompts are file-based for easy editing:

```
backend/app/prompts/
├── artist_identification.txt   # Artist ID prompt
├── artwork_analysis.txt        # Base analysis prompt
└── tones/                      # Tone-specific instructions
    ├── professional.txt
    ├── general.txt
    ├── sarcastic.txt
    ├── educational.txt
    └── poetic.txt
```

**Edit prompts**: Just modify `.txt` files, restart server. No code changes needed.

## Architecture

### AI Service Pattern
```python
# Interface
class AIServiceInterface(ABC):
    async def analyze_artwork(...) -> AsyncGenerator[str, None]  # Streaming
    async def identify_artist(...) -> str                        # Non-streaming

# Implementations
OpenAIClient(AIServiceInterface)   # GPT-4o
ClaudeClient(AIServiceInterface)   # Claude Sonnet 4
GeminiClient(AIServiceInterface)   # Gemini Pro Vision
```

### Data Flow
1. User takes photo → Camera screen
2. Photo sent to `/api/analyze-artist`
3. Backend analyzes, returns artist suggestions
4. User selects artist or enters manually
5. (Future) Full analysis with selected tone

## Configuration

### Backend `.env`
```env
# AI Provider (default)
AI_PROVIDER=openai

# API Keys (at least one required)
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Server
HOST=0.0.0.0
PORT=8000

# Database (set USE_DATABASE=false for Vercel/serverless)
USE_DATABASE=true
DATABASE_URL=sqlite:///./musee.db
```

### Frontend `api.ts`
```typescript
// For physical device
export const API_BASE_URL = 'http://10.0.0.17:8000';

// For simulator
// export const API_BASE_URL = 'http://localhost:8000';
```

## Tech Stack

**Frontend**: React Native 0.81.4, TypeScript, Reanimated, Vision Camera
**Backend**: FastAPI, SQLAlchemy, Pillow, OpenAI/Claude/Gemini SDKs
**Database**: SQLite (dev), upgradable to PostgreSQL

## Project Structure

```
Musee/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── routers/
│   │   │   ├── artwork.py       # Analysis endpoints
│   │   │   └── collection.py    # Collection endpoints
│   │   ├── services/
│   │   │   ├── ai_service.py    # AI interface
│   │   │   ├── openai_client.py
│   │   │   ├── claude_client.py
│   │   │   └── gemini_client.py
│   │   ├── prompts/             # File-based prompts
│   │   ├── database/
│   │   │   ├── models.py        # SQLAlchemy models
│   │   │   └── connection.py
│   │   └── utils/
│   │       └── prompt_loader.py # Prompt file loader
│   ├── uploads/                 # Image storage
│   └── musee.db                 # SQLite database
├── frontend/
│   ├── App.tsx                  # Main navigation
│   ├── src/
│   │   ├── screens/
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── CameraScreen.tsx
│   │   │   └── ArtistIdentificationScreen.tsx
│   │   ├── constants/
│   │   │   ├── api.ts           # API configuration
│   │   │   └── colors.ts
│   │   └── styles/
│   └── ios/
└── README.md
```

## Deployment

### Vercel (Serverless)

**Issue**: SQLite doesn't work on Vercel (read-only filesystem)

**Solution**: Set environment variable in Vercel dashboard:
```
USE_DATABASE=false
```

This disables collection endpoints but keeps analysis working. See [DEPLOYMENT.md](DEPLOYMENT.md) for details.

## Troubleshooting

### "Network request failed"
- Check Mac and iPhone on same Wi-Fi
- Verify backend running: `curl http://YOUR_IP:8000/health`
- Rebuild app after changing `api.ts`: `npm run ios`

### "API key not configured"
- Add at least one API key to `backend/.env`
- Restart backend server

### "unable to open database file" (Vercel)
- Set `USE_DATABASE=false` in Vercel environment variables
- Or use PostgreSQL (see DEPLOYMENT.md)

### IP address changed
```bash
# Get new IP
ifconfig | grep "inet " | grep -v 127.0.0.1
# Update frontend/src/constants/api.ts
# Rebuild: npm run ios
```

## Development Workflow

**Terminal 1 - Backend**:
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Frontend**:
```bash
cd frontend
npm start  # Metro bundler
```

**Terminal 3 - Run iOS**:
```bash
cd frontend
npm run ios
```

## API Documentation

Start backend and visit: `http://localhost:8000/docs`

## License

MIT
