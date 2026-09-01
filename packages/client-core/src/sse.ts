export type SseMessage = {
  event: string;
  data: string;
};

export type SseParser = {
  push: (chunk: string) => SseMessage[];
  finish: () => SseMessage[];
};

function parseEventBlock(block: string): SseMessage | null {
  let event = 'message';
  const data: string[] = [];

  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }

  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

export function createSseParser(): SseParser {
  let buffer = '';

  function drain(allowIncomplete: boolean): SseMessage[] {
    const normalized = buffer
      .replace(/\r\n/g, '\n')
      .replace(allowIncomplete ? /\r/g : /\r(?!$)/g, '\n');
    const blocks = normalized.split('\n\n');
    buffer = allowIncomplete ? '' : (blocks.pop() ?? '');
    return blocks
      .map(parseEventBlock)
      .filter((message): message is SseMessage => message !== null);
  }

  return {
    push(chunk) {
      buffer += chunk;
      return drain(false);
    },
    finish() {
      if (!buffer.trim()) {
        buffer = '';
        return [];
      }
      buffer += '\n\n';
      return drain(true);
    },
  };
}
