// API Configuration
// For iOS Physical Device: Use your Mac's local IP address
// For iOS Simulator: Use 'http://localhost:8000'
// For Android Emulator: Use 'http://10.0.2.2:8000'

// Your Mac's IP address on local network: 10.0.0.17
export const API_BASE_URL = 'http://10.0.0.17:8000';

// Alternative: Use localhost for iOS simulator
// export const API_BASE_URL = 'http://localhost:8000';

export const API_ENDPOINTS = {
  ANALYZE_ARTIST: '/api/analyze-artist',
  ANALYZE_ARTWORK: '/api/analyze',
  GET_PROVIDERS: '/api/providers',
};
