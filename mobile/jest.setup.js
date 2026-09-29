/**
 * Global Jest setup for screen/component unit tests.
 *
 * These tests render individual screens directly (not the full app +
 * Stack/Tabs navigators), so `expo-router` is mocked here rather than
 * exercised for real — the full native navigation stack (react-navigation +
 * react-native-screens + reanimated) is not reliably testable in this
 * environment yet. Navigation is instead verified by asserting the mocked
 * `router.push`/`replace`/`back` calls each screen makes, which is what
 * "verify major navigation paths work" means for this test suite.
 */

/**
 * Screen/UI tests run in explicit DEMO mode (mock sign-in, in-memory
 * documents, sample Health Memory) so they never need a backend. Production
 * behaviour is covered by dedicated tests that load the production services
 * directly or re-load modules with production environment values.
 */
process.env.EXPO_PUBLIC_APP_MODE = 'demo';

/**
 * `SafeAreaProvider`'s real implementation measures native layout via
 * `onLayout`, which never fires in the jest test-renderer environment — so
 * children mount but stay under a provider that never resolves, and the
 * rendered tree comes out as an empty `<RNCSafeAreaProvider />`. The
 * package ships an official jest mock for exactly this; wire it in
 * globally so any test wrapping a screen in `SafeAreaProvider` (see
 * `__tests__/testUtils.tsx`) renders synchronously with fixed metrics.
 */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissAll: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  };

  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    useSegments: jest.fn(() => []),
    useFocusEffect: jest.fn(),
    useNavigation: () => ({ setOptions: jest.fn() }),
    Link: ({ children }) => children,
    Stack: Object.assign(
      ({ children }) => children,
      { Screen: () => null }
    ),
    Tabs: Object.assign(
      ({ children }) => children,
      { Screen: () => null }
    ),
    Redirect: () => null,
  };
});
