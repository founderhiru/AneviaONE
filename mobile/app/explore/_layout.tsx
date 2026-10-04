import { Stack } from 'expo-router';

/**
 * Explore: a read-only sample health history anyone can open from Welcome
 * without signing in. Public alongside `(auth)` (see the redirect in
 * `app/_layout.tsx`); its data is static (`content/exploreSample.ts`) and
 * never touches the signed-in person's Health Memory.
 */
export default function ExploreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="memory" />
      <Stack.Screen name="changes" />
      <Stack.Screen name="timeline" />
      <Stack.Screen name="ask" />
      <Stack.Screen name="make-it-yours" options={{ animation: 'fade' }} />
    </Stack>
  );
}
