import { usePullToRefresh } from '../ui/hooks/usePullToRefresh';
import { LoadingIndicator } from '../ui/components/LoadingIndicator';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { filterMuseumsBySearch } from '@musee/client-core';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { mobileMuseumService } from '../api/runtime';
import { useAuth } from '../auth/AuthProvider';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { MuseumCard } from './MuseumCard';
import { museumKeys, useMuseumRefresh } from './museumQueries';

const COPY = { search: 'Search museums', empty: 'No museums yet', noMatch: 'No matching museums',
  hint: 'Artworks captured at recognized museums appear here.', error: 'Musee could not load museums.', retry: 'Try again' };
export function MuseumsPane() {
  const { user } = useAuth();
  const userId = user?.user_id ?? '';
  const router = useRouter();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  useMuseumRefresh(userId);
  const query = useQuery({ queryKey: museumKeys.list(userId), queryFn: () => mobileMuseumService.list(userId), enabled: !!userId });
  const pullToRefresh = usePullToRefresh(() => client.invalidateQueries({ queryKey: museumKeys.all(userId) }));
  return <View style={styles.container}>
    <View style={styles.search}>
      <SymbolView name="magnifyingglass" size={16} tintColor={colors.placeholder} />
      <TextInput accessibilityLabel={COPY.search} placeholder={COPY.search} value={search}
        onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing"
        placeholderTextColor={colors.placeholder} style={styles.input} />
    </View>
    <FlatList data={filterMuseumsBySearch(query.data?.items ?? [], search)} keyExtractor={(museum) => museum.museum.id}
      contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      {...pullToRefresh}
      ListHeaderComponent={query.error ? <View style={styles.message}><Text style={styles.error}>{COPY.error}</Text>
        <MuseeButton label={COPY.retry} onPress={() => void query.refetch()} /></View> : null}
      ListEmptyComponent={query.isPending ? <LoadingIndicator /> : !query.error ? <View style={styles.message}>
        <Text style={styles.text}>{search.trim() ? COPY.noMatch : COPY.empty}</Text>
        {!search.trim() ? <Text style={styles.text}>{COPY.hint}</Text> : null}</View> : null}
      renderItem={({ item }) => <MuseumCard museum={item}
        onPress={() => router.push({ pathname: '/museum/[id]', params: { id: item.museum.id } })} />} />
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
