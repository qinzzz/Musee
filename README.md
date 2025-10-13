# Musee - AI-Powered Artwork Analysis

React Native iOS app + Python FastAPI stateless backend for analyzing artwork with AI. Photos and analysis data stored locally on device.

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
- **Local Storage**: All photos and analysis data stored on device using AsyncStorage

### Backend (Stateless)
- **Streaming API**: `/api/analyze` streams artwork analysis (no data saved on server)
- **Artist API**: `/api/analyze-artist` identifies artist (no data saved on server)
- **File-Based Prompts**: All prompts in `backend/app/prompts/` for easy editing
- **No File Storage**: Images processed in-memory, not saved to disk

## API Endpoints

| Endpoint | Method | Streaming | Purpose |
|----------|--------|-----------|---------|
| `/api/analyze` | POST | Yes | Artwork analysis with tone (stateless) |
| `/api/analyze-artist` | POST | No | Artist identification (stateless) |
| `/api/providers` | GET | No | List available AI providers |
| `/health` | GET | No | Health check |

**Note**: Database endpoints (`/api/collection/*`, `/api/analysis/{id}`) only available if `USE_DATABASE=true`.

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

## Data Storage

### Frontend (Primary Storage)
All user data stored locally on device using `@react-native-async-storage/async-storage`:

**Storage Key**: `@musee:analyses`

```typescript
interface ArtworkAnalysis {
  id: string;
  photoUri: string;              // Local file URI
  artistName: string;
  artistConfidence?: number;      // 0-10
  analysisText?: string;          // AI analysis result
  tone?: string;                  // Analysis tone used
  model?: string;                 // AI model used
  timestamp: string;              // ISO timestamp
}
```

**Functions**: `saveAnalysis()`, `getAnalyses()`, `deleteAnalysis()`, `searchAnalysesByArtist()`, `getStorageStats()`

### Backend (Optional Database)
SQLite database only used if `USE_DATABASE=true` (disabled by default for stateless deployment).

**Table**: `artwork_analyses` (SQLite at `./musee.db`) - used only by collection endpoints.

**Note**: Main analysis endpoints (`/analyze`, `/analyze-artist`) are stateless and don't save to database.

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
2. Photo sent to `/api/analyze-artist` (backend processes in-memory, no storage)
3. Backend analyzes, returns artist suggestions
4. User selects artist or enters manually
5. Photo + analysis saved to device local storage (AsyncStorage)
6. (Future) Full analysis with selected tone via `/api/analyze`

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

**Frontend**: React Native 0.81.4, TypeScript, AsyncStorage, Reanimated, Vision Camera
**Backend**: FastAPI (stateless), Pillow (in-memory image processing), OpenAI/Claude/Gemini SDKs
**Storage**: Local device storage via AsyncStorage (primary), SQLite optional (database endpoints only)

## Project Structure

```
Musee/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app (stateless)
│   │   ├── routers/
│   │   │   ├── artwork.py       # Analysis endpoints (stateless)
│   │   │   └── collection.py    # Collection endpoints (DB only)
│   │   ├── services/
│   │   │   ├── ai_service.py    # AI interface
│   │   │   ├── openai_client.py
│   │   │   ├── claude_client.py
│   │   │   └── gemini_client.py
│   │   ├── prompts/             # File-based prompts
│   │   ├── database/
│   │   │   ├── models.py        # SQLAlchemy models (optional)
│   │   │   └── connection.py
│   │   └── utils/
│   │       ├── prompt_loader.py # Prompt file loader
│   │       └── image_processing.py # In-memory image processing
│   └── musee.db                 # SQLite database (optional)
├── frontend/
│   ├── App.tsx                  # Main navigation
│   ├── src/
│   │   ├── screens/
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── CameraScreen.tsx
│   │   │   └── ArtistIdentificationScreen.tsx
│   │   ├── services/
│   │   │   └── storage.ts       # AsyncStorage service
│   │   ├── constants/
│   │   │   ├── api.ts           # API configuration
│   │   │   └── colors.ts
│   │   └── styles/
│   └── ios/
└── README.md
```

## Deployment

### Vercel (Serverless) - Recommended

**Configuration**: Server is stateless by default - perfect for serverless deployment.

**Environment Variables**:
```
USE_DATABASE=false  # Default - no file storage needed
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
```

**What Works**: `/api/analyze`, `/api/analyze-artist`, `/health` - all stateless endpoints

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guide.

## Troubleshooting

### "Network request failed"
- Check Mac and iPhone on same Wi-Fi
- Verify backend running: `curl http://YOUR_IP:8000/health`
- Rebuild app after changing `api.ts`: `npm run ios`

### "API key not configured"
- Add at least one API key to `backend/.env`
- Restart backend server

### "unable to open database file"
- Server is stateless by default (`USE_DATABASE=false`)
- Only occurs if you enabled database for collection endpoints
- Solution: Keep `USE_DATABASE=false` or use PostgreSQL (see DEPLOYMENT.md)

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
