import { SessionHistoryList } from '../../session/components/SessionHistoryList';
import { Screen } from '../../ui/components/Screen';
export default function SessionHistoryScreen() {
  return <Screen edges={['left', 'right', 'bottom']}><SessionHistoryList /></Screen>;
}
