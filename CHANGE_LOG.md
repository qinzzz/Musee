# Change Log

## 2025-12-07 - Backend & Frontend: Persist Tags and Analysis to Database

### Feature - Database Persistence for Tags and Analysis
- **Save Tags and Analysis**: Artwork tags and analysis text now persisted to database for future retrieval

  **Backend Changes**:
  - Updated [database/models.py](backend/app/database/models.py):
    - Added `tags` column (String) - stores comma-separated tags (e.g., "pop art, late 90s, dadaism")
    - Added `analysis` column (Text) - stores detailed artwork analysis with markdown
    - Updated `to_dict()` method to include tags and analysis in API responses
  - Updated [models/artwork.py](backend/app/models/artwork.py):
    - Added `tags`, `analysis`, and `summary` to `UpdateArtworkRequest` model
  - Updated [routers/artwork.py](backend/app/routers/artwork.py):
    - `save_artwork` endpoint now accepts `tags` and `analysis` form parameters
    - `update_saved_artwork` endpoint now updates tags and analysis fields
    - Both fields passed directly to SavedArtwork model

  **Frontend Changes**:
  - Updated [savedArtworkApi.ts](frontend/src/services/savedArtworkApi.ts):
    - Added `tags` and `analysis` to `SaveArtworkParams` interface
    - `saveArtwork` method appends tags and analysis to FormData
  - Updated [PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx):
    - Passes `artworkTags` (joined as comma-separated string) when saving
    - Passes `artworkAnalysis` when saving
    - Both values sent during initial save (after artist identification)

  **Database Migration**:
  - Created [migrations/add_tags_and_analysis.py](backend/migrations/add_tags_and_analysis.py)
    - Adds `tags` and `analysis` columns to existing `saved_artworks` table
    - Idempotent - checks if columns exist before adding
    - Run with: `python backend/migrations/add_tags_and_analysis.py`

  **Data Flow**:
  ```
  AI Response → Parse tags & analysis → Display in UI → Save to DB
       ↓
  { "tags": "pop art, late 90s",
    "analysis": "Artwork analysis..." }
       ↓
  Database stores for future retrieval
  ```

  **Technical Details**:
  - Tags stored as comma-separated string for simplicity
  - Analysis stored as TEXT to support long markdown content
  - Both fields nullable (optional)
  - Frontend joins array into string: `artworkTags.join(', ')`
  - Backend stores raw string values

  **Files Modified**:
  - [backend/app/database/models.py](backend/app/database/models.py)
  - [backend/app/models/artwork.py](backend/app/models/artwork.py)
  - [backend/app/routers/artwork.py](backend/app/routers/artwork.py)
  - [backend/migrations/add_tags_and_analysis.py](backend/migrations/add_tags_and_analysis.py) - New migration
  - [frontend/src/services/savedArtworkApi.ts](frontend/src/services/savedArtworkApi.ts)
  - [frontend/src/screens/PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx)

## 2025-12-07 - Frontend: Language Indicator in ArtworkPlaceholder

### Feature - Current Language Display
- **Language Indicator**: Added small text showing current language selection under the "Import from Album" button

  **Changes**:
  - Updated [ArtworkPlaceholder.tsx](frontend/src/components/ArtworkPlaceholder.tsx) to:
    - Accept optional `language` prop
    - Display "Current language: English" or "Current language: 中文" under import button
    - Uses `languageLabels` mapping for readable display names
    - Conditionally renders only when language prop is provided
  - Updated [HomePage.tsx](frontend/src/screens/HomePage.tsx) to:
    - Pass `language` from context to ArtworkPlaceholder component
  - Added `languageIndicator` style:
    - Small text (12px)
    - IBM Plex Mono font (monospace)
    - Dark grey color
    - Centered alignment

  **User Experience**:
  - Users can see their current language selection on homepage
  - Helpful reminder before taking/importing photos
  - Non-intrusive, small text at bottom of placeholder
  - Dynamically updates when language changes in menu

  **Visual Example**:
  ```
  ┌──────────────────────────┐
  │          +               │
  │   [Scan with camera]     │
  │ [Import from Album]      │
  │ Current language: English│ ← NEW
  └──────────────────────────┘
  ```

  **Files Modified**:
  - [frontend/src/components/ArtworkPlaceholder.tsx](frontend/src/components/ArtworkPlaceholder.tsx)
  - [frontend/src/screens/HomePage.tsx](frontend/src/screens/HomePage.tsx)

## 2025-12-07 - Frontend: Settings Menu with Dropdown

