/**
 * User API Service
 *
 * Manages user creation and authentication with the backend
 */

import { API_BASE_URL } from '../constants/api';
import { getDeviceId } from './deviceId';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ID_KEY = '@musee_user_id';

export interface User {
  user_id: string;
  username?: string;
  email?: string;
  device_id?: string;
  created_at: string;
  last_active: string;
  settings?: Record<string, any>;
}

class UserApiService {
  private userId: string | null = null;

  /**
   * Initialize user on app launch
   * Creates a new user if doesn't exist, or retrieves existing user
   */
  async initializeUser(): Promise<User> {
    try {
      // Check if we already have a user_id stored locally
      const storedUserId = await AsyncStorage.getItem(USER_ID_KEY);

      if (storedUserId) {
        console.log('[UserAPI] Found stored user_id:', storedUserId);

        // Try to fetch user from backend to verify it still exists
        try {
          const user = await this.getUser(storedUserId);
          this.userId = user.user_id;
          console.log('[UserAPI] Successfully retrieved existing user');
          return user;
        } catch (error) {
          console.log('[UserAPI] Stored user not found in backend, creating new user');
          // Fall through to create new user
        }
      }

      // Get device ID and create/get user
      const deviceId = await getDeviceId();
      console.log('[UserAPI] Creating/getting user with device_id:', deviceId.substring(0, 8) + '...');

      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create/get user: ${response.status}`);
      }

      const user: User = await response.json();

      // Store user_id locally for future use
      await AsyncStorage.setItem(USER_ID_KEY, user.user_id);
      this.userId = user.user_id;

      console.log('[UserAPI] User initialized successfully:', user.user_id);
      return user;

    } catch (error) {
      console.error('[UserAPI] Failed to initialize user:', error);
      throw error;
    }
  }

  /**
   * Get the current user ID
   * Returns cached value if available, otherwise initializes user
   */
  async getUserId(): Promise<string> {
    if (this.userId) {
      return this.userId;
    }

    // Try to get from AsyncStorage first
    const storedUserId = await AsyncStorage.getItem(USER_ID_KEY);
    if (storedUserId) {
      this.userId = storedUserId;
      return storedUserId;
    }

    // Initialize user if not found
    const user = await this.initializeUser();
    return user.user_id;
  }

  /**
   * Get user by user_id
   */
  async getUser(userId: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);

    if (!response.ok) {
      throw new Error('User not found');
    }

    return await response.json();
  }

  /**
   * Get user by device_id
   */
  async getUserByDevice(deviceId: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/api/users/by-device/${deviceId}`);

    if (!response.ok) {
      throw new Error('User not found');
    }

    return await response.json();
  }

  /**
   * Update user profile
   */
  async updateUser(
    userId: string,
    updates: {
      username?: string;
      email?: string;
      settings?: Record<string, any>;
    }
  ): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error('Failed to update user');
    }

    return await response.json();
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: string, settings: Record<string, any>): Promise<User> {
    return this.updateUser(userId, { settings });
  }

  /**
   * Clear local user data (for testing/logout)
   */
  async clearUser(): Promise<void> {
    await AsyncStorage.removeItem(USER_ID_KEY);
    this.userId = null;
    console.log('[UserAPI] User data cleared');
  }
}

export const userApiService = new UserApiService();
