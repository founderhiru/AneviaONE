import * as SecureStore from 'expo-secure-store';

import type { User } from '../../types';

const CURRENT_USER_KEY = 'hi.session.currentUser';

/**
 * Local session cache backed by `expo-secure-store` (Keychain/Keystore),
 * used only by the mock auth service so a signed-in state survives an app
 * restart during UI review. Never stores an OTP, password, or any secret —
 * only the non-sensitive mock user profile. A real Supabase integration
 * manages its own encrypted session separately (see `supabaseClient.ts`).
 */
export const secureSession = {
  async save(user: User): Promise<void> {
    await SecureStore.setItemAsync(CURRENT_USER_KEY, JSON.stringify(user));
  },
  async load(): Promise<User | null> {
    const raw = await SecureStore.getItemAsync(CURRENT_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(CURRENT_USER_KEY);
  },
};
