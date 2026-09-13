import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Platform, StyleSheet, Text, View, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import type { PlaceMapPin } from './applePlaces';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

type Coordinate = { latitude: number; longitude: number };
type MapProps = ViewProps & {
  places: PlaceMapPin[];
  selectedId: string | null;
  initialLocation: Coordinate | null;
  interactive: boolean;
  onPlaceSelect: (event: NativeSyntheticEvent<{ id: string }>) => void;
};
const available = Platform.OS === 'ios' &&
  requireOptionalNativeModule<{ supportsMapView?: boolean }>('MuseePlaces')?.supportsMapView;
const NativeMap = available ? requireNativeView<MapProps>('MuseePlaces') : null;
const UNAVAILABLE = 'The map needs the updated app build. You can still choose a search result.';

export function ApplePlacesMap({ places, selectedId, originalLocation, disabled, onSelect }: {
  places: PlaceMapPin[];
  selectedId: string | null;
  originalLocation?: { latitude?: number; longitude?: number } | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const latitude = originalLocation?.latitude;
  const longitude = originalLocation?.longitude;
  const initialLocation = typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null;
  return <View style={styles.container}>
    {NativeMap ? <NativeMap style={styles.map} places={places} selectedId={selectedId}
      initialLocation={initialLocation} interactive={!disabled}
      onPlaceSelect={({ nativeEvent }) => { if (!disabled) onSelect(nativeEvent.id); }} />
      : <Text style={styles.fallback}>{UNAVAILABLE}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { borderRadius: radii.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  map: { height: 240, width: '100%' },
  fallback: { padding: spacing.md, color: colors.secondary, fontSize: typography.caption },
});
