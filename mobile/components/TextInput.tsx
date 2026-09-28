import React, { useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, View, type TextInputProps as RNTextInputProps } from 'react-native';

import { useTheme } from '../design/theme';

export type TextInputProps = RNTextInputProps & {
  label?: string;
  errorText?: string;
  helperText?: string;
};

export function TextInput({ label, errorText, helperText, style, onFocus, onBlur, ...rest }: TextInputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(errorText);

  return (
    <View style={{ gap: theme.spacing.xxs }}>
      {label ? (
        <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>{label}</Text>
      ) : null}
      <RNTextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textTertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          theme.typography.bodyLarge,
          {
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            borderColor: hasError ? theme.colors.danger : focused ? theme.colors.focusRing : theme.colors.border,
            borderRadius: theme.radius.sm,
            minHeight: theme.minTouchTarget,
            paddingHorizontal: theme.spacing.md,
          },
          style,
        ]}
        {...rest}
      />
      {errorText ? (
        <Text style={[theme.typography.caption, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">
          {errorText}
        </Text>
      ) : helperText ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
  },
});
