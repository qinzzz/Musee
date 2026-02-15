# Musee — Project Architecture & Key Files

## Frontend (`frontend-web/`)

### Core Files
| File | Role |
|------|------|
| `App.tsx` | Main entry: corridor/topography views, gallery state, OAuth, settings panel, language toggle |
| `apiService.ts` | All API calls, SSE streaming (analyzeArtworkStream, chatWithArtworkStream, exhibitionChatStream), auth helpers, language param injection |
| `types.ts` | TypeScript interfaces: Message, GalleryItem, Visit, NeighborItem, Annotation, TagCoordinate, AestheticVibe |
| `vite.config.ts` | Dev server port 3000, React plugin, path aliases |

### Components (`frontend-web/components/`)
| Component | Purpose |
|-----------|---------|
| `InterpretationModal.tsx` | Full artwork interpretation: markdown rendering, Google Search links, tag hover, annotations, conversation history, streaming chat |
| `ExhibitionHall.tsx` | Curator conversation about entire visit collection, streaming responses |
| `GalleryCard.tsx` | Individual artwork card: photo, artist, title, tags, actions |
| `VisitStack.tsx` | Recorded visit groups: resume, open exhibition, delete |
| `Controls.tsx` | Bottom toolbar: view toggle, camera/album upload, visit controls |
| `NeighborSection.tsx` | Related artworks (currently mocked data) |
| `TagDefinitionModal.tsx` | Tag explanations and related works |
| `TopographyView.tsx` | 2D spatial visualization of tags and artworks |
| `EmptyWall.tsx` | Empty state placeholder |
| `InteractionOverlay.tsx` | Interaction overlay UI |
| `GoogleLogin.tsx` | Google OAuth login component |

### Key Frontend Patterns
- **SSE streaming**: `response.body.getReader()` + `TextDecoder`, split by `\n\n`, parse `event:` and `data:` headers
- **Language**: `localStorage musee_language` → `getLanguage()` in apiService → appended to all requests
- **User identity**: Anonymous `web-[timestamp]-[random]` UUID, migrated on Google OAuth login
- **Image handling**: Base64 data URLs, downscaled to 1600px max before upload
- **Auth tokens**: `musee_auth_token`, `musee_user_id`, `musee_user_info` in localStorage

## Backend (`backend/`)

### Routers (`app/routers/`)
| Router | Endpoints |
|--------|-----------|
| `artwork.py` | `/artwork-analyze`, `/artwork-analyze-stream`, `/artwork-chat`, `/artwork-chat-stream`, `/suggest-topic`, `/exhibition-chat`, `/exhibition-chat-stream`, `/define-aesthetic-term`, `/generate-speech`, `/tag-explanation`, `/artworks` |
| `auth.py` | `/auth/google` — Google OAuth, JWT token issuance, anonymous data migration |
| `users.py` | User profile endpoints, device ID support |
| `collection.py` | CRUD for collections, add/remove artworks |
| `tag.py` | Tag management, resonances (artwork co-occurrence) |

### Services (`app/services/`)
| Service | Role |
|---------|------|
| `ai_service.py` | AI orchestration: prompt loading, language map (12 langs), JSON schema for structured output |
| `ai_client_interface.py` | Abstract base class for all AI providers |
| `openai_api_client.py` | OpenAI GPT-4o-mini (default), reasoning effort levels |
| `claude_api_client.py` | Claude API via Anthropic SDK |
| `gemini_api_client.py` | Google Gemini + TTS support |
| `photoroom_service.py` | Background removal API |
| `storage/` | LocalStorage / VercelBlobStorage with factory pattern |

### Database Models (`app/database/models.py`)
- **User**: user_id (UUID PK), email, google_id, profile_picture_url, settings (JSON)
- **SavedArtwork**: id (UUID), photo_uri, artist_name, artwork_name, analysis (Text), summary, location (JSON), photo_time, session_id (FK), user_id (FK)
- **Conversation**: artwork_id (FK), role, content, sequence_number
- **Tag**: name (unique), many-to-many with SavedArtwork via artwork_tags
- **Session**: id (string), user_id (FK), created_at, updated_at
- **Collection**: user-created, many-to-many with artworks

### Prompts (`app/prompts/`)
- `instructions/artist_identification_with_analysis.txt` — Main analysis (JSON output, 5 tags, 3-5 sentences)
- `instructions/artist_identification.txt` — Artist-only
- `instructions/artwork_bite.txt` — Short insight
- `instructions/suggest_topics.txt` — Conversation topics
- `identities/` — Persona prompts: art_historian, museum_narrator, gamified

### Utilities
- `prompt_loader.py` — Load & cache prompts from .txt files
- `image_processing.py` — Encoding, resizing, geo-reverse lookup
- `conversation_storage.py` — Message format helpers
- `auth_utils.py` — JWT creation/verification

## SSE Streaming Protocol
```
event: chunk
data: {"type": "text", "content": "...partial analysis..."}

event: complete
data: {"type": "result", "artist_name": "...", "artwork_name": "...", "tags": [...], "artwork_id": "..."}

event: metrics
data: {"type": "metrics", "request_id": "...", "timings": {...}, "model": "..."}
```

## Config (`app/config/settings.py`)
- AI provider: configurable (default openai), model override available
- Database: Neon PostgreSQL (dev/prod URLs)
- Storage: local vs vercel_blob, max 10MB
- Auth: JWT HS256, 30 min expiry
- CORS: all origins allowed
