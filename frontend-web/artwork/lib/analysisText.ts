export function parseAnalysis(text: string | null): string {
  if (!text) return '';

  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed) && parsed.length > 0) {
        if (parsed[0]?.analysis) return parsed[0].analysis;
        if (typeof parsed[0] === 'string') return parsed[0];
      } else if (parsed && typeof parsed === 'object' && 'analysis' in parsed) {
        const value = (parsed as { analysis?: unknown }).analysis;
        if (typeof value === 'string') return value;
      }
    } catch (error) {
      console.warn('Analysis parsing ignored:', error);
    }
  }

  const dateMatch = trimmed.match(/^Date:\s*(.+)$/im);
  const mediumMatch = trimmed.match(/^Medium:\s*(.+)$/im);

  let cleaned = trimmed
    .replace(/^Date:\s*.+$/gim, '')
    .replace(/^Medium:\s*.+$/gim, '')
    .trim();

  cleaned = cleaned.replace(/^Analysis:\s*/i, '').trim();

  if (!cleaned && (dateMatch || mediumMatch)) {
    cleaned = trimmed;
  }

  return cleaned;
}
