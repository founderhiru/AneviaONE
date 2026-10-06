import React, { useRef } from 'react';
import { StyleSheet, TextInput as RNTextInput, View } from 'react-native';

import { FOREST } from '../design/brandSurface';
import { useTheme } from '../design/theme';

export type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  errorText?: string;
  /** `onBrand` for the forest-green sign-in surface. */
  appearance?: 'default' | 'onBrand';
};

/** A row of single-digit boxes backed by one hidden input for reliable
 * autofill/paste behavior on both iOS and Android. */
export function OtpInput({ length = 6, value, onChange, errorText, appearance = 'default' }: OtpInputProps) {
  const theme = useTheme();
  const onBrand = appearance === 'onBrand';
  const c = onBrand
    ? { danger: FOREST.danger, focus: FOREST.gold, border: FOREST.hairline, fill: FOREST.inputFill, text: FOREST.text }
    : { danger: theme.colors.danger, focus: theme.colors.focusRing, border: theme.colors.border, fill: theme.colors.surface, text: theme.colors.textPrimary };
  const inputRef = useRef<RNTextInput>(null);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={styles.row} accessible accessibilityLabel={`One time passcode, ${value.length} of ${length} digits entered`}>
        {digits.map((digit, index) => {
          const isActive = index === value.length;
          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  borderColor: errorText ? c.danger : isActive ? c.focus : c.border,
                  borderRadius: theme.radius.sm,
                  backgroundColor: c.fill,
                },
              ]}
            >
              <RNTextInput
                editable={false}
                value={digit}
                style={[theme.typography.headingMedium, { color: c.text, textAlign: 'center' }]}
                importantForAccessibility="no"
              />
            </View>
          );
        })}
      </View>
      {/* Invisible input carries actual focus + keyboard + autofill */}
      <RNTextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        style={styles.hiddenInput}
        accessibilityLabel="Enter one time passcode"
        testID="otp-hidden-input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  box: {
    // Six boxes share the row so they fit narrow phones too.
    flex: 1,
    maxWidth: 52,
    height: 56,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: '100%',
  },
});
