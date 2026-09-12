import { useEffect, useState } from 'react';
import { applePlaces, type ApplePlace, type PlaceMapPin } from '../platform/places/applePlaces';
import type { MobileArtworkRecord } from './types';

export function useCapturePlace(artwork: MobileArtworkRecord | null | undefined) {
  const override = artwork?.captureLocationOverride;
  const id = override?.status === 'selected' && override.source === 'apple_maps' ? override.place_id : null;
  const [resolved, setResolved] = useState<{ id: string; place: ApplePlace | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (id) Promise.resolve().then(() => applePlaces.resolve(id))
      .then((place) => { if (active) setResolved({ id, place }); })
      .catch(() => { if (active) setResolved({ id, place: null }); });
    return () => { active = false; };
  }, [id]);
  // Resolve the saved ID for display only; it never becomes an unsaved selection.
  const place = id && resolved?.id === id ? resolved.place : null;
  let mapPin: PlaceMapPin | null = place;
  const museum = artwork?.captureMuseum;
  const latitude = museum?.latitude;
  const longitude = museum?.longitude;
  const usesMuseum = !override || (override.status === 'selected' && override.source !== 'manual');
  if (!mapPin && usesMuseum && museum && typeof latitude === 'number' && Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180) {
    mapPin = { id: `museum:${museum.id}`, name: museum.canonical_name, address: '', latitude, longitude };
  }
  return { placeName: place?.name ?? artwork?.museumName, mapPin,
    resolving: !!id && resolved?.id !== id && !mapPin };
}
