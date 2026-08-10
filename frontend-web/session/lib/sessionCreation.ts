export const MAX_INITIAL_SESSION_TITLE_LENGTH = 60;

export function buildInitialSessionTitle(message: string, fallbackTitle: string): string {
  const normalizedMessage = message.replace(/\s+/g, ' ').trim();
  if (!normalizedMessage) return fallbackTitle;
  if (normalizedMessage.length <= MAX_INITIAL_SESSION_TITLE_LENGTH) return normalizedMessage;
  return normalizedMessage.slice(0, MAX_INITIAL_SESSION_TITLE_LENGTH).trimEnd();
}
