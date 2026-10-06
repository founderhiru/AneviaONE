import React, { useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, View, type TextInputProps as RNTextInputProps } from 'react-native';

import { FOREST } from '../design/brandSurface';
import { useTheme } from '../design/theme';

export type TextInputProps = RNTextInputProps & {
  label?: string;
  errorText?: string;
  helperText?: string;
  /** `onBrand` for the forest-green sign-in surface. */
  appearance?: 'default' | 'onBrand';
};

export function TextInput({ label, errorText, helperText, appearance = 'default', style, onFocus, onBlur, ...rest }: TextInputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(errorText);
  const onBrand = appearance === 'onBrand';
  const c = onBrand
    ? { label: FOREST.textMuted, placeholder: FOREST.textFaint, text: FOREST.text, fill: FOREST.inputFill, border: FOREST.hairline, focus: FOREST.gold, danger: FOREST.danger, hint: FOREST.textMuted }
    : {
        label: theme.colors.textSecondary,
        placeholder: theme.colors.textTertiary,
        text: theme.colors.textPrimary,
        fill: theme.colors.surface,
        border: theme.colors.border,
        focus: theme.colors.focusRing,
        danger: theme.colors.danger,
        hint: theme.colors.textTertiary,
      };

  return (
    <View style={{ gap: theme.spacing.xxs }}>
      {label ? (
        <Text style={[theme.typography.labelMedium, { color: c.label }]}>{label}</Text>
      ) : null}
      <RNTextInput
        accessibilityLabel={label}
        placeholderTextColor={c.placeholder}
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
            color: c.text,
            backgroundColor: c.fill,
            borderColor: hasError ? c.danger : focused ? c.focus : c.border,
            borderRadius: onBrand ? 14 : theme.radius.sm,
            minHeight: onBrand ? 56 : theme.minTouchTarget,
            paddingHorizontal: theme.spacing.md,
          },
          style,
        ]}
        {...rest}
      />
      {errorText ? (
        <Text style={[theme.typography.caption, { color: c.danger }]} accessibilityLiveRegion="polite">
          {errorText}
        </Text>
      ) : helperText ? (
        <Text style={[theme.typography.caption, { color: c.hint }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
  },
});
