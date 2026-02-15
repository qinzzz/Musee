# Musee Backend API Reference

## Design Principles

- **Stateless AI endpoints**: Analysis endpoints (`/analyze-*`, `/generate-*`) do not read from or write to the database. Pass `conversation_history` as JSON to maintain context.
- **Explicit persistence**: Use `/artworks` to persist data after analysis.
- **No side effects on reads**: GET endpoints are pure reads with no database writes.

---

## AI Analysis Endpoints (`/api`) - Stateless

| Method | Path | Request Fields | Response Fields |
|--------|------|----------------|-----------------|
| **POST** | `/artwork-analyze` | `image` (file), `model?`, `identity?`, `language?` | `{analysis, model_used}` |
| **POST** | `/artwork-chat` | `query?`, `image?` (file), `artist_name?`, `artwork_name?`, `conversation_history?` (JSON), `model?`, `identity?`, `language?` | `{response, query, model_used}` |
| **POST** | `/suggest-topic` | `artist_name`, `artwork_name`, `conversation_history` (JSON), `model?`, `identity?`, `language?` | `{suggested_topics[], model_used}` |
| **POST** | `/generate-summary` | `image` (file), `artist_name`, `artwork_name`, `conversation_history?` (JSON), `model?`, `identity?`, `language?` | `{summary, model_used}` |

### Web-client AI

| Method | Path | Request Body | Response |
|--------|------|--------------|----------|
| **POST** | `/exhibition-chat` | `{items: [{id, url, keywords}], conversation_history: [{role, content}], new_message}` + optional `?model=` (openai, claude, gemini) | `{response}` — **OpenAI, Claude, Gemini** |
| **POST** | `/exhibition-chat-stream` | Same as `/exhibition-chat` | SSE: `event: chunk`, then `event: complete` — **OpenAI, Claude, Gemini** |
| **POST** | `/define-aesthetic-term` | `{tag}` | `{definition, externalResonances[]}` — **Gemini only** |
| **POST** | `/generate-speech` | `{text}` | Raw PCM audio — **Gemini only** |

---

## Configuration Endpoints (`/api`)

| Method | Path | Response Fields |
|--------|------|-----------------|
| **GET** | `/providers` | `{available_providers[], default_provider, total}` |
| **GET** | `/identities` | `{available_identities[], available_instructions[], default_identities{}}` |

---

## Image Processing (`/api`)

| Method | Path | Request Fields | Response |
|--------|------|----------------|----------|
| **POST** | `/remove-background` | `image` (file) | PNG image binary |

---

## Artwork CRUD (/api/artworks)

| Method | Path | Request Fields | Response Fields |
|--------|------|----------------|-----------------|
| **POST** | `/artworks` | `photo_uri`, `artist_name`, `artwork_name`, `conversation_history` (JSON), `user_id`, `location?`, `museum_name?`, `is_recognized?`, `tags?`, `analysis?`, `summary?`, `params?` (JSON), `photo_time?` | SavedArtwork object |
| **GET** | `/artworks` | `user_id` (required), `recognized_only?`, `limit?` (max 100), `offset?` | `{items[], count, offset, limit}` |
| **GET** | `/artworks/{artwork_id}` | - | SavedArtwork object with conversations |
| **PUT** | `/artworks/{artwork_id}` | `artist_name?`, `artwork_name?`, `summary?`, `tags?`, `analysis?`, `params?` | SavedArtwork object |
| **DELETE** | `/artworks/{artwork_id}` | - | `{message}` |
| **POST** | `/artworks/batch-delete` | `artwork_ids[]`, `user_id` | `{message, deleted_count}` |

---

## Users (`/api/users`)

| Method | Path | Request Fields | Response Fields |
|--------|------|----------------|-----------------|
| **POST** | `/users` | `device_id`, `username?`, `email?`, `settings?` | User object |
| **GET** | `/users/{user_id}` | - | User object |
| **GET** | `/users/by-device/{device_id}` | - | User object |
| **PUT** | `/users/{user_id}` | `username?`, `email?`, `settings?` | User object |
| **DELETE** | `/users/{user_id}` | - | `{message}` |

---

## Collections (`/api/collections`)

| Method | Path | Request Fields | Response Fields |
|--------|------|----------------|-----------------|
| **POST** | `/collections` | `name`, `user_id`, `description?`, `artwork_ids[]?` | Collection object with artworks |
| **GET** | `/collections` | `user_id` (query param) | Collection[] with artworks |
| **GET** | `/collections/{collection_id}` | - | Collection object with artworks |
| **PUT** | `/collections/{collection_id}` | `name?`, `description?`, `artwork_ids[]?` | Collection object with artworks |
| **DELETE** | `/collections/{collection_id}` | - | `{message}` |

---

## Tags (`/api/tags`)

| Method | Path | Request Fields | Response Fields |
|--------|------|----------------|-----------------|
| **GET** | `/tags` | `user_id` (query param) | Tag[] |
| **POST** | `/tags` | `name`, `user_id` | Tag object |
| **DELETE** | `/tags/{tag_id}` | - | `{message}` |
| **POST** | `/artworks/{artwork_id}/tags/{tag_id}` | - | `{message}` |
| **DELETE** | `/artworks/{artwork_id}/tags/{tag_id}` | - | `{message}` |

---

## Data Models

### SavedArtwork
```
id                    UUID
photo_uri             string
artist_name           string
artwork_name          string
user_id               UUID
location              string (optional)
museum_name           string (optional)
summary               string (optional)
analysis              string (optional)
params                JSON (optional)
is_recognized         integer (0 or 1)
photo_time            string (optional)
created_at            datetime
updated_at            datetime
conversation_history  Conversation[]
tags                  Tag[]
```

### User
```
user_id               UUID
device_id             string (unique)
username              string (optional)
email                 string (optional)
settings              JSON (optional)
created_at            datetime
last_active           datetime
```

### Collection
```
id                    UUID
name                  string
description           string (optional)
user_id               UUID
created_at            datetime
artworks              SavedArtwork[]
```

### Tag
```
id                    UUID
name                  string
user_id               UUID
created_at            datetime
```

### Conversation
```
id                    UUID
saved_artwork_id      UUID
sequence_number       integer
role                  string ("user" | "assistant")
content               string
message_metadata      JSON (optional)
created_at            datetime
```

---

## Query Parameters Legend

| Symbol | Meaning |
|--------|---------|
| `?` | Optional field |
| `[]` | Array type |
| `(file)` | File upload (multipart/form-data) |
| `(JSON)` | JSON string in Form data |

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid JSON, missing required fields) |
| 404 | Resource not found |
| 500 | Internal server error |
| 503 | AI service unavailable |

---

## AI Provider Options

- `openai` - OpenAI GPT models
- `claude` - Anthropic Claude models
- `gemini` - Google Gemini models

## Identity/Persona Options

- `default`
- `museum_narrator`
- `art_historian`

## Supported Languages

`en`, `es`, `fr`, `de`, `it`, `pt`, `zh`, `ja`, `ko`, `ru`, `ar`, `hi`
