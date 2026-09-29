import * as SecureStore from 'expo-secure-store';

/**
 * Storage adapter that keeps the Supabase session (access + refresh token)
 * in the device Keychain / Keystore via `expo-secure-store` instead of plain
 * AsyncStorage — this is a health app, so a stolen device backup must not
 * yield a usable session.
 *
 * SecureStore values should stay small (~2 KB on Android), and a Supabase
 * session can exceed that, so values are split into chunks:
 *   `<key>.chunks` = number of chunks, `<key>.0`, `<key>.1`, … = the parts.
 *
 * Items are readable only after the device's first unlock and never leave
 * this device (not included in iCloud Keychain sync / restores elsewhere).
 */

export const SECURE_CHUNK_SIZE = 1800;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key), OPTIONS);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function deleteChunks(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i), OPTIONS);
  }
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i), OPTIONS);
      // A missing chunk means a torn write — treat as signed out, not corrupt data.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await readCount(key);
    const count = Math.max(1, Math.ceil(value.length / SECURE_CHUNK_SIZE));
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * SECURE_CHUNK_SIZE, (i + 1) * SECURE_CHUNK_SIZE),
        OPTIONS
      );
    }
    await SecureStore.setItemAsync(countKey(key), String(count), OPTIONS);
    if (previous > count) await deleteChunks(key, count, previous);
  },

  async removeItem(key: string): Promise<void> {
    const count = await readCount(key);
    await SecureStore.deleteItemAsync(countKey(key), OPTIONS);
    await deleteChunks(key, 0, count);
  },
};
