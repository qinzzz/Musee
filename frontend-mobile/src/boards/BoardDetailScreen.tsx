import { usePullToRefresh } from '../ui/hooks/usePullToRefresh';
import { LoadingIndicator } from '../ui/components/LoadingIndicator';
import { useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { MOBILE_API_BASE_URL, mobileBoardService } from '../api/runtime';
import { useAuth } from '../auth/AuthProvider';
import { ArtworkLibraryCard } from '../library/components/ArtworkLibraryCard';
import { ArtworkPicker } from '../library/components/ArtworkPicker';
import { mapMobileArtwork } from '../library/mobileArtworkLibraryService';
import { Screen } from '../ui/components/Screen';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { BoardNameSheet } from './BoardNameSheet';
import { boardKeys } from './boardQueries';
import { useBoardActions, useBoardRefresh } from './useBoards';

const COPY = {
  actions: 'Board actions', title: 'Board', add: 'Add artworks', rename: 'Rename', renameTitle: 'Rename board',
  delete: 'Delete board', deleteMessage: 'The board will be deleted. Its artworks will stay in your Library.',
  cancel: 'Cancel', select: 'Select', done: 'Done', empty: 'No artworks in this board yet.',
  error: 'Musee could not load this board.', retry: 'Try again',
  removed: 'This board is no longer available.', back: 'Back to Boards',
  remove: (count: number) => `Remove ${count} from board`,
};
export function BoardDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const userId = user?.user_id ?? '';
  const router = useRouter();
  const actions = useBoardActions(userId);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  useBoardRefresh(userId);
  const board = useQuery({
    queryKey: boardKeys.detail(userId, id), queryFn: () => mobileBoardService.get(id), enabled: !!userId && !!id,
  });
  const artworks = useInfiniteQuery({
    queryKey: boardKeys.artworks(userId, id),
    queryFn: ({ pageParam }) => mobileBoardService.artworks(id, pageParam),
    initialPageParam: 0, enabled: !!userId && !!board.data,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return last.items.length && next < last.total ? next : undefined;
    },
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (artworks.data?.pages.flatMap((page) => page.items) ?? [])
      .filter((item) => {
        if (seen.has(item.id) || !board.data?.itemIds.includes(item.id)) return false;
        seen.add(item.id);
        return true;
      }).map((item) => mapMobileArtwork(item, MOBILE_API_BASE_URL));
  }, [artworks.data, board.data]);
  useEffect(() => {
    if (board.data) setSelected((current) => current.filter((item) => board.data.itemIds.includes(item)));
  }, [board.data]);
  const unavailable = board.error && 'status' in board.error && board.error.status === 404;
  async function refresh() { await Promise.all([board.refetch(), artworks.refetch()]); }
  const pullToRefresh = usePullToRefresh(refresh);
  function confirmDelete() {
    Alert.alert(COPY.delete, COPY.deleteMessage, [
      { text: COPY.cancel, style: 'cancel' },
      { text: COPY.delete, style: 'destructive', onPress: () => { void actions.remove(id).then((removed) => {
        if (removed) router.replace('/boards');
      }); } },
    ]);
  }
  return <Screen edges={['left', 'right', 'bottom']}>
    <Stack.Screen options={{ title: board.data?.name ?? COPY.title }} />
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={COPY.actions} disabled={actions.busy || !board.data}>
        <Stack.Toolbar.MenuAction icon="plus" onPress={() => setAdding(true)}>{COPY.add}</Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="checkmark.circle" onPress={() => { setSelecting(!selecting); setSelected([]); }}>
          {selecting ? COPY.done : COPY.select}
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="pencil" onPress={() => setRenaming(true)}>{COPY.rename}</Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="trash" destructive onPress={confirmDelete}>{COPY.delete}</Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
    {unavailable ? <View style={styles.header}><Text style={styles.secondary}>{COPY.removed}</Text>
      <MuseeButton label={COPY.back} onPress={() => router.replace('/boards')} /></View> :
    <FlatList data={items} numColumns={2} columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content} keyExtractor={(item) => item.id}
      {...pullToRefresh}
      onEndReached={() => { if (artworks.hasNextPage && !artworks.isFetching) void artworks.fetchNextPage(); }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.header}>
        {selected.length ? <MuseeButton label={COPY.remove(selected.length)} loading={actions.busy}
          onPress={() => { void actions.update(id, { removeArtworkIds: selected }).then(async (result) => {
            if (result) { setSelected([]); setSelecting(false); await artworks.refetch(); }
          }); }} /> : null}
        {board.error || artworks.error ? <View style={styles.header}><Text style={styles.error}>{COPY.error}</Text>
          <MuseeButton label={COPY.retry} onPress={() => void refresh()} /></View> : null}
        {actions.error ? <Text accessibilityRole="alert" style={styles.error}>{actions.error}</Text> : null}
      </View>}
      ListEmptyComponent={board.isPending || (board.data && artworks.isPending) ? <LoadingIndicator /> :
        !board.error && !artworks.error ? <Text style={styles.secondary}>{COPY.empty}</Text> : null}
      ListFooterComponent={artworks.isFetchingNextPage ? <LoadingIndicator /> : null}
      renderItem={({ item }) => <View style={styles.item}><ArtworkLibraryCard artwork={item}
        disabled={actions.busy} selected={selecting ? selected.includes(item.id) : undefined}
        onPress={() => selecting
          ? setSelected((current) => current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id])
          : router.push({ pathname: '/artwork/[id]', params: { id: item.id } })} /></View>} />}
    <BoardNameSheet visible={renaming} title={COPY.renameTitle} initialName={board.data?.name}
      busy={actions.busy} error={actions.error} onCancel={() => setRenaming(false)}
      onSave={async (name) => { if (await actions.update(id, { name })) setRenaming(false); }} />
    <ArtworkPicker visible={adding} userId={userId} disabled={actions.busy} errorMessage={actions.error}
      excludedArtworkIds={board.data?.itemIds ?? []} onCancel={() => setAdding(false)}
      onSelect={(selection) => { void actions.update(id, { addArtworkIds: selection.map((item) => item.id) }).then(async (result) => {
        if (result) { setAdding(false); await artworks.refetch(); }
      }); }} />
  </Screen>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.md, paddingVertical: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { gap: spacing.md },
  item: { flex: 1, maxWidth: '48%' },
  secondary: { color: colors.secondary, fontSize: typography.body },
  error: { color: colors.danger, fontSize: typography.label },
});
