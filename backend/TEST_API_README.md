# API Test Suite Documentation

Comprehensive test suite for all Musee backend API endpoints.

## Features

✅ Tests all 24 API endpoints
✅ Supports dev (localhost) and deployed production modes
✅ Automatically selects random images from your museum photos
✅ Creates test data and cleans up after itself
✅ Color-coded output with detailed error messages
✅ Comprehensive test coverage with pass/fail/skip reporting

## Prerequisites

1. **Python virtual environment** (already set up)
2. **Test images directory** containing artwork photos
3. **Backend server running** (for dev mode)

## Setup

### 1. Create Test Images Directory

```bash
# Create the directory if it doesn't exist
mkdir -p ~/Pictures/museum\ images

# Or use any existing directory with artwork photos
```

Add some artwork images (JPG, PNG, or WebP format) to this directory.

### 2. Activate Virtual Environment

```bash
cd backend
source venv/bin/activate
```

### 3. Install Dependencies (if needed)

Dependencies should already be installed from `requirements.txt`, but if needed:

```bash
pip install aiohttp
```

## Usage

### Development Mode (Local Server)

Test your local development server running on `localhost:8000`:

```bash
# Make sure your backend server is running first
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# In another terminal, run the tests
source venv/bin/activate
python testing/test_api.py --mode dev
```

### Production Mode (Railway)

Test the deployed Railway API by supplying its public backend URL:

```bash
python testing/test_api.py --mode prod --url https://your-service.up.railway.app
```

### Verbose Mode

Get detailed information about each test, including **LLM response previews**:

```bash
python testing/test_api.py --mode dev --verbose
```

**Verbose mode shows:**
- Which image file is being used for each test
- Response data from successful requests
- **Complete LLM-generated content** (full responses, no truncation)
  - Artist analysis
  - Artwork bites
  - Summaries
  - Topic suggestions
- Full error messages for failures

**Example verbose output:**
```
✓ PASS | POST /api/analyze-artist
  → Model: openai
  ╭─ LLM Response ─────────────────────────────────────
  │ Based on the image analysis, this appears to be a
  │ painting by Vincent van Gogh. The distinctive
  │ swirling brushstrokes and vibrant color palette are
  │ characteristic of his post-impressionist style...
  ╰────────────────────────────────────────────────────
```

### Custom Image Directory

Use a different directory for test images:

```bash
python testing/test_api.py --mode dev --images ~/Desktop/art_photos
```

### LLM-Only Mode

Test only the AI-powered endpoints (faster, avoids rate limits):

```bash
python testing/test_api.py --mode dev --llm --verbose
```

**LLM endpoints tested:**
- `POST /api/analyze-artist` - Artist identification
- `POST /api/analyze-bite` - Artwork bite/insight
- `GET /api/analyze-topic` - Topic suggestions
- `POST /api/artwork-summary` - Summary generation

**Smart Test Setup:**
- 🎯 Automatically fetches existing artwork from database
- 🔄 Uses random existing artwork for topic/summary tests
- ✅ All 4 LLM tests run successfully (no skips!)
- 🛡️ Won't delete existing artworks during cleanup

**Benefits:**
- ⚡ **Faster** - Only runs 4 tests instead of 22
- 💰 **Cost-effective** - Avoids unnecessary AI API calls
- 🎯 **Focused** - Perfect for testing prompt changes
- 📊 **LLM output** - Combine with `--verbose` to see AI responses
- 🗄️ **Uses real data** - Tests against actual saved artworks

**Example output:**
```
======================================================================
Musee API Test Suite
[LLM Tests Only]
======================================================================
Mode: DEV
Base URL: http://localhost:8000
Image Directory: /Users/you/Pictures/museum images
Test Filter: LLM-calling endpoints only
----------------------------------------------------------------------

Fetching existing artwork for LLM tests...
✓ Using existing artwork (ID: a1b2c3d4...)

⊘ SKIP | GET /  (Non-LLM test)
⊘ SKIP | GET /health  (Non-LLM test)
✓ PASS | POST /api/analyze-artist
  → Model: openai
  ╭─ LLM Response ─────────────────────────────────────
  │ Based on the painting's style...
  ╰────────────────────────────────────────────────────
✓ PASS | POST /api/analyze-bite
✓ PASS | GET /api/analyze-topic
✓ PASS | POST /api/artwork-summary
...

Total: 22  |  Passed: 4  |  Skipped: 18
Success Rate: 100%
```

## Test Coverage

The test suite covers all API endpoints:

### Root Endpoints
- ✓ `GET /` - Root endpoint
- ✓ `GET /health` - Health check

### Configuration Endpoints
- ✓ `GET /api/providers` - List available AI providers
- ✓ `GET /api/identities` - List available AI identities

