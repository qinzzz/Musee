
import { GoogleGenAI, Type, Chat, Modality } from "@google/genai";
import { AestheticVibe, Message, GalleryItem, TagCoordinate } from "./types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("CRITICAL: GEMINI_API_KEY is not set in environment variables! Direct AI features will fail.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "MISSING_KEY" });

/**
 * Utility to handle API calls with robust exponential backoff for rate limits (429)
 */
async function callWithRetry<T>(fn: () => Promise<T>, retries = 6, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorString = error?.message || "";
    const errorStatus = error?.status;
    const errorCode = error?.code;
    const isRateLimit =
      errorString.includes('429') ||
      errorString.includes('RESOURCE_EXHAUSTED') ||
      errorString.includes('quota') ||
      errorStatus === 429 ||
      errorCode === 429;

    if (isRateLimit && retries > 0) {
      const jitter = Math.random() * 1000;
      const waitTime = delay + jitter;
      console.warn(`Rate limit hit (429/Resource Exhausted). Retrying in ${Math.round(waitTime)}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Exponential backoff: multiply delay by 2 for next attempt
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Ensures we have an image part compatible with the Gemini API.
 * If the input is a remote URL, it attempts to fetch it and convert to base64.
 * If fetch fails (e.g. CORS), it returns a text fallback describing the context.
 */
async function getImagePart(url: string): Promise<any> {
  if (!url) {
    return { text: "[Error: Missing image context]" };
  }

  if (url.startsWith('data:')) {
    try {
      const parts = url.split(',');
      if (parts.length < 2) return { text: "[Error: Malformed image data]" };
      const mimeTypeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
      const data = parts[1];
      return { inlineData: { mimeType, data } };
    } catch (e) {
      return { text: "[Error: Failed to process image data string]" };
    }
  } else {
    try {
      // Attempt to fetch remote image
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const parts = base64.split(',');
      if (parts.length < 2) throw new Error("Conversion failed");
      const mimeTypeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
      const data = parts[1];
      return { inlineData: { mimeType, data } };
    } catch (e) {
      // Graceful fallback for CORS or Network errors
      // We provide a semantic hint so the model can still "talk" about the piece based on its metadata.
      return {
        text: `[Visual Reference Context: The user is viewing an external aesthetic work at ${url}. Direct vision analysis is restricted by browser security (CORS). Please analyze based on the keywords and themes discussed in the conversation.]`
      };
    }
  }
}

export async function analyzeAesthetic(
  base64Image: string,
  existingTags: string[]
): Promise<{ keywords: string[], vibe: AestheticVibe, tagCoordinates: Record<string, TagCoordinate> }> {
  const imagePart = await getImagePart(base64Image);

  const existingTagsContext = existingTags.length > 0
    ? `Existing tags in the gallery are: [${existingTags.join(', ')}].`
    : "This is the first piece in the gallery.";

  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          imagePart,
          {
            text: `Analyze the aesthetic of this image. 
          1. Return exactly 3 keywords/tags (e.g. #minimalist, #zen). 
          2. Determine architectural styling (bg color, padding 1-10, border radius, accent color).
          3. Place the 3 new tags on a 2D semantic map. Coordinates (x, y) must be between -1 and 1.
          ${existingTagsContext}
          If a new tag is semantically similar to an existing one, place it nearby.
          Return everything as a valid JSON object.` },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            tagCoordinates: {
              type: Type.ARRAY,
              description: "A list of tags and their {x, y} coordinates",
              items: {
                type: Type.OBJECT,
                properties: {
                  tag: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER }
                },
                required: ["tag", "x", "y"]
              }
            },
            vibe: {
              type: Type.OBJECT,
              properties: {
                backgroundColor: { type: Type.STRING },
                padding: { type: Type.NUMBER },
                borderRadius: { type: Type.STRING },
                accentColor: { type: Type.STRING }
              },
              required: ["backgroundColor", "padding", "borderRadius", "accentColor"]
            }
          },
          required: ["keywords", "tagCoordinates", "vibe"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    const normalizedKeywords = (result.keywords || []).map((k: string) => k.trim().toLowerCase());
    const normalizedCoords: Record<string, TagCoordinate> = {};
    if (Array.isArray(result.tagCoordinates)) {
      result.tagCoordinates.forEach((item: any) => {
        if (item.tag) {
          normalizedCoords[item.tag.trim().toLowerCase()] = {
            x: Number(item.x) || 0,
            y: Number(item.y) || 0
          };
        }
      });
    }

    return {
      keywords: normalizedKeywords,
      tagCoordinates: normalizedCoords,
      vibe: {
        backgroundColor: result.vibe?.backgroundColor || "#ffffff",
        padding: result.vibe?.padding || 4,
        borderRadius: result.vibe?.borderRadius === 'pill' ? '9999px' : '12px',
        borderType: 'solid',
        accentColor: result.vibe?.accentColor || "#000000"
      }
    };
  });
}

export async function generateSpeech(text: string) {
  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say thoughtfully: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) return null;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioData = decode(base64Audio);
      const audioBuffer = await decodeAudioData(audioData, audioContext, 24000, 1);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      return true;
    } catch (e) {
      console.error("Speech generation failed", e);
      return false;
    }
  });
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export async function defineAestheticTerm(tag: string): Promise<{ definition: string, externalResonances: string[] }> {
  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Explain the aesthetic concept of "${tag}". Provide a concise, poetic definition and 3 examples of famous art movements, architects, or designers associated with this style. Return as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            definition: { type: Type.STRING },
            externalResonances: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["definition", "externalResonances"]
        }
      }
    });
    const result = JSON.parse(response.text || '{}');
    return {
      definition: result.definition || '',
      externalResonances: result.externalResonances || []
    };
  });
}

export async function chatWithArt(imageUrl: string, history: Message[], newMessage: string): Promise<string> {
  const imagePart = await getImagePart(imageUrl);
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    history: history.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    })),
    config: {
      systemInstruction: "You are an AI art curator. Discuss the specific image provided by the user. Use poetic but analytical language."
    }
  });

  const parts = history.length === 0 ? [imagePart, { text: newMessage }] : [{ text: newMessage }];

  return callWithRetry(async () => {
    const result = await chat.sendMessage({ message: parts });
    return result.text || "...";
  });
}

export async function chatWithExhibition(items: GalleryItem[], history: Message[], newMessage: string): Promise<string> {
  const summary = items.map(item => `- Item (keywords: ${item.keywords.join(', ')})`).join('\n');

  const chat: Chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    history: history.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    })),
    config: {
      systemInstruction: `You are the Lead Curator of 'Musee'. 
      You are discussing a collection of ${items.length} works with the user.
      
      The collection includes:
      ${summary}
      
      Analyze themes, visual rhymes, and contrasts across the set. Be insightful and poetic.`,
    }
  });

  const imageParts = history.length === 0 ? await Promise.all(
    items.slice(0, 10).map(item => getImagePart(item.url))
  ) : [];

  const messageParts = [...imageParts, { text: newMessage }];

  return callWithRetry(async () => {
    const result = await chat.sendMessage({ message: messageParts });
    return result.text || "...";
  });
}

export async function getSuggestions(imageUrl: string): Promise<string[]> {
  const imagePart = await getImagePart(imageUrl);
  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          imagePart,
          { text: "Generate 3 short, thought-provoking questions an art curator would ask about this image. Return as a JSON array of strings." }
        ]
      },
      config: { responseMimeType: "application/json" }
    });
    const text = response.text || '[]';
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  });
}
