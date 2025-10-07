# AI Prompts Directory

This directory contains all AI prompts used by the Musee application. Prompts are stored as plain text files for easy editing and version control.

## Directory Structure

```
prompts/
├── README.md                      # This file
├── artist_identification.txt      # Prompt for identifying artists from artwork
├── artwork_analysis.txt           # Base template for artwork analysis
└── tones/                         # Tone-specific instructions
    ├── professional.txt           # Scholarly, academic tone
    ├── general.txt                # Accessible, everyday language
    ├── sarcastic.txt              # Witty, humorous tone
    ├── educational.txt            # Teaching-focused explanations
    └── poetic.txt                 # Artistic, emotional language
```

## Prompt Files

### artist_identification.txt

**Purpose**: Identify the artist and artwork from an uploaded photo

**Features**:
- Generates confidence scores for artist identification
- Provides top 3 most likely artists
- Includes metadata extraction (title, time period, style, etc.)
- Structured output format for easy parsing

**Used by**: `/artwork/analyze-artist` API endpoint

**Example Output**:
```
### Potential Artists
- Wassily Kandinsky (confidence score 8/10): Abstract geometric forms and vibrant color palette characteristic of his non-objective style
- Joan Miró (confidence score 6/10): Playful abstract elements similar to his surrealist period
- Paul Klee (confidence score 5/10): Geometric abstraction with similar color harmonies
```

### artwork_analysis.txt

**Purpose**: Base template for analyzing artwork with different tones

**Features**:
- Contains placeholder `{tone_instruction}` for dynamic tone insertion
- Defines analysis structure (observations, style, context, symbolism)
- Approximately 200-300 word responses
- Maintains consistency across all tones

**Used by**: `/artwork/analyze` API endpoint

**How it works**:
1. System loads `artwork_analysis.txt`
2. System loads appropriate tone file from `tones/`
3. System replaces `{tone_instruction}` with tone content
4. Complete prompt is sent to AI service

## Tone Files

### professional.txt
**Use case**: Museum curators, art historians, academic contexts
**Style**: Scholarly, uses art terminology, authoritative
**Audience**: Art professionals and experts

### general.txt
**Use case**: General public, museum visitors, casual learners
**Style**: Accessible, clear language, easy to understand
**Audience**: Anyone interested in art

### sarcastic.txt
**Use case**: Entertaining content, social media, comedy
**Style**: Witty, humorous, playful observations
**Audience**: People wanting entertaining art commentary

### educational.txt
**Use case**: Students, art classes, learning contexts
**Style**: Teaching-focused, explains techniques, provides learning points
**Audience**: Students and learners

### poetic.txt
**Use case**: Creative content, emotional connections, artistic appreciation
**Style**: Beautiful language, evocative, metaphorical
**Audience**: Art enthusiasts seeking emotional engagement

## Editing Prompts

### How to Edit

1. Open the relevant `.txt` file
2. Make your changes
3. Save the file
4. Restart the backend server (prompts are cached)

### Best Practices

- **Be Clear**: Write clear, specific instructions
- **Test Thoroughly**: Test with multiple images after changes
- **Version Control**: Commit prompt changes with descriptive messages
- **Document Changes**: Note major changes in git commit messages
- **A/B Testing**: Keep old versions to compare performance

### Formatting Guidelines

