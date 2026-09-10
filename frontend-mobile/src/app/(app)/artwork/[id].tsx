import { useLocalSearchParams } from 'expo-router';
import { ArtworkDetailScreen } from '../../../library/ArtworkDetailScreen';

export default function ArtworkDetailRoute() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ArtworkDetailScreen key={id} artworkId={id || ''} />;
}
