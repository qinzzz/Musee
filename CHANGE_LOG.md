# Change Log

## 2025-12-07 - Frontend: Display Artwork Analysis

### Frontend Enhancement
- **Display Artwork Analysis Below Artist List**: PhotoDisplayScreen now shows the detailed analysis from `analyze_artist` endpoint

  **Changes**:
  - Added `artworkAnalysis` state to store the analysis content
  - Enhanced parsing logic to extract the `analysis` field from the last item in the response array
  - New `analysisContainer` style for the analysis display box
  - Uses existing `ArtworkBite` component to render the analysis with markdown support

  **User Experience**:
  - Artist cards show at the top with scores and reasons
  - Full artwork analysis appears below in a styled box
  - Analysis supports markdown formatting (bold, italics, lists, etc.)
  - Seamless integration with existing UI flow

  **Technical Details**:
  - Parses backend response format: `[{artist1}, {artist2}, {artist3}, {analysis: "..."}]`
  - Separates artist data from analysis content
  - Reuses `ArtworkBite` component for consistent styling and markdown rendering

  **File Modified**: [frontend/src/screens/PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx)

## 2025-12-07 - AI Service Architecture Refactoring (Final)

### Backend Architecture - Complete Separation of Concerns

**Major architectural refactoring** to separate business logic from API-specific implementations:

#### New Architecture

**1. `AIService` (Concrete Orchestrator)**
- **File**: [backend/app/services/ai_service.py](backend/app/services/ai_service.py)
- **Role**: Handles ALL common business logic
- **Responsibilities**:
  - Prompt loading and construction
  - Image encoding and preparation
  - Request orchestration
  - Response parsing and cleaning
  - Language instruction building
  - Conversation history management

**2. `AIClientInterface` (Abstract Interface)**
- **File**: [backend/app/services/ai_client_interface.py](backend/app/services/ai_client_interface.py)
- **Role**: Defines contract for provider-specific API clients
- **Methods**:
  - `call_with_image_and_text()` - Image + text API call
  - `call_with_conversation()` - Conversation history API call
  - `call_text_only()` - Text-only API call
  - `prepare_image()` - Provider-specific image format
  - `build_conversation_messages()` - Provider-specific message format

**3. Provider-Specific API Clients** (Concrete Implementations)
- **Files**:
  - [backend/app/services/claude_api_client.py](backend/app/services/claude_api_client.py) - `ClaudeAPIClient`
  - [backend/app/services/openai_api_client.py](backend/app/services/openai_api_client.py) - `OpenAIAPIClient`
  - [backend/app/services/gemini_api_client.py](backend/app/services/gemini_api_client.py) - `GeminiAPIClient`
- **Role**: ONLY handle actual API calls to external LLMs
- **No business logic** - pure API interaction

#### How It Works

```python
# Old way (logic duplicated in each client):
claude_client = ClaudeClient()
response = await claude_client.identify_artist(image_bytes, identity, language)
# ^ prompt loading, image encoding, API call all in one class

# New way (separation of concerns):
claude_api_client = ClaudeAPIClient()  # Just API calls
ai_service = AIService(claude_api_client)  # Business logic + orchestration
response = await ai_service.identify_artist(image_bytes, identity, language)
# ^ AIService loads prompts, encodes image, then delegates API call to client
```

#### Benefits

1. **Zero Code Duplication**: All common logic (prompt loading, image encoding, language mapping, JSON parsing) lives in ONE place (`AIService`)

2. **Provider Clients Are Tiny**: Each API client is ~150 lines, down from ~250+ lines
   - Only provider-specific API call logic
   - No prompt loading
   - No request construction
   - No response parsing (except extracting text from API response)

3. **Easy to Add New Providers**: Just implement 5 methods in `AIClientInterface`
   - No need to duplicate prompt loading logic
   - No need to reimplement language mapping
   - Focus only on API-specific details

4. **Single Source of Truth**:
   - Language mapping: `AIService.get_language_map()`
   - JSON parsing: `AIService.parse_json_response()`
   - Summary prompts: `AIService.build_summary_prompt()`

5. **Testable**: Can mock `AIClientInterface` to test business logic without calling real APIs

#### Files Changed

**New Files**:
- `ai_client_interface.py` - Abstract interface for API clients
- `claude_api_client.py` - Claude API-specific implementation
- `openai_api_client.py` - OpenAI API-specific implementation
- `gemini_api_client.py` - Gemini API-specific implementation

**Modified**:
- `ai_service.py` - Completely rewritten as concrete orchestrator class
- `app/routers/artwork.py` - Updated to register new API clients

**Removed**:
- `claude_client.py` - Replaced by `claude_api_client.py`
- `gemini_client.py` - Replaced by `gemini_api_client.py`
- `openai_client.py` - Replaced by `openai_api_client.py`

#### Migration Impact

✅ **No breaking changes** - External API remains identical
✅ **Same functionality** - All features work exactly as before
✅ **Better code quality** - Cleaner separation of concerns
✅ **Easier maintenance** - Single place to update common logic

## 2025-12-07 - Grid Testing Implementation

### Backend Testing
- **Added Grid Testing Framework**: Implemented parameterized testing system for LLM-calling APIs
  - New `--grid` flag enables running tests with parameter variations
  - Currently supports `language` parameter with values: "english", "chinese"
  - Applies to all LLM endpoints: `/api/analyze-artist`, `/api/analyze-bite`, `/api/analyze-topic`, `/api/artwork-summary`
  - Each LLM test runs multiple times with different language parameters when grid mode is enabled
  - Test names include parameter values in brackets for clarity (e.g., `POST /api/analyze-artist [english]`)

- **Enhanced Test Configuration**:
  - Added `grid_test` boolean to `TestConfig` dataclass
  - Modified test sequence to support both regular and grid test modes
  - Automatic language parameter injection when grid mode is active

- **Usage Examples**:
  ```bash
  # Run grid tests with all endpoints
  python backend/testing/test_api.py --mode dev --grid --verbose

  # Combine with LLM-only mode for faster testing
  python backend/testing/test_api.py --mode dev --llm --grid --verbose
  ```

- **Test Coverage**: Grid testing ensures multilingual functionality works correctly across all AI-powered endpoints
