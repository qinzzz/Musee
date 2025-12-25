import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { userApiService } from './src/services/userApi';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { IdentityProvider } from './src/contexts/IdentityContext';

function App() {
  return (
    <LanguageProvider>
      <IdentityProvider>
        <AppContent />
      </IdentityProvider>
    </LanguageProvider>
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
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
