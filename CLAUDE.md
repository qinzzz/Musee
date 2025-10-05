# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Musee is a React Native iOS application featuring an ambient welcome screen with soft gradient colors. The app is built using React Native 0.81.4 with TypeScript support.

## Development Commands

### Essential Commands
- `npm start` - Start the Metro bundler
- `npm run ios` - Build and run the iOS app
- `npm run android` - Build and run the Android app (when Android support is added)
- `npm test` - Run the Jest test suite
- `npm run lint` - Run ESLint to check code quality

### iOS-Specific Setup
- `cd ios && pod install` - Install CocoaPods dependencies (run after adding new native dependencies)
- `bundle install` - Install Ruby bundler dependencies (first-time setup only)
- `bundle exec pod install` - Alternative pod install command using bundler

### Development Workflow
1. Start Metro: `npm start`
2. In a new terminal, run: `npm run ios`
3. For development with live reload, press `R` in the iOS Simulator

## Architecture

### Key Dependencies
- **react-native-linear-gradient**: Provides gradient background functionality for the welcome screen
- **react-native-safe-area-context**: Handles safe area insets for different device layouts
- **@react-native/new-app-screen**: Template components (currently replaced with custom welcome screen)

### App Structure
- `App.tsx` - Main application component containing the ambient welcome screen with:
  - Soft gradient background (purple to pink spectrum)
  - Centered welcome text with app branding
  - Ambient floating circles for visual depth
  - Safe area handling for different iOS devices

### Styling Approach
- Uses StyleSheet.create for performance
- Responsive design using Dimensions.get('window')
- Color scheme: Soft gradient from #667eea → #764ba2 → #f093fb
- Typography: Clean, modern font weights with proper letter spacing

### Testing Configuration
Jest is configured to handle React Native modules and transform the linear gradient package. The transformIgnorePatterns includes necessary React Native packages for proper test execution.

## iOS Configuration Notes
- Project uses CocoaPods for dependency management
- Configured for React Native's new architecture
- Privacy manifest aggregation is enabled
- Hermes JavaScript engine is used for performance