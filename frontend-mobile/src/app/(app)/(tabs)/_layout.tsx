import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../../navigation/FloatingTabBar';

export default function AppTabsLayout() {
  return <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="library" options={{ title: 'Collection' }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
  </Tabs>;
}
