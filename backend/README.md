# Musee Backend API

Python FastAPI backend for Musee artwork analysis application.

## Features

- **AI-Powered Artwork Analysis**: Uses OpenAI GPT-4 Vision, Claude, or Gemini to analyze artwork images
- **Multiple Tone Options**: Professional, general public, sarcastic, educational, or poetic analysis styles  
- **Swappable AI Models**: Easy configuration to switch between different AI providers
- **Collection Management**: Save and organize analyzed artworks
- **Image Processing**: Automatic image validation, resizing, and metadata extraction
- **RESTful API**: Clean API design with automatic documentation

## Quick Start

### Prerequisites

- Python 3.8+
- API keys for at least one AI service (OpenAI, Claude, or Gemini)

### Installation

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Run the server**:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

The API will be available at `http://localhost:8000` with documentation at `http://localhost:8000/docs`.

## Configuration

Edit the `.env` file to configure:

### AI Services
- `AI_PROVIDER`: Default AI service (openai, claude, or gemini)
- `OPENAI_API_KEY`: OpenAI API key for GPT-4 Vision
- `CLAUDE_API_KEY`: Anthropic Claude API key  
- `GEMINI_API_KEY`: Google Gemini API key

### File Upload
- `MAX_FILE_SIZE_MB`: Maximum upload size (default: 10MB)

### Database
- `NEON_DATABASE_URL`: Neon PostgreSQL connection string (required for both dev and production)

## API Endpoints

### Artwork Analysis
- `POST /api/analyze` - Analyze artwork image
- `GET /api/analysis/{id}` - Get analysis by ID
- `DELETE /api/analysis/{id}` - Delete analysis
- `GET /api/providers` - List available AI providers

### Collection Management  
- `GET /api/collection` - Get collection with pagination/filtering
- `GET /api/collection/stats` - Collection statistics
- `GET /api/collection/search` - Search through analyses

### Analysis Tones

- **Professional**: Academic, art history focused
- **General**: Accessible to general public  
- **Sarcastic**: Humorous, witty commentary
- **Educational**: Teaching-focused for students
- **Poetic**: Artistic, emotional interpretation

## Example Usage

### Analyze Artwork
```bash
curl -X POST "http://localhost:8000/api/analyze" \
  -H "Content-Type: multipart/form-data" \
  -F "image=@artwork.jpg" \
  -F "tone=professional" \
  -F "model=openai"
```

### Get Collection
```bash
curl "http://localhost:8000/api/collection?page=1&per_page=10&tone=general"
```

## Development

### Project Structure
```
backend/
├── app/
│   ├── main.py              # FastAPI application
│   ├── config/settings.py   # Configuration  
│   ├── models/              # Pydantic models
│   ├── services/            # AI service implementations
│   ├── routers/             # API endpoints
│   ├── database/            # Database models & connection
│   └── utils/               # Utilities (image processing)
├── uploads/                 # Uploaded images
├── requirements.txt         # Python dependencies
└── .env                     # Environment configuration
```

### Adding New AI Services

1. Create new client in `app/services/`
2. Implement `AIServiceInterface`
3. Register in `app/routers/artwork.py`

### Database Schema

The Neon PostgreSQL database includes:
- `artwork_analyses`: Analysis records with metadata
- `artwork_history`: Fast photo history with artist/artwork metadata
- Automatic timestamps and UUID primary keys
- JSON storage for flexible image metadata

**Database Setup:**
```bash
# Run migrations to create tables
python migrate_db.py

# Check database connection
python check_db_config.py

# Test connection
python test_connection.py
```

## Production Deployment

1. Set `DEBUG=False` in environment
2. Ensure `NEON_DATABASE_URL` is set with production database credentials
3. Configure proper CORS origins
4. Use production ASGI server (Gunicorn + Uvicorn)
5. Set up file storage (AWS S3, etc.) for images
6. Add authentication and user management
7. Implement rate limiting and monitoring

**Note:** The app now uses Neon PostgreSQL for both development and production environments, eliminating the need for separate database configurations.

## License

MIT License - see LICENSE file for details.