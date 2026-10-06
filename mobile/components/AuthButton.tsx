import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AUTH_BUTTON, BRAND_TYPE, FOREST } from '../design/brandSurface';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type AuthButtonVariant = 'primary' | 'outline' | 'apple';

/**
 * The one sign-in button for the brand surface. Mobile, Google and Apple —
 * on Welcome, Make it yours and every sign-in step — share its height,
 * corners and label type, so the choices read as a set.
 *
 *   primary  warm ivory (the main action on each screen)
 *   outline  hairline on the green field (Google, secondary actions)
 *   apple    Apple's black style: Apple logo, white "Continue with Apple",
 *            per Apple's guidelines for custom Sign in with Apple buttons
 */
export function AuthButton({
  label,
  onPress,
  variant = 'outline',
  icon,
  logo,
  loading = false,
  disabled = false,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: AuthButtonVariant;
  icon?: IconName;
  /** Official brand artwork (e.g. the Google "G"), shown in place of an icon. */
  logo?: ImageSourcePropType;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}) {
  const isDisabled = disabled || loading;
  const color = variant === 'primary' ? FOREST.ink : FOREST.ivory;
  const glyph = variant === 'apple' ? 'logo-apple' : icon;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={({ pressed }) => [styles.button, styles[variant], { opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {logo ? (
            <Image source={logo} style={[styles.icon, styles.logo]} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : glyph ? (
            <Ionicons name={glyph} size={variant === 'apple' ? 22 : AUTH_BUTTON.iconSize} color={color} style={styles.icon} />
          ) : null}
          <Text style={[styles.label, { color }]} maxFontSizeMultiplier={1.6}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: AUTH_BUTTON.height,
    borderRadius: AUTH_BUTTON.radius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: FOREST.warmIvory },
  outline: { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderWidth: 1, borderColor: FOREST.hairline },
  apple: { backgroundColor: '#000000', borderWidth: 1, borderColor: 'rgba(246, 249, 239, 0.22)' },
  icon: { marginRight: 12 },
  logo: { width: AUTH_BUTTON.iconSize, height: AUTH_BUTTON.iconSize },
  label: BRAND_TYPE.button,
});
