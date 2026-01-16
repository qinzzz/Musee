/**
 * Device ID Service
 *
 * Manages persistent device identification using iOS Keychain.
 * The device ID persists across app reinstalls and device backups.
 */

import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_SERVICE = 'com.musee.deviceId';
const DEVICE_ID_USERNAME = 'deviceId';

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Gets the device ID from Keychain, or creates a new one if it doesn't exist.
 * The device ID persists across app reinstalls.
 *
 * @returns Promise<string> The device ID
 */
export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    const webDeviceId = await AsyncStorage.getItem(DEVICE_ID_SERVICE);
    if (webDeviceId) return webDeviceId;

    const newId = generateUUID();
    await AsyncStorage.setItem(DEVICE_ID_SERVICE, newId);
    return newId;
  }

  try {
    // Try to retrieve existing device ID from Keychain
    const credentials = await Keychain.getGenericPassword({
      service: DEVICE_ID_SERVICE
    });

    if (credentials && credentials.password) {
      console.log('[DeviceID] Retrieved existing device ID from Keychain', credentials.password);
      return credentials.password;
    }
  } catch (error) {
    console.error('[DeviceID] Error reading device ID from Keychain:', error);
  }

  // Generate new UUID and store in Keychain
  const newDeviceId = generateUUID();
  console.log('[DeviceID] Generated new device ID:', newDeviceId);

  try {
    await Keychain.setGenericPassword(
      DEVICE_ID_USERNAME,
      newDeviceId,
      {
        service: DEVICE_ID_SERVICE,
        accessible: Keychain.ACCESSIBLE.ALWAYS,
      }
    );
    console.log('[DeviceID] Saved new device ID to Keychain');
  } catch (error) {
    console.error('[DeviceID] Error saving device ID to Keychain:', error);
  }

  return newDeviceId;
}

/**
 * Resets the device ID (useful for testing or user logout)
 * WARNING: This will clear the device's identification and cannot be undone
 */
export async function resetDeviceId(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(DEVICE_ID_SERVICE);
    return;
  }

  try {
    await Keychain.resetGenericPassword({ service: DEVICE_ID_SERVICE });
    console.log('[DeviceID] Device ID has been reset');
  } catch (error) {
    console.error('[DeviceID] Error resetting device ID:', error);
  }
}
