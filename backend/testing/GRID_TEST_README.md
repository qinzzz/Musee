# Grid Testing Framework

## Overview

The grid testing framework enables parameterized testing of LLM-calling APIs with multiple parameter variations. This ensures that AI-powered endpoints work correctly across different configurations (e.g., different languages).

## Features

- **Automatic Parameter Variation**: Run the same test with different parameters automatically
- **Language Support**: Currently supports testing with `english` and `chinese` language parameters
- **LLM Endpoint Coverage**: Applies to all AI-powered endpoints:
  - `POST /api/analyze-artist`
  - `POST /api/analyze-bite`
  - `GET /api/analyze-topic`
  - `POST /api/artwork-summary`

## Usage

### Basic Grid Testing

Run all tests with grid mode enabled:

```bash
python testing/test_api.py --mode dev --grid --verbose
```

### Grid Testing + LLM-Only Mode

For faster testing, combine grid testing with LLM-only mode (skips non-LLM endpoints):

```bash
python testing/test_api.py --mode dev --llm --grid --verbose
```

### Production Testing

Test production API with grid mode:

```bash
python testing/test_api.py --mode prod --url https://your-api.vercel.app --grid --verbose
```

## How It Works

### 1. Configuration

The `--grid` flag enables grid testing mode:

```python
@dataclass
class TestConfig:
    grid_test: bool = False  # Enable grid testing with parameter variations
```

### 2. Test Parameterization

Each LLM test method accepts a `language` parameter:

```python
async def test_analyze_artist(self, language: str = "english"):
    # Test implementation with language parameter
    if self.config.grid_test:
        data.add_field('language', language)
```

### 3. Test Execution

When grid mode is enabled, each LLM test runs multiple times:

```python
grid_languages = ["english", "chinese"] if self.config.grid_test else [None]

for section_name, test_func, is_llm_test in test_sequence:
    if is_llm_test and self.config.grid_test:
        for language in grid_languages:
            await test_func(language=language)
    else:
        await test_func()
```

### 4. Test Naming

Test names include the parameter value for clarity:

```
✓ PASS | POST /api/analyze-artist [english]
✓ PASS | POST /api/analyze-artist [chinese]
✓ PASS | POST /api/analyze-bite [english]
✓ PASS | POST /api/analyze-bite [chinese]
```

## Extending Grid Parameters

To add more parameter variations:

1. **Add parameter to grid list**:
```python
grid_languages = ["english", "chinese", "spanish", "french"]
```

2. **Add new parameter types**:
```python
grid_topics = ["technique", "history", "symbolism"]
grid_providers = ["openai", "claude", "gemini"]

# Run tests with multiple parameter combinations
for language in grid_languages:
    for topic in grid_topics:
        await test_func(language=language, topic=topic)
```

3. **Update test methods** to accept new parameters

## Benefits

1. **Comprehensive Testing**: Ensures functionality works across different configurations
2. **Multilingual Support**: Validates that responses are generated in the requested language
3. **Easy Maintenance**: Single test implementation serves multiple parameter combinations
4. **Clear Reporting**: Parameter values clearly shown in test output
5. **Flexible Execution**: Can be combined with other test modes (`--llm`, `--verbose`)

## Test Output Example

```
======================================================================
Musee API Test Suite
[Grid Test Mode: Testing with multiple parameters]
======================================================================
Mode: DEV
Base URL: http://localhost:8000
Image Directory: testing/images
Grid Parameters: language=[english, chinese]
----------------------------------------------------------------------

✓ PASS | POST /api/analyze-artist [english]
  → Model: gpt-4-vision-preview | Latency: 3.245s
✓ PASS | POST /api/analyze-artist [chinese]
  → Model: gpt-4-vision-preview | Latency: 3.187s
✓ PASS | POST /api/analyze-bite [english]
  → Got bite (model: gpt-4-vision-preview) | Latency: 2.891s
✓ PASS | POST /api/analyze-bite [chinese]
  → Got bite (model: gpt-4-vision-preview) | Latency: 2.934s
✓ PASS | GET /api/analyze-topic [english]
  → Topics: technique, history, symbolism | Latency: 1.234s
✓ PASS | GET /api/analyze-topic [chinese]
  → Topics: 技法, 历史, 象征主义 | Latency: 1.198s
✓ PASS | POST /api/artwork-summary [english]
  → Generated summary (model: gpt-4-vision-preview) | Latency: 2.567s
✓ PASS | POST /api/artwork-summary [chinese]
  → Generated summary (model: gpt-4-vision-preview) | Latency: 2.601s

----------------------------------------------------------------------
Test Summary
----------------------------------------------------------------------
Total:   8
Passed:  8
Failed:  0
Skipped: 0

Success Rate: 100.0%
======================================================================
```

## Notes

- Grid testing increases test execution time proportionally to the number of parameter combinations
- Use `--verbose` flag to see full LLM responses for each parameter variation
- Grid tests automatically use the same test image for consistency across parameter variations
- Compatible with both development (`--mode dev`) and production (`--mode prod`) testing
