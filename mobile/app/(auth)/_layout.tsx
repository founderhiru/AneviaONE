import { Stack } from 'expo-router';

/**
 * Welcome is the anchor of the sign-in stack: a sign-in step reached
 * without history (a `router.replace`, a link, a restored state) still has
 * Welcome beneath it, so Back always has somewhere to go.
 */
export const unstable_settings = {
  anchor: 'welcome',
};

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="otp" />
      {/* Onboarding is entered by redirect once signed in; there is no
          sign-in step to swipe back to. */}
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
