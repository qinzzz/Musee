import { API_BASE_URL, fetchWithTimeout } from './core';

export async function defineAestheticTerm(tag: string): Promise<{ definition: string; externalResonances: string[] }> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/define-aesthetic-term`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `define-aesthetic-term failed: ${response.status}`);
  }
  const data = await response.json();
  return {
    definition: data.definition ?? '',
    externalResonances: data.externalResonances ?? [],
  };
}

export function base64ToFile(base64: string, filename = 'image.jpg'): File {
  if (!base64 || !base64.includes(',')) {
    throw new Error('Invalid base64 data URL format');
  }

  const arr = base64.split(',');
  if (arr.length < 2 || !arr[1]) {
    throw new Error('Base64 data URL missing content');
  }

  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