- Use clear paragraph breaks
- Use bullet points for lists
- Use markdown-style headers (###) if needed
- Keep placeholders in `{curly_braces}` format
- End files with a newline

## Adding New Tones

To add a new tone (e.g., "humorous"):

1. **Create tone file**: `tones/humorous.txt`
   ```
   Describe this artwork with a lighthearted, amusing approach.
   Make jokes and funny observations while still being informative.
   Keep it family-friendly and enjoyable.
   ```

2. **Update model**: In `backend/app/models/artwork.py`
   ```python
   class ToneType(str, Enum):
       ...
       HUMOROUS = "humorous"
   ```

3. **That's it!** The system automatically loads the new tone

No code changes needed - the prompt loader handles everything automatically.

## Technical Details

### Loading System

Prompts are loaded by `backend/app/utils/prompt_loader.py`:

```python
from app.utils.prompt_loader import (
    get_artist_identification_prompt,
    get_artwork_analysis_prompt
)

# Load artist identification prompt
artist_prompt = get_artist_identification_prompt()

# Load artwork analysis prompt with tone
from app.models.artwork import ToneType
analysis_prompt = get_artwork_analysis_prompt(ToneType.PROFESSIONAL)
```

### Caching

Prompts are cached using `@lru_cache` decorator:
- Files are read once at first access
- Subsequent accesses use cached version
- Improves performance significantly
- Cache clears on server restart

### Error Handling

The system handles:
- Missing prompt files (raises `FileNotFoundError`)
- Read errors (raises `IOError`)
- Invalid tone types (raises `ValueError`)

## Prompt Engineering Tips

### For Artist Identification

1. **Specificity**: Request specific attributes (style, technique, period)
2. **Confidence Levels**: Define clear confidence scoring criteria
3. **Output Format**: Specify exact output structure for parsing
4. **Edge Cases**: Handle unknown artists, multiple styles, modern art

### For Artwork Analysis

1. **Length Control**: Specify target word count
2. **Structure**: Define clear sections for analysis
3. **Tone Consistency**: Ensure tone instructions match desired output
4. **Context**: Request historical and cultural context
5. **Symbolism**: Ask for symbolic interpretation where relevant

## Examples

### Good Prompt Structure
```
# Identity
You are [role]. Your goal is to [objective].

# Instructions
[Clear, numbered instructions]
- Specific requirement 1
- Specific requirement 2

# Output Format
[Exact format specification with examples]
```

### Bad Prompt Structure
```
Analyze this artwork and tell me about it.
Be creative and informative.
```

## Testing Changes

After editing prompts:

1. **Start server**: `uvicorn app.main:app --reload`
2. **Test endpoint**:
   ```bash
   curl -X POST "http://localhost:8000/artwork/analyze" \
     -F "image=@test.jpg" \
     -F "tone=professional"
   ```
3. **Check output**: Verify formatting and content
4. **Test all tones**: Ensure consistency across tones

## Versioning

Consider using git tags for major prompt changes:

```bash
git add backend/app/prompts/
git commit -m "Update artist identification prompt - improved confidence scoring"
git tag -a prompt-v1.1 -m "Artist ID prompt v1.1"
git push --tags
```

## Performance Considerations

- **File Size**: Keep prompts concise but complete
- **Tokens**: Longer prompts = more API tokens used
- **Caching**: First request is slower (file read), subsequent requests are fast
- **Updates**: Require server restart for cache refresh

## Internationalization (Future)

Structure for multiple languages:

```
prompts/
├── en/
│   ├── artist_identification.txt
│   └── tones/
│       └── general.txt
├── es/
│   ├── artist_identification.txt
│   └── tones/
│       └── general.txt
└── fr/
    └── ...
```

## Related Documentation

- [IMPLEMENTATION_SUMMARY.md](../../../IMPLEMENTATION_SUMMARY.md) - Full implementation details
- [PROMPT_REFACTORING.md](../../../PROMPT_REFACTORING.md) - Refactoring documentation
- [QUICK_START.md](../../../QUICK_START.md) - Setup and usage guide

## Troubleshooting

**Problem**: Changes not reflected after editing
**Solution**: Restart the backend server to clear the cache

**Problem**: FileNotFoundError when starting server
**Solution**: Ensure all required .txt files exist in the prompts directory

**Problem**: Poor AI responses
**Solution**: Review and refine prompt instructions, test with different models

**Problem**: Inconsistent output format
**Solution**: Make output format instructions more explicit in the prompt

## Contributing

When contributing prompt changes:

1. Test thoroughly with multiple images
2. Document the reasoning for changes
3. Consider impact on all AI providers (OpenAI, Claude, Gemini)
4. Update this README if adding new prompt types
5. Include examples in commit message

## Support

For questions or issues with prompts:
- Check this README first
- Review [PROMPT_REFACTORING.md](../../../PROMPT_REFACTORING.md)
- Test with the `/docs` API documentation
- Report issues with specific examples
