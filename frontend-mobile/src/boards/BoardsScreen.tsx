import { usePullToRefresh } from '../ui/hooks/usePullToRefresh';
import { LoadingIndicator } from '../ui/components/LoadingIndicator';
import { filterBoardsBySearch } from '@musee/client-core';
import { BoardCoverMosaic } from './BoardCoverMosaic';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { mobileBoardService } from '../api/runtime';
import { useAuth } from '../auth/AuthProvider';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { BoardNameSheet } from './BoardNameSheet';
import { boardKeys } from './boardQueries';
import { useBoardActions, useBoardRefresh } from './useBoards';

const COPY = {
  title: 'Boards', create: '+ New board', search: 'Search boards', noResults: 'No matching boards', empty: 'No boards yet',
  error: 'Musee could not load your boards.', retry: 'Try again',
  count: (n: number) => `${n} artwork${n === 1 ? '' : 's'}`,
};
export function BoardsScreen() {
  const { user } = useAuth();
  const userId = user?.user_id ?? '';
  const router = useRouter();
  const [search, setSearch] = useState('');
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const actions = useBoardActions(userId);
  useBoardRefresh(userId);
  const query = useQuery({
    queryKey: boardKeys.list(userId), queryFn: () => mobileBoardService.list(userId), enabled: !!userId,
  });
  const pullToRefresh = usePullToRefresh(() => client.invalidateQueries({ queryKey: boardKeys.all(userId) }));
  return <View style={{ flex: 1 }}>
    <View style={styles.toolbar}>
      <View style={styles.search}>
        <SymbolView name="magnifyingglass" size={16} tintColor={colors.placeholder} />
        <TextInput accessibilityLabel={COPY.search} placeholder={COPY.search}
          placeholderTextColor={colors.placeholder} value={search} onChangeText={setSearch}
          autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" style={styles.searchInput} />
      </View>
      <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={styles.create}>
        <Text style={styles.createLabel}>{COPY.create}</Text>
      </Pressable>
    </View>
    <FlatList keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" data={filterBoardsBySearch(query.data ?? [], search)} numColumns={2} columnWrapperStyle={styles.row} keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content} {...pullToRefresh}
      ListHeaderComponent={<View style={styles.header}>
        {query.error ? <View style={styles.header}><Text style={styles.error}>{COPY.error}</Text>
          <MuseeButton label={COPY.retry} onPress={() => void query.refetch()} /></View> : null}
      </View>}
      ListEmptyComponent={query.isPending ? <LoadingIndicator /> : !query.error ? <Text style={styles.secondary}>{search.trim() ? COPY.noResults : COPY.empty}</Text> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={item.name}
        style={styles.card} onPress={() => router.push({ pathname: '/boards/[id]', params: { id: item.id } })}>
        <BoardCoverMosaic itemIds={item.itemIds} userId={userId} />
        <View style={styles.copy}><Text numberOfLines={1} style={styles.name}>{item.name}</Text>
          <Text style={styles.secondary}>{COPY.count(item.itemIds.length)}</Text></View>
      </Pressable>} />
    <BoardNameSheet visible={creating} title={COPY.create} busy={actions.busy} error={actions.error}
      onCancel={() => setCreating(false)} onSave={async (name) => {
        const board = await actions.create(name);
        if (board) {
          setCreating(false);
          router.push({ pathname: '/boards/[id]', params: { id: board.id } });
        }
      }} />
  </View>;
}
const styles = StyleSheet.create({
  content: { paddingVertical: spacing.md, paddingBottom: 96, gap: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.border, borderRadius: 9999, paddingHorizontal: spacing.sm, minHeight: 44 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, color: colors.foreground, fontSize: typography.label },
  create: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: 9999 },
  createLabel: { color: colors.foreground, fontWeight: '600', fontSize: typography.label },
  row: { gap: spacing.md },
  card: { flex: 1, maxWidth: '48%' },
  copy: { paddingTop: spacing.sm, gap: 4 },
  name: { color: colors.foreground, fontSize: typography.body, fontWeight: '600' },
  secondary: { color: colors.secondary, fontSize: typography.label },
  error: { color: colors.danger, fontSize: typography.label },
});
