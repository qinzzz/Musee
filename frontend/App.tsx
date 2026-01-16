import React, { useEffect } from 'react';
import { StatusBar, View, Text, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { userApiService } from './src/services/userApi';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { IdentityProvider } from './src/contexts/IdentityContext';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[App] ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>Something went wrong.</Text>
          <Text style={{ color: 'red' }}>{this.state.error?.message || 'Unknown error'}</Text>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === 'web') window.location.reload();
            }}
            style={{ marginTop: 20, padding: 10, backgroundColor: '#000', borderRadius: 5 }}
          >
            <Text style={{ color: '#fff' }}>Reload App</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const MAX_WIDTH = 480;

function ResponsiveContainer({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <View style={{
      flex: 1,
      backgroundColor: '#f5f5f5', // Subtle outer background for web
      alignItems: 'center',
    }}>
      <View style={{
        width: '100%',
        maxWidth: MAX_WIDTH,
        height: '100%',
        backgroundColor: '#fff',
        // Add a subtle shadow/border for desktop feel
        boxShadow: '0 0 20px rgba(0,0,0,0.05)',
      }}>
        {children}
      </View>
    </View>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <IdentityProvider>
          <AppContent />
        </IdentityProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  // Initialize user on app launch
  useEffect(() => {
    const initUser = async () => {
      try {
        await userApiService.initializeUser();
        console.log('[App] User initialized successfully');
      } catch (error) {
        console.error('[App] Failed to initialize user:', error);
      }
    };

    initUser();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <View style={{ flex: 1 }}>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

export default App;
