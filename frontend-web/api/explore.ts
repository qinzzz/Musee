import type { ArtworkSkill } from '../types';
import { API_BASE_URL, fetchWithTimeout, getLanguage, getOrCreateUserId } from './core';

const skillsCache = new Map<string, Promise<Omit<ArtworkSkill, 'id' | 'observations' | 'more'>[]>>();
const observationCache = new Map<string, Promise<string>>();
const deepDiveCache = new Map<string, Promise<{ text: string; question: string }>>();

function compressImageToFile(photoUri: string, maxDimension = 1024, maxKB = 900): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (Math.max(width, height) > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const tryQuality = (quality: number) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('compression failed'));
            return;
          }
          if (blob.size <= maxKB * 1024 || quality <= 0.25) {
            resolve(new File([blob], 'artwork.jpg', { type: 'image/jpeg' }));
          } else {
            tryQuality(Math.max(quality - 0.2, 0.25));
          }
        }, 'image/jpeg', quality);
      };
      tryQuality(0.8);
    };
    img.onerror = reject;
    img.src = photoUri;
  });
}

async function appendImageToFormData(formData: FormData, photoUri: string): Promise<void> {
  if (photoUri.startsWith('data:') || photoUri.startsWith('blob:')) {
    formData.append('image', await compressImageToFile(photoUri));
  } else {
    formData.append('photo_uri', photoUri);
  }
}

export function selectArtworkSkills(
  photoUri: string,
  artistName?: string,
  artworkName?: string,
): Promise<Omit<ArtworkSkill, 'id' | 'observations' | 'more'>[]> {
  const cacheKey = `${photoUri}||${artistName ?? ''}||${artworkName ?? ''}`;
  if (skillsCache.has(cacheKey)) return skillsCache.get(cacheKey)!;

  const promise = (async () => {
    const formData = new FormData();
    await appendImageToFormData(formData, photoUri);
    const lang = getLanguage();
    if (lang) formData.append('language', lang);
    if (artistName) formData.append('artist_name', artistName);
    if (artworkName) formData.append('artwork_name', artworkName);

    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-explore-skills`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`artwork-explore-skills error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    return data.skills ?? [];
  })();

  promise.catch(() => skillsCache.delete(cacheKey));
  skillsCache.set(cacheKey, promise);
  return promise;
}

export function fetchSkillObservation(
  skillName: string,
  skillDesc: string,
  prevObservations: string[],
  photoUri: string,
  artworkId?: string,
): Promise<string> {
  const cacheKey = prevObservations.length === 0 ? `${skillName}||${photoUri}` : null;
  if (cacheKey && observationCache.has(cacheKey)) return observationCache.get(cacheKey)!;

  const promise = (async () => {
    const formData = new FormData();
    formData.append('skill_name', skillName);
    formData.append('skill_desc', skillDesc);
    await appendImageToFormData(formData, photoUri);
    if (prevObservations.length > 0) {
      formData.append('prev_observations', JSON.stringify(prevObservations));
    }
    const lang = getLanguage();
    if (lang) formData.append('language', lang);
    const userId = getOrCreateUserId();
    if (userId) formData.append('user_id', userId);
    if (artworkId) formData.append('artwork_id', artworkId);

    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-skill-observation`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`artwork-skill-observation error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    return data.observation ?? '';
  })();

  if (cacheKey) {
    promise.catch(() => observationCache.delete(cacheKey));
    observationCache.set(cacheKey, promise);
  }
  return promise;
}

export function fetchSkillDeepDive(
  skillName: string,
  skillDesc: string,
  photoUri: string,
  artworkId?: string,
): Promise<{ text: string; question: string }> {
  const cacheKey = `${skillName}||${photoUri}`;
  if (deepDiveCache.has(cacheKey)) return deepDiveCache.get(cacheKey)!;

  const promise = (async () => {
    const formData = new FormData();
    formData.append('skill_name', skillName);
    formData.append('skill_desc', skillDesc);
    await appendImageToFormData(formData, photoUri);
    const lang = getLanguage();
    if (lang) formData.append('language', lang);
    const userId = getOrCreateUserId();
    if (userId) formData.append('user_id', userId);
    if (artworkId) formData.append('artwork_id', artworkId);

    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-skill-deepdive`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`artwork-skill-deepdive error (${response.status}): ${errorText}`);
    }
    return response.json();
  })();

  promise.catch(() => deepDiveCache.delete(cacheKey));
  deepDiveCache.set(cacheKey, promise);
  return promise;
}

export async function prefetchExploreDataWithContext(
  photoUri: string,
  artistName?: string,
  artworkName?: string,
): Promise<void> {
  try {
    const skills = await selectArtworkSkills(photoUri, artistName, artworkName);
    await Promise.all(skills.map((skill) => fetchSkillObservation(skill.name, skill.desc, [], photoUri)));
  } catch {
    // Silent retry-on-demand behavior
  }
}
