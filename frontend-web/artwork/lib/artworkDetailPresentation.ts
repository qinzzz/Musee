import type { SessionLink } from '../../types';
import { captureLocationLabel, type CaptureLocationOverride } from '@musee/client-core';
import type { ArtworkClientState } from '../../types';

type ArtworkStreamingFields = {
  artist?: string;
  title?: string;
  date?: string;
  medium?: string;
  description?: string;
};

export function getArtworkDisplayLocation(
  location: unknown,
  canonicalMuseumName?: string | null,
  override?: CaptureLocationOverride | null,
): string | null {
  if (override) return captureLocationLabel(override, canonicalMuseumName);
  const normalizedCanonicalMuseum = canonicalMuseumName?.trim() || null;
  if (!location) return normalizedCanonicalMuseum;

  // A plain string that looks like serialized JSON must never be shown as-is.
  const plainString =
    typeof location === 'string' && !location.trim().startsWith('{') ? location : null;

  try {
    let data: Record<string, unknown> | null = null;
    if (typeof location === 'object') {
      data = location as Record<string, unknown>;
    } else if (typeof location === 'string' && location.trim().startsWith('{')) {
      data = JSON.parse(location) as Record<string, unknown>;
    }

    if (data) {
      const parts = [normalizedCanonicalMuseum || data.museum, data.city, data.country]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
      if (parts.length > 0) return parts.join(', ');
      const raw = data.raw;
      return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
    }

    return normalizedCanonicalMuseum || plainString;
  } catch {
    return normalizedCanonicalMuseum || plainString;
  }
}

export function formatArtworkDisplayDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  try {
    if (dateStr.includes('T')) {
      const dt = new Date(dateStr);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    if (dateStr.includes(', ')) {
      const parts = dateStr.split(', ');
      if (parts.length >= 2) {
        if (parts.length >= 3 && /\d{2}:\d{2}/.test(parts[2])) {
          return `${parts[0]}, ${parts[1]}`;
        }
        return `${parts[0]}, ${parts[1]}`;
      }
    }

    if (dateStr.includes(' ')) {
      const parts = dateStr.split(' ');
      if (parts[0].includes('-')) {
        const dt = new Date(dateStr);
        if (!Number.isNaN(dt.getTime())) {
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }
      if (parts.length >= 3 && parts[1].endsWith(',')) {
        return `${parts[0]} ${parts[1]} ${parts[2]}`;
      }
    }

    const dt = new Date(dateStr);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return dateStr;
  } catch {
    return dateStr;
  }
}

export function parseArtworkStreamingFields(
  item: Pick<ArtworkClientState, 'isAnalyzing' | 'streamingText'>,
): ArtworkStreamingFields | null {
  if (!item.isAnalyzing || !item.streamingText) return null;

  const text = item.streamingText;
  const jsonStart = text.indexOf('{');
  if (jsonStart === -1) return null;

  const json = text.substring(jsonStart);
  const result: ArtworkStreamingFields = {};

  const fields = ['artist', 'title', 'date', 'medium'] as const;
  for (const field of fields) {
    const match = json.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (match) {
      result[field] = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
    }
  }

  const descMatch = json.match(/"description"\s*:\s*"/);
  if (descMatch && descMatch.index !== undefined) {
    const afterQuote = descMatch.index + descMatch[0].length;
    let desc = json.substring(afterQuote);
    let i = 0;
    while (i < desc.length) {
      if (desc[i] === '\\') i += 2;
      else if (desc[i] === '"') {
        desc = desc.substring(0, i);
        break;
      } else {
        i += 1;
      }
    }
    result.description = desc
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function buildArtworkSessionMemberships(
  sessionLinks: SessionLink[] | undefined,
  sessionTitleById?: Record<string, string>,
): Array<{ sessionId: string; title: string }> {
  const seen = new Set<string>();
  return (sessionLinks || []).reduce<Array<{ sessionId: string; title: string }>>((acc, link) => {
    if (!link?.sessionId || seen.has(link.sessionId)) return acc;
    seen.add(link.sessionId);
    acc.push({
      sessionId: link.sessionId,
      title: sessionTitleById?.[link.sessionId]?.trim() || 'Untitled Session',
    });
    return acc;
  }, []);
}
