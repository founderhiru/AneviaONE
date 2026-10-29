import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../design/theme';

export type AvatarProps = {
  name?: string;
  uri?: string;
  size?: number;
};

/**
 * Initials from a real name: first + last word ("Hiranya Talukdar" → "HT"), or one
 * letter for a single name. Only letters count, so an email-like or numeric value
 * never becomes an avatar label. Returns null when there is nothing to show.
 */
export function initialsFor(name?: string | null): string | null {
  if (!name) return null;
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => Array.from(w).find((ch) => /\p{L}/u.test(ch)) ?? '')
    .filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, uri, size = 44 }: AvatarProps) {
  const theme = useTheme();
  const initials = initialsFor(name);
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={dimensionStyle}
        accessibilityLabel={name ? `${name}'s profile photo` : 'Profile photo'}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        dimensionStyle,
        { backgroundColor: theme.colors.brandPrimary },
      ]}
      accessibilityLabel={name ? `${name}'s profile photo` : 'Profile photo'}
    >
      {initials ? (
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textOnDark }]}>{initials}</Text>
      ) : (
        // No name yet: a neutral person icon, never a "?".
        <Ionicons name="person" size={Math.round(size * 0.5)} color={theme.colors.textOnDark} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
