import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CaptureLocationUpdate } from '@musee/client-core';
import type { ApplePlace, PlaceMapPin } from '../../platform/places/applePlaces';
import { ApplePlacesMap } from '../../platform/places/ApplePlacesMap';
import { usePlaceSearch } from '../usePlaceSearch';
import { Screen } from '../../ui/components/Screen';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import type { MobileArtworkRecord } from '../types';

const COPY = {
  title: 'Edit location', search: 'Search places', placeholder: 'Place name, address, or city',
  current: 'Current location', save: 'Save location', cancel: 'Cancel',
  manual: 'Add a place name', manualName: 'Your place name', remove: 'Remove location', removeLabel: 'Remove',
  manualHint: 'For a place you can’t find on the map.', backToSearch: 'Search Apple Maps',
  removed: 'Location will be removed.', selected: 'Selected',
  searching: 'Searching…', noResults: 'No places found. Try a different name or city.',
  saveError: 'Could not save the location. Your selection is still here.',
  provider: 'Search by Apple Maps',
  locating: 'Locating saved place…', noCoordinates: 'This saved place has no available map location.',
} as const;

export function ArtworkLocationSheet({ artwork, currentPlace, resolvingCurrentPlace = false, onClose, onSave }: {
  artwork: MobileArtworkRecord;
  currentPlace?: PlaceMapPin | null;
  resolvingCurrentPlace?: boolean;
  onClose: () => void;
  onSave: (update: CaptureLocationUpdate) => Promise<MobileArtworkRecord | undefined>;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ApplePlace | null>(null);
  const [mode, setMode] = useState<'search' | 'manual' | 'removed'>('search');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { results, searching, error: searchError } = usePlaceSearch(query, mode === 'search',
    artwork.originalLocation);
  const selectPlace = (place: ApplePlace) => {
    if (locked.current) return;
    setSelected(place); setError(null); Keyboard.dismiss();
  };

  const save = async () => {
    if (locked.current) return;
    let update: CaptureLocationUpdate;
    if (mode === 'removed') update = { status: 'removed' };
    else if (mode === 'manual' && name.trim()) update = { status: 'selected', source: 'manual', name: name.trim() };
    else if (mode === 'search' && selected) update = { status: 'selected', source: 'apple_maps', place_id: selected.id,
      match_hint: { name: selected.name, latitude: selected.latitude, longitude: selected.longitude } };
    else return;
    locked.current = true; setSaving(true); setError(null);
    try {
      const saved = await onSave(update);
      if (saved && mounted.current) onClose();
    } catch { if (mounted.current) setError(COPY.saveError); }
    finally { locked.current = false; if (mounted.current) setSaving(false); }
  };
  const canSave = mode === 'removed' || (mode === 'manual' ? !!name.trim() : !!selected);
  const hasDraft = mode !== 'search' || !!selected;
  const showManualEntry = mode === 'search' && !selected && !searching &&
    (!!searchError || query.trim().length >= 2);
  const showingSavedPlace = mode === 'search' && !query.trim() && !selected;
  const mapPlaces = showingSavedPlace && currentPlace ? [currentPlace] : results;
  const mapSelectedId = selected?.id ?? (showingSavedPlace ? currentPlace?.id ?? null : null);
  return <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!locked.current) onClose(); }}>
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{COPY.title}</Text>
          <Pressable accessibilityRole="button" disabled={saving} onPress={onClose} style={styles.textAction}>
            <Text style={[styles.link, saving && styles.disabled]}>{COPY.cancel}</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {mode === 'manual' ? <>
            <Pressable accessibilityRole="button" disabled={saving} style={styles.textAction}
              onPress={() => { setMode('search'); setError(null); Keyboard.dismiss(); }}>
              <Text style={styles.link}>{COPY.backToSearch}</Text>
            </Pressable>
            <TextInput accessibilityLabel={COPY.manualName} placeholder={COPY.manualName}
              value={name} maxLength={300} editable={!saving} autoFocus onChangeText={setName} style={styles.input} />
            <Text style={styles.hint}>{COPY.manualHint}</Text>
          </> : <>
            <TextInput accessibilityLabel={COPY.search} placeholder={COPY.placeholder} maxLength={300}
              style={styles.input} editable={!saving} autoCorrect={false} value={query}
              onChangeText={(value) => { setQuery(value); setMode('search'); setSelected(null); setError(null); }} />
            {artwork.museumName && mode === 'search' && !selected && !query.trim() ? <View style={styles.current}>
              <View style={styles.flex}>
                <Text style={styles.hint}>{COPY.current}</Text>
                <Text style={styles.name}>{artwork.museumName}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={COPY.remove} disabled={saving}
                style={styles.textAction}
                onPress={() => { setMode('removed'); setSelected(null); setError(null); }}>
                <Text style={styles.remove}>{COPY.removeLabel}</Text>
              </Pressable>
            </View> : null}
            {mode === 'search' ? <>
              {searching ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{COPY.searching}</Text> : null}
              {searchError ? <Text accessibilityRole="alert" style={styles.error}>{searchError}</Text> : null}
              {showingSavedPlace && artwork.museumName && !currentPlace ?
                <Text style={styles.hint}>{resolvingCurrentPlace ? COPY.locating : COPY.noCoordinates}</Text> : null}
              <ApplePlacesMap places={mapPlaces} selectedId={mapSelectedId}
                originalLocation={artwork.originalLocation} disabled={saving}
                onSelect={(id) => { const place = results.find((item) => item.id === id); if (place) selectPlace(place); }} />
              <Text style={styles.hint}>{COPY.provider}</Text>
              {!searching && !searchError && query.trim().length >= 2 && !results.length
                ? <Text style={styles.hint}>{COPY.noResults}</Text> : null}
              <View>
                {results.map((place) => <Pressable key={place.id} accessibilityRole="button" disabled={saving}
                  accessibilityLabel={`${place.name}, ${place.address}, ${place.category}`}
                  accessibilityState={{ selected: place.id === selected?.id, disabled: saving }}
                  onPress={() => selectPlace(place)} style={styles.result}>
                  <Text style={[styles.name, place.id === selected?.id && styles.selected]}>{place.name}</Text>
                  <Text style={styles.hint}>{place.address}</Text>
                  {place.id === selected?.id ? <Text style={styles.hint}>{COPY.selected}</Text> : null}
                </Pressable>)}
              </View>
              {showManualEntry ? <Pressable accessibilityRole="button" disabled={saving} style={styles.textAction}
                onPress={() => { setMode('manual'); setSelected(null); setError(null); }}>
                <Text style={styles.link}>{COPY.manual}</Text>
              </Pressable> : null}
            </> : null}
          </>}
        </ScrollView>
        {hasDraft ? <View style={styles.footer}>
          {selected && mode === 'search' ? <View style={styles.summary}>
            <Text numberOfLines={2} style={[styles.name, styles.selected]}>{selected.name}</Text>
            <Text numberOfLines={2} style={styles.hint}>{selected.address}</Text>
          </View> : null}
          {mode === 'removed' ? <Text style={styles.hint}>{COPY.removed}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <MuseeButton label={COPY.save} disabled={!canSave} loading={saving} onPress={() => void save()} />
        </View> : null}
      </KeyboardAvoidingView>
    </Screen>
  </Modal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { gap: spacing.md, paddingBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingVertical: spacing.sm },
  title: { flex: 1, color: colors.foreground, fontSize: typography.heading, fontWeight: '600' },
  textAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: colors.foreground, fontSize: typography.body },
  remove: { color: colors.danger, fontSize: typography.label },
  current: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingVertical: spacing.md, gap: spacing.sm },
  summary: { gap: spacing.xs },
  disabled: { opacity: 0.55 },
  input: { minHeight: 52, padding: spacing.md, borderRadius: radii.input, borderWidth: 1,
    borderColor: colors.border, color: colors.foreground, fontSize: typography.body },
  hint: { color: colors.secondary, fontSize: typography.caption },
  result: { paddingVertical: spacing.md, gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  name: { color: colors.foreground, fontSize: typography.body },
  selected: { fontWeight: '600' },
  error: { color: colors.danger, fontSize: typography.body },
});
