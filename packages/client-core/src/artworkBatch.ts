export type ArtworkBatchStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'analyzing'
  | 'complete'
  | 'upload_failed'
  | 'analysis_failed';

export type ArtworkBatchEntry<TInput, TPersisted, TResult> = {
  id: string;
  input: TInput;
  status: ArtworkBatchStatus;
  persisted?: TPersisted;
  result?: TResult;
  error?: unknown;
};

export type ArtworkBatchOperations<TInput, TPersisted, TResult> = {
  upload: (input: TInput) => Promise<TPersisted>;
  analyze: (persisted: TPersisted) => Promise<TResult>;
};

export type ArtworkBatchTransition<TInput, TPersisted, TResult> = (
  entry: ArtworkBatchEntry<TInput, TPersisted, TResult>,
  index: number,
  entries: ArtworkBatchEntry<TInput, TPersisted, TResult>[],
) => void;

function replaceEntry<TInput, TPersisted, TResult>(
  entries: ArtworkBatchEntry<TInput, TPersisted, TResult>[],
  index: number,
  entry: ArtworkBatchEntry<TInput, TPersisted, TResult>,
  onTransition?: ArtworkBatchTransition<TInput, TPersisted, TResult>,
): ArtworkBatchEntry<TInput, TPersisted, TResult>[] {
  const next = entries.map((current, currentIndex) => currentIndex === index ? entry : current);
  onTransition?.(entry, index, next);
  return next;
}

async function uploadEntry<TInput, TPersisted, TResult>(
  entry: ArtworkBatchEntry<TInput, TPersisted, TResult>,
  operations: ArtworkBatchOperations<TInput, TPersisted, TResult>,
  transition: (entry: ArtworkBatchEntry<TInput, TPersisted, TResult>) => void,
): Promise<ArtworkBatchEntry<TInput, TPersisted, TResult>> {
  let next: ArtworkBatchEntry<TInput, TPersisted, TResult> = {
    ...entry,
    status: 'uploading',
    error: undefined,
  };
  transition(next);
  try {
    next = {
      ...next,
      persisted: await operations.upload(entry.input),
      status: 'uploaded',
    };
  } catch (error) {
    next = { ...next, error, status: 'upload_failed' };
  }
  transition(next);
  return next;
}

async function analyzeEntry<TInput, TPersisted, TResult>(
  entry: ArtworkBatchEntry<TInput, TPersisted, TResult>,
  operations: ArtworkBatchOperations<TInput, TPersisted, TResult>,
  transition: (entry: ArtworkBatchEntry<TInput, TPersisted, TResult>) => void,
): Promise<ArtworkBatchEntry<TInput, TPersisted, TResult>> {
  if (!entry.persisted) return entry;
  let next: ArtworkBatchEntry<TInput, TPersisted, TResult> = {
    ...entry,
    status: 'analyzing',
    error: undefined,
  };
  transition(next);
  try {
    next = {
      ...next,
      result: await operations.analyze(entry.persisted),
      status: 'complete',
    };
  } catch (error) {
    next = { ...next, error, status: 'analysis_failed' };
  }
  transition(next);
  return next;
}

export async function runArtworkBatch<TInput, TPersisted, TResult>(
  initialEntries: ArtworkBatchEntry<TInput, TPersisted, TResult>[],
  operations: ArtworkBatchOperations<TInput, TPersisted, TResult>,
  onTransition?: ArtworkBatchTransition<TInput, TPersisted, TResult>,
): Promise<ArtworkBatchEntry<TInput, TPersisted, TResult>[]> {
  let entries = [...initialEntries];

  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].status !== 'queued' && entries[index].status !== 'upload_failed') continue;
    const uploaded = await uploadEntry(entries[index], operations, (entry) => {
      entries = replaceEntry(entries, index, entry, onTransition);
    });
    entries = replaceEntry(entries, index, uploaded);
  }

  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].status !== 'uploaded' && entries[index].status !== 'analysis_failed') continue;
    const analyzed = await analyzeEntry(entries[index], operations, (entry) => {
      entries = replaceEntry(entries, index, entry, onTransition);
    });
    entries = replaceEntry(entries, index, analyzed);
  }

  return entries;
}

export async function retryArtworkBatchEntry<TInput, TPersisted, TResult>(
  initialEntry: ArtworkBatchEntry<TInput, TPersisted, TResult>,
  operations: ArtworkBatchOperations<TInput, TPersisted, TResult>,
  onTransition?: (entry: ArtworkBatchEntry<TInput, TPersisted, TResult>) => void,
): Promise<ArtworkBatchEntry<TInput, TPersisted, TResult>> {
  let entry = initialEntry;
  if (entry.status === 'upload_failed' || (!entry.persisted && entry.status === 'queued')) {
    entry = await uploadEntry(entry, operations, (next) => onTransition?.(next));
  }
  if (entry.status === 'uploaded' || entry.status === 'analysis_failed') {
    entry = await analyzeEntry(entry, operations, (next) => onTransition?.(next));
  }
  return entry;
}
