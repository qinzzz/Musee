import { requireOptionalNativeModule } from 'expo';

export type ApplePlace = {
  id: string; name: string; address: string; category: string; latitude: number; longitude: number;
};
export type PlaceMapPin = Pick<ApplePlace, 'id' | 'name' | 'address' | 'latitude' | 'longitude'>;
type PlacesModule = {
  search: (query: string, latitude: number | null, longitude: number | null) => Promise<ApplePlace[]>;
  resolve: (id: string) => Promise<ApplePlace>;
};
const UNAVAILABLE = 'Place search needs the updated iPhone build. You can enter a place manually.';
function module(): PlacesModule {
  const native = requireOptionalNativeModule<PlacesModule>('MuseePlaces');
  if (!native) throw new Error(UNAVAILABLE);
  return native;
}

// No persistent response cache: only the selected provider identifier is saved.
export const applePlaces = {
  search(query: string, location?: { latitude?: number; longitude?: number } | null) {
    return module().search(query, location?.latitude ?? null, location?.longitude ?? null);
  },
  resolve(id: string) { return module().resolve(id); },
};
