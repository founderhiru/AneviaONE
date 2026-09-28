import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '../design/theme';

export type CardProps = ViewProps & {
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
};

/** Base surface used by most higher-level cards. Relies on a border rather
 * than heavy shadow, per the design system's "avoid excessive cards" rule. */
export function Card({ children, style, onPress, accessibilityLabel, padded = true, ...rest }: CardProps) {
  const theme = useTheme();
  const content = (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.lg,
          padding: padded ? theme.spacing.md : 0,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.pressable, { opacity: pressed ? 0.85 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {},
});
