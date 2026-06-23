import type { LocationInfo } from '../types';

const MUSEUM_OSM_VALUES = new Set(['museum', 'gallery', 'arts_centre', 'art_gallery', 'exhibition_centre']);

async function findMuseumNearby(lat: number, lon: number, radius = 400): Promise<string> {
  const query =
    `[out:json][timeout:6];` +
    `(node["tourism"~"^(museum|gallery|arts_centre)$"](around:${radius},${lat},${lon});` +
    `way["tourism"~"^(museum|gallery|arts_centre)$"](around:${radius},${lat},${lon});` +
    `relation["tourism"~"^(museum|gallery|arts_centre)$"](around:${radius},${lat},${lon}););` +
    'out center;';
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
    });
    const json = await res.json();
    const elements: Array<{ center?: { lat?: number; lon?: number }; lat?: number; lon?: number; tags?: { name?: string } }> = json.elements ?? [];
    if (!elements.length) return '';
    const distSq = (el: { center?: { lat?: number; lon?: number }; lat?: number; lon?: number }) => {
      const center = el.center ?? el;
      const dlat = (center.lat ?? lat) - lat;
      const dlon = (center.lon ?? lon) - lon;
      return dlat * dlat + dlon * dlon;
    };
    const nearest = elements.reduce((a, b) => (distSq(a) <= distSq(b) ? a : b));
    return nearest.tags?.name ?? '';
  } catch {
    return '';
  }
}

export function createLocationResolver() {
  const cache = new Map<string, LocationInfo>();

  return async function resolveMuseum(lat: number, lon: number): Promise<LocationInfo> {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    let city = '';
    let country = '';
    let museum = '';

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2`,
        { headers: { 'User-Agent': 'Musee-App/1.0' } },
      );
      const data = await res.json();
      const addr = data.address ?? {};
      city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
      country = addr.country ?? '';

      const osmType = String(data.type ?? '').toLowerCase();
      const tourismTag = String(addr.tourism ?? '').toLowerCase();
      const amenityTag = String(addr.amenity ?? '').toLowerCase();
      if (MUSEUM_OSM_VALUES.has(osmType)) {
        museum = data.name ?? addr.tourism ?? '';
      } else if (MUSEUM_OSM_VALUES.has(tourismTag) || MUSEUM_OSM_VALUES.has(amenityTag)) {
        museum = addr.tourism ?? addr.amenity ?? data.name ?? '';
      }
    } catch {
      // Fall through to Overpass.
    }

    if (!museum) {
      museum = await findMuseumNearby(lat, lon);
    }

    const result = { city, country, museum };
    cache.set(cacheKey, result);
    return result;
  };
}

export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const resolveOnce = (value: { latitude: number; longitude: number } | undefined) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    if (!navigator.geolocation) {
      resolveOnce(undefined);
      return;
    }

    const failFastTimer = window.setTimeout(() => resolveOnce(undefined), 1200);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(failFastTimer);
        resolveOnce({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        window.clearTimeout(failFastTimer);
        resolveOnce(undefined);
      },
      { timeout: 1500, enableHighAccuracy: false },
    );
  });
}
