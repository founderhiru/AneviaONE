import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';

export type AvatarProps = {
  name?: string;
  uri?: string;
  size?: number;
};

function initialsFor(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, uri, size = 44 }: AvatarProps) {
  const theme = useTheme();
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
      <Text style={[theme.typography.labelLarge, { color: theme.colors.textOnDark }]}>{initialsFor(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
