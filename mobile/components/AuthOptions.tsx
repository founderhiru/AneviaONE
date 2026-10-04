import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Colours for dark emerald surfaces (Welcome, Make it yours).
const WHITE = '#F6F9F4';
const WARM_WHITE = '#FBF8EF';
const DEEP_EMERALD = '#0B3D2C';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Official Google "G" (gstatic.com/images/branding/googleg), used unmodified.
const GOOGLE_G = require('../assets/auth/google-g.png');

function AuthButton({
  label,
  icon,
  logo,
  onPress,
  primary = false,
  testID,
}: {
  label: string;
  icon?: IconName;
  /** Official brand artwork, shown in place of an icon glyph. */
  logo?: ImageSourcePropType;
  onPress: () => void;
  primary?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.button, primary ? styles.primary : styles.secondary, { opacity: pressed ? 0.85 : 1 }]}
    >
      {logo ? (
        <Image source={logo} style={[styles.buttonIcon, styles.buttonLogo]} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : icon ? (
        <Ionicons name={icon} size={20} color={primary ? DEEP_EMERALD : WHITE} style={styles.buttonIcon} />
      ) : null}
      <Text style={[styles.buttonLabel, { color: primary ? DEEP_EMERALD : WHITE }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The sign-in entry points, for dark emerald surfaces: Mobile (primary) and
 * Google (secondary). Used on Welcome and "Make it yours" so both lead into
 * the same existing login flow.
 *
 * Sign in with Apple is deliberately absent: it is not implemented (no
 * `expo-apple-authentication`, no `AuthService` method, no Supabase Apple
 * provider). Add its button here only once that exists end to end.
 */
export function AuthOptions() {
  return (
    <View style={styles.list}>
      <AuthButton
        primary
        label="Continue with Mobile"
        icon="phone-portrait-outline"
        onPress={() => router.push('/(auth)/login?method=mobile')}
        testID="continue-with-mobile"
      />
      <AuthButton
        label="Continue with Google"
        logo={GOOGLE_G}
        onPress={() => router.push('/(auth)/login?method=google')}
        testID="continue-with-google"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  button: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: WARM_WHITE },
  secondary: { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderWidth: 1, borderColor: 'rgba(246, 249, 244, 0.38)' },
  buttonIcon: { marginRight: 12 },
  buttonLogo: { width: 20, height: 20 },
  buttonLabel: { fontSize: 17, fontWeight: '600', letterSpacing: 0.1 },
});
