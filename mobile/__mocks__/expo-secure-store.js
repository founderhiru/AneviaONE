/**
 * Manual mock for `expo-secure-store` used in tests (Jest auto-applies a
 * `__mocks__/<package>.js` adjacent to node_modules for node_modules
 * packages). Backed by an in-memory Map so tests are isolated from a real
 * Keychain/Keystore, with a `__clearSecureStoreForTests` helper so each
 * test file/case can reset session state between scenarios.
 */
const store = new Map();

async function setItemAsync(key, value) {
  store.set(key, value);
}

async function getItemAsync(key) {
  return store.has(key) ? store.get(key) : null;
}

async function deleteItemAsync(key) {
  store.delete(key);
}

function __clearSecureStoreForTests() {
  store.clear();
}

module.exports = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  WHEN_UNLOCKED: 2,
  setItemAsync,
  getItemAsync,
  deleteItemAsync,
  __clearSecureStoreForTests,
};
