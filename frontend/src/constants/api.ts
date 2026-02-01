// API Configuration
// Automatically uses appropriate URL based on environment

import { Platform } from 'react-native';

// For iOS Simulator, we can try localhost first, but if that fails,
// use the Mac's IP address (same as Metro bundler)
// Android Emulator needs 10.0.2.2 (alias for host machine)
const getDevBaseURL = () => {
  if (Platform.OS === 'ios') {
    // Use Mac's IP address for iOS Simulator
    // This matches the Metro bundler connection
    return 'http://10.0.0.17:8000';
    // return 'http://192.168.1.149:8000';
  } else if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }
  return 'http://localhost:8000';
};

const DEV_BASE_URL = 'https://musee-production.up.railway.app';
const PROD_BASE_URL = 'https://musee-production.up.railway.app';

// Use __DEV__ global to detect development mode
export const API_BASE_URL = __DEV__ ? DEV_BASE_URL : PROD_BASE_URL;

export const API_ENDPOINTS = {
  ANALYZE_ARTIST: '/api/analyze-artist',
  ANALYZE_BITE: '/api/analyze-bite',
  ANALYZE_TOPIC: '/api/analyze-topic',
  GET_PROVIDERS: '/api/providers',
  REMOVE_BACKGROUND: '/api/remove-background',
};