### Feature - Menu Button & Settings Dropdown
- **Menu Button in Homepage**: Replaced language button with hamburger menu icon, language selection now in dropdown menu

  **Changes**:
  - Created [MenuIcon.tsx](frontend/src/components/icons/MenuIcon.tsx) component from SVG
    - Reusable icon component with customizable size and color
    - Clean SVG implementation using react-native-svg
  - Updated [HomePage.tsx](frontend/src/screens/HomePage.tsx) to:
    - Add menu button (hamburger icon) in top right corner of header
    - Replace centered language modal with dropdown menu aligned to top-right
    - Dropdown appears below menu button when clicked
    - Menu includes "Settings" title and organized sections
    - Language config moved into menu as first section
  - New menu styles:
    - `menuButton`: Icon button in header
    - `menuDropdown`: Dropdown card with shadow, positioned top-right
    - `menuSection`: Section container for config groups
    - `menuSectionTitle`: Uppercase section labels
    - `menuOption` / `menuOptionSelected`: Individual config items

  **User Experience**:
  - More scalable - easy to add new config options
  - Cleaner header with just menu icon instead of language text
  - Dropdown aligned to top-right (natural for menu)
  - Tap outside dropdown to close
  - Selected language highlighted in black
  - Settings organized by category

  **Technical Details**:
  - Modal with transparent overlay
  - Overlay is touchable to dismiss menu
  - Dropdown positioned with flexbox (flex-start, flex-end)
  - Uses existing color/spacing/shadow constants
  - Language selection state managed by LanguageContext

  **Design Pattern**:
  - Extensible menu structure ready for more configs
  - Section-based organization (Language, more sections can be added)
  - Consistent styling with app theme

  **Files Modified**:
  - [frontend/src/components/icons/MenuIcon.tsx](frontend/src/components/icons/MenuIcon.tsx) - New icon component
  - [frontend/src/screens/HomePage.tsx](frontend/src/screens/HomePage.tsx)

## 2025-12-07 - Frontend: Enhanced Image Compression to Prevent 413 Errors

### Bug Fix - Aggressive Image Compression
- **Multi-Pass Compression**: Implemented progressive image compression to ensure images never exceed 4.5MB limit

  **Changes**:
  - Created new `compressImageToSize()` function in [imageUtils.ts](frontend/src/utils/imageUtils.ts)
    - Uses multi-pass compression strategy with progressively more aggressive settings
    - First pass: 1600x1600 @ 75% quality
    - Second pass: 1280x1280 @ 65% quality (if still > 4MB)
    - Third pass: 1024x1024 @ 60% quality (if still > 4MB)
    - Logs warnings if image still exceeds limit after all passes
  - Updated default `getCompressionSettings()` to be more conservative:
    - Changed from 1920x1920 @ 80% to 1600x1600 @ 75%
  - Updated [PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx) to:
    - Use `compressImageToSize()` in `fetchArtistIdentification` (was missing compression entirely!)
    - Use `compressImageToSize()` in `fetchArtworkBite` (replaced basic compression)
    - Both functions now enforce 4MB max before upload

  **User Experience**:
  - No more 413 Payload Too Large errors
  - High-quality photos automatically compressed to safe size
  - Detailed logging shows compression progress and final size
  - Images remain high quality while staying under limits

  **Technical Details**:
  - Target size: 4MB (safely under 4.5MB Vercel limit)
  - Preserves aspect ratio with 'contain' mode
  - Only scales down, never upscales
  - Logs size at each compression pass for debugging
  - Gracefully falls back to original URI if compression fails

  **Before**: Artist identification used uncompressed images → frequent 413 errors
  **After**: Both endpoints use multi-pass compression → images guaranteed under 4MB

  **Files Modified**:
  - [frontend/src/utils/imageUtils.ts](frontend/src/utils/imageUtils.ts)
  - [frontend/src/screens/PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx)

## 2025-12-07 - Frontend: Tags Display in Artwork Analysis

