import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { filterArtistsBySearch } from '@musee/client-core';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { mobileArtistService } from '../api/runtime';
import { useAuth } from '../auth/AuthProvider';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { ArtistCard } from './ArtistCard';
import { artistKeys, useArtistRefresh } from './artistQueries';

const COPY = { search: 'Search artists', empty: 'No artists yet', noMatch: 'No matching artists',
  hint: 'Artists linked to your saved artworks appear here.', error: 'Musee could not load artists.', retry: 'Try again' };
export function ArtistsPane() {
  const { user } = useAuth();
  const userId = user?.user_id ?? '';
  const router = useRouter();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  useArtistRefresh(userId);
  const query = useQuery({ queryKey: artistKeys.list(userId), queryFn: () => mobileArtistService.list(userId), enabled: !!userId });
  return <View style={styles.container}>
    <View style={styles.search}>
      <SymbolView name="magnifyingglass" size={16} tintColor={colors.placeholder} />
      <TextInput accessibilityLabel={COPY.search} placeholder={COPY.search} value={search}
        onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing"
        placeholderTextColor={colors.placeholder} style={styles.input} />
    </View>
    <FlatList data={filterArtistsBySearch(query.data ?? [], search)} keyExtractor={(artist) => artist.id}
      contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshing={query.isRefetching} onRefresh={() => void client.invalidateQueries({ queryKey: artistKeys.all(userId) })}
      ListHeaderComponent={query.error ? <View style={styles.message}><Text style={styles.error}>{COPY.error}</Text>
        <MuseeButton label={COPY.retry} onPress={() => void query.refetch()} /></View> : null}
      ListEmptyComponent={query.isPending ? <ActivityIndicator /> : !query.error ? <View style={styles.message}>
        <Text style={styles.text}>{search.trim() ? COPY.noMatch : COPY.empty}</Text>
        {!search.trim() ? <Text style={styles.text}>{COPY.hint}</Text> : null}</View> : null}
      renderItem={({ item }) => <ArtistCard artist={item} userId={userId}
        onPress={() => router.push({ pathname: '/artist/[id]', params: { id: item.id } })} />} />
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1,
    borderColor: colors.border, borderRadius: 9999, paddingHorizontal: spacing.md, marginVertical: spacing.md },
  input: { flex: 1, minHeight: 44, color: colors.foreground, fontSize: typography.body },
  content: { gap: spacing.md, paddingBottom: 96 },
  message: { gap: spacing.sm, paddingVertical: spacing.md },
  text: { color: colors.secondary, fontSize: typography.label },
  error: { color: colors.danger, fontSize: typography.label },
});
