import React, { useRef } from 'react';
import { StyleSheet, TextInput as RNTextInput, View } from 'react-native';

import { useTheme } from '../design/theme';

export type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  errorText?: string;
};

/** A row of single-digit boxes backed by one hidden input for reliable
 * autofill/paste behavior on both iOS and Android. */
export function OtpInput({ length = 6, value, onChange, errorText }: OtpInputProps) {
  const theme = useTheme();
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
                  borderColor: errorText ? theme.colors.danger : isActive ? theme.colors.focusRing : theme.colors.border,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <RNTextInput
                editable={false}
                value={digit}
                style={[theme.typography.headingMedium, { color: theme.colors.textPrimary, textAlign: 'center' }]}
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
    width: 48,
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