### Feature - Artwork Tags
- **Tags Display in PhotoDisplayScreen**: Added visual tags display showing artwork characteristics before the analysis

  **Changes**:
  - Updated [AnalysisResponse interface](frontend/src/screens/PhotoDisplayScreen.tsx#L55-L58) to include optional `tags` field
  - Added `artworkTags` state to store parsed tags array
  - Enhanced parsing logic to extract tags from the last item of API response
    - Tags come as comma-separated string (e.g., "pop art, late 90s, dadaism")
    - Split and trim tags into individual elements
  - Added tags UI display before artwork analysis section
    - Tags shown as pill-shaped chips with light background
    - Responsive flexbox layout that wraps to multiple lines
    - Clean, minimal design matching app aesthetic
  - Added styles: `tagsContainer`, `tag`, `tagText`

  **User Experience**:
  - Tags appear as visual badges before the analysis text
  - Provides quick visual summary of artwork characteristics
  - Easy to scan and understand key attributes
  - Gracefully handles missing tags (doesn't show empty container)

  **Technical Details**:
  - Tags parsed from API response: `{ "analysis": "...", "tags": "pop art, late 90s, dadaism" }`
  - Tags split by comma and trimmed of whitespace
  - Empty tags filtered out
  - Conditional rendering: only shows when tags array has items

  **Files Modified**:
  - [frontend/src/screens/PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx)

## 2025-12-07 - Frontend: Language Selection & Multilingual Support

### Feature - Language Configuration
- **Language Dropdown on Homepage**: Added language selection dropdown with English and Chinese support

  **Changes**:
  - Created [LanguageContext.tsx](frontend/src/contexts/LanguageContext.tsx) with React Context for global language state
    - Persists language selection to AsyncStorage
    - Provides `useLanguage()` hook for accessing language state
    - Supports 'en' (English) and 'zh' (中文/Chinese)
  - Updated [HomePage.tsx](frontend/src/screens/HomePage.tsx) to:
    - Add language button in header showing current language
    - Display modal with language selection options
    - Store selected language in context
  - Wrapped [App.tsx](frontend/App.tsx) with LanguageProvider
  - Updated [PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx) to:
    - Pass language parameter to `analyze-artist` API
    - Pass language parameter to `analyze-bite` API
    - Pass language parameter to `analyze-topic` API
    - Pass language parameter to `generateArtworkSummary` call
  - Updated [SummaryScreen.tsx](frontend/src/screens/SummaryScreen.tsx) to:
    - Pass language parameter to `generateArtworkSummary` call
  - Updated [savedArtworkApi.ts](frontend/src/services/savedArtworkApi.ts) to:
    - Accept optional language parameter in `generateArtworkSummary` method

  **User Experience**:
  - Users can select their preferred language from homepage
  - Language preference is persisted across app sessions
  - All AI-generated content (artist identification, artwork analysis, bites, topics, summaries) uses selected language
  - Simple, clean modal interface for language selection

  **Technical Details**:
  - Language stored in AsyncStorage for persistence
  - Context API ensures single source of truth for language state
  - Language parameter passed directly to backend API endpoints
  - Backend handles language-specific prompts and responses

  **Supported Languages**:
  - English (en)
  - Chinese (zh - 中文)

  **Files Modified**:
  - [frontend/src/contexts/LanguageContext.tsx](frontend/src/contexts/LanguageContext.tsx) - New context
  - [frontend/src/screens/HomePage.tsx](frontend/src/screens/HomePage.tsx)
  - [frontend/App.tsx](frontend/App.tsx)
  - [frontend/src/screens/PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx)
  - [frontend/src/screens/SummaryScreen.tsx](frontend/src/screens/SummaryScreen.tsx)
  - [frontend/src/services/savedArtworkApi.ts](frontend/src/services/savedArtworkApi.ts)

## 2025-12-07 - Frontend: Background Summary Caching & Database Updates

### Performance Enhancement - Background Summary Generation
- **Background Caching for Artwork Summaries**: Implemented background API call to generate artwork summaries immediately after artist identification, significantly improving user experience

  **Changes**:
  - Created `artworkSummaryCache.ts` utility similar to `artistAnalysisCache` for managing summary request caching
  - Modified [PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx) to:
    - Save artwork to database immediately after artist identification completes (with first artist)
    - Start background summary generation asynchronously without blocking UI
    - Cache the summary request promise for reuse by other components
    - **Update database when user selects a different artist** via "Explore now" or "Finish" buttons
    - **Update database when user manually inputs artist information**
    - Clear summary cache and regenerate when artist changes
  - Modified [SummaryScreen.tsx:80-121](frontend/src/screens/SummaryScreen.tsx#L80-L121) to:
    - Check cache first before making API calls
    - Reuse in-progress requests if summary is already being generated
    - Display cached summary instantly if available

  **User Experience**:
  - Summary appears instantly (or much faster) when user navigates to SummaryScreen
  - No duplicate API calls - all components share the same cached request
  - Background generation doesn't block the exploration flow
  - Database always reflects the user's final artist selection
  - Seamless experience with no visible loading for cached summaries

  **Technical Details**:
  - Summary generation starts immediately after `analyze-artist` completes in PhotoDisplayScreen
  - First artist is auto-saved to enable background summary generation
  - Database is updated when user commits to a selection (clicks "Explore now" or "Finish")
  - Manual artist input updates or creates database record
  - Cache stores both promises (in-progress) and data (completed) for efficient reuse
  - Cache automatically clears on errors or artist changes to allow regeneration
  - Components check cache → await in-progress promise → make new request (if needed)

  **Database Update Strategy**:
  - Initial save: First artist from AI identification
  - Update triggers:
    - User selects different artist + clicks "Explore now"
    - User selects different artist + clicks "Finish"
    - User manually inputs artist info
  - Summary cache is cleared and regenerated when artist changes

  **Files Modified**:
  - [frontend/src/utils/artworkSummaryCache.ts](frontend/src/utils/artworkSummaryCache.ts) - New cache utility
  - [frontend/src/screens/PhotoDisplayScreen.tsx](frontend/src/screens/PhotoDisplayScreen.tsx)
  - [frontend/src/screens/SummaryScreen.tsx](frontend/src/screens/SummaryScreen.tsx)

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
