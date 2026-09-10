export function formatJournalDate(value: string): string {
  // Treat the backend's calendar date as local, never as a UTC timestamp.
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  }).format(date);
}
