import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/** Persistent storage for the native refresh token (Android Keystore-backed). */
export interface NativeTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'dinner-planner.refreshToken';

export const nativeTokenStore: NativeTokenStore = {
  async get() {
    try {
      const value = await SecureStorage.get(KEY);
      return typeof value === 'string' && value !== '' ? value : null;
    } catch {
      return null;
    }
  },
  async set(token) {
    await SecureStorage.set(KEY, token);
  },
  async clear() {
    try {
      await SecureStorage.remove(KEY);
    } catch {
      // Nothing stored, or storage unavailable: either way there is nothing to clear.
    }
  },
};