### User Management
- ✓ `POST /api/users` - Create user
- ✓ `GET /api/users/{user_id}` - Get user by ID
- ✓ `GET /api/users/by-device/{device_id}` - Get user by device
- ✓ `PUT /api/users/{user_id}` - Update user
- ✓ `DELETE /api/users/{user_id}` - Delete user

### Artwork Analysis
- ✓ `POST /api/analyze` - Analyze artwork (streaming)
- ✓ `POST /api/analyze-artist` - Identify artist
- ✓ `POST /api/analyze-bite` - Get artwork bite
- ✓ `GET /api/analyze-topic` - Suggest topics
- ✓ `POST /api/artwork-summary` - Generate summary
- ✓ `POST /api/remove-background` - Remove image background

### Saved Artworks
- ✓ `POST /api/saved-artworks` - Save artwork
- ✓ `GET /api/saved-artworks` - List saved artworks
- ✓ `GET /api/saved-artworks/{artwork_id}` - Get artwork details
- ✓ `PUT /api/saved-artworks/{artwork_id}` - Update artwork
- ✓ `DELETE /api/saved-artworks/{artwork_id}` - Delete artwork

## Test Flow

The test suite follows a logical sequence:

1. **Setup Phase**
   - Tests basic endpoints (health, providers, identities)
   - Creates a test user

2. **Testing Phase**
   - Tests artwork analysis endpoints
   - Creates saved artwork entries
   - Tests artwork operations (update, bite, topics, summary)

3. **Cleanup Phase**
   - Deletes test artwork
   - Deletes test user

## Output Examples

### Successful Test Run

```
======================================================================
Musee API Test Suite
======================================================================
Mode: DEV
Base URL: http://localhost:8000
Image Directory: /Users/you/Pictures/museum images
----------------------------------------------------------------------

✓ PASS | GET /
  → Version: 1.0.0
✓ PASS | GET /health
  → Provider: openai, DB: True
✓ PASS | GET /api/providers
  → Providers: openai, claude, gemini
...

----------------------------------------------------------------------
Test Summary
----------------------------------------------------------------------
Total:   24
Passed:  22
Failed:  0
Skipped: 2

Success Rate: 91.7%
======================================================================
```

### Understanding Test Results

- **✓ PASS** (Green) - Test passed successfully
- **✗ FAIL** (Red) - Test failed with an error
- **⊘ SKIP** (Yellow) - Test was skipped (e.g., missing dependencies, no images)

## Common Issues

### No Images Available

```
⊘ SKIP | POST /api/analyze
  → No images available
```

**Solution**: Add artwork images to `~/Pictures/museum images` or specify a different directory with `--images`.

### PhotoRoom API Not Configured

```
⊘ SKIP | POST /api/remove-background
  → PhotoRoom API key not configured
```

**Solution**: This is expected if you haven't set up PhotoRoom. The test will skip this endpoint.

### Connection Refused (Dev Mode)

```
✗ FAIL | GET /health
  → Cannot connect to host localhost:8000
```

**Solution**: Make sure your backend server is running:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Missing Production URL

```
Error: Production mode requires --url with the deployed Railway backend URL.
```

**Solution**: Provide the public Railway backend URL, not the frontend URL:
```bash
python testing/test_api.py --mode prod --url https://your-service.up.railway.app
```

## CI/CD Integration

You can integrate this test suite into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run API Tests
  run: |
    cd backend
    source venv/bin/activate
    python testing/test_api.py --mode dev
```

## Advanced Usage

### Testing Specific Endpoints

Edit the `test_sequence` list in `test_api.py` to comment out tests you don't want to run.

### Adding Custom Tests

To add a new test:

1. Create a new test method following the pattern:
```python
async def test_your_endpoint(self):
    """Test description"""
    try:
        # Your test logic here
        self.log_test("Your Test Name", "PASS")
    except Exception as e:
        self.log_test("Your Test Name", "FAIL", str(e))
```

2. Add it to the `test_sequence` list in `run_all_tests()`.

## Debugging

Enable verbose mode to see detailed information:

```bash
python testing/test_api.py --mode dev --verbose
```

This will show:
- Which image file is being used for each test
- Response data from successful requests
- Full error messages for failures

## Notes

- **Test Data**: The script creates temporary test data (users, artworks) and cleans them up after testing
- **Non-Destructive**: The script doesn't modify existing data
- **Database**: Tests will create entries in your database, which are cleaned up at the end
- **Rate Limits**: Be mindful of AI provider rate limits when running tests frequently
- **Streaming Tests**: The streaming test (`/api/analyze`) only reads a few chunks to verify it works

## Support

If you encounter issues:

1. Check that your backend server is running (dev mode)
2. Verify your Railway backend URL is correct (prod mode); `www.museelab.com` is the frontend
3. Ensure you have test images available
4. Check that all dependencies are installed
5. Run with `--verbose` for detailed error messages

## License

Part of the Musee project.
