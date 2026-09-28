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
  setItemAsync,
  getItemAsync,
  deleteItemAsync,
  __clearSecureStoreForTests,
};
