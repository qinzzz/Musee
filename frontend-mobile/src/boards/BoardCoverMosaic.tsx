import { useQueries } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { getBoardCoverImages } from '@musee/client-core';
import { mobileArtworkLibraryService } from '../api/runtime';

export function BoardCoverMosaic({ itemIds, userId }: { itemIds: string[]; userId: string }) {
  const queries = useQueries({ queries: [...new Set(itemIds.slice(0, 4))].map((id) => ({
    queryKey: ['boards', userId, 'cover', id],
    queryFn: () => mobileArtworkLibraryService.fetchArtwork(id),
    enabled: !!userId,
  })) });
  const covers = getBoardCoverImages(itemIds, queries.flatMap(({ data }) =>
    data && !data.isDeleted ? [{ id: data.id, url: data.resolvedThumbnailUri }] : []));
  const slot = (index: number) => covers[index]
    ? <Image accessible={false} source={{ uri: covers[index] }} cachePolicy="memory-disk" contentFit="cover" style={styles.image} />
    : <View style={styles.image} />;
  return <View style={styles.mosaic}>
    <View style={styles.large}>{slot(0)}</View>
    <View style={styles.right}><View style={styles.small}>{slot(1)}</View><View style={styles.small}>{slot(2)}</View></View>
  </View>;
}
const styles = StyleSheet.create({
  mosaic: { width: '100%', aspectRatio: 1, flexDirection: 'row', gap: 2, borderRadius: 12,
    overflow: 'hidden', backgroundColor: '#E5E5E5' },
  large: { flex: 1.35 },
  right: { flex: 1, gap: 2 },
  small: { flex: 1 },
  image: { width: '100%', height: '100%', backgroundColor: '#F5F5F5' },
});
