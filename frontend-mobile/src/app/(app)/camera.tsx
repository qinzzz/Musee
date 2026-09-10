import { useLocalSearchParams } from 'expo-router';
import { CameraScreen } from '../../capture/CameraScreen';

export default function CameraRoute() {
  const params = useLocalSearchParams<{ destination?: string | string[] }>();
  const destination = Array.isArray(params.destination) ? params.destination[0] : params.destination;
  return <CameraScreen destination={destination === 'session' ? 'session' : 'library'} />;
}
