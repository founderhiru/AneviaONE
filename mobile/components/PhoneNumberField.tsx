import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput as RNTextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PHONE_COUNTRIES, nationalDigits, type PhoneCountry } from '../config/phoneCountries';
import { AUTH_BUTTON, BRAND_TYPE, SHEET } from '../design/brandSurface';

/** Field colours on the white sheet. */
const FIELD = { fill: '#F6F8F4', border: 'rgba(14, 42, 27, 0.18)', error: '#B42318' } as const;

/**
 * Two-part mobile number entry for the white sign-in sheet: a compact
 * country control (flag ▾) and the number field, which shows the country's
 * dial code before what the person types. Countries come from
 * config/phoneCountries, so adding one there adds it to the picker.
 */
export function PhoneNumberField({
  country,
  onCountryChange,
  value,
  onChangeText,
  hasError = false,
  onSubmit,
}: {
  country: PhoneCountry;
  onCountryChange: (country: PhoneCountry) => void;
  value: string;
  onChangeText: (digits: string) => void;
  hasError?: boolean;
  onSubmit?: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [focused, setFocused] = useState(false);
  const border = hasError ? FIELD.error : focused ? SHEET.emerald : FIELD.border;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => setPicking(true)}
        accessibilityRole="button"
        accessibilityLabel={`Country: ${country.name}, ${country.dialCode}`}
        accessibilityHint="Choose your country"
        testID="phone-country"
        style={({ pressed }) => [styles.box, styles.country, { borderColor: FIELD.border, opacity: pressed ? 0.75 : 1 }]}
      >
        <Text style={styles.flag} accessible={false}>
          {country.flag}
        </Text>
        <Ionicons name="chevron-down" size={16} color={SHEET.textMuted} />
      </Pressable>

      <View style={[styles.box, styles.number, { borderColor: border }]}>
        <Text style={styles.dialCode} testID="phone-dial-code">
          {country.dialCode}
        </Text>
        <RNTextInput
          value={value}
          onChangeText={(text) => onChangeText(nationalDigits(text, country))}
          placeholder="Enter mobile number"
          placeholderTextColor={SHEET.textFaint}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          maxLength={country.nationalLength}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={`Mobile number, after ${country.dialCode}`}
          selectionColor={SHEET.emerald}
          style={styles.input}
          testID="mobile-number-input"
        />
      </View>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicking(false)} accessibilityRole="button" accessibilityLabel="Close" />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Choose your country
            </Text>
            {PHONE_COUNTRIES.map((c) => (
              <Pressable
                key={c.iso}
                onPress={() => {
                  onCountryChange(c);
                  setPicking(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${c.dialCode}`}
                accessibilityState={{ selected: c.iso === country.iso }}
                testID={`phone-country-${c.iso}`}
                style={({ pressed }) => [styles.option, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.flag}>{c.flag}</Text>
                <Text style={styles.optionName}>{c.name}</Text>
                <Text style={styles.optionCode}>{c.dialCode}</Text>
                {c.iso === country.iso ? <Ionicons name="checkmark" size={20} color={SHEET.emerald} /> : <View style={styles.check} />}
              </Pressable>
            ))}
            <Text style={styles.sheetNote}>More countries are coming soon.</Text>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  box: {
    minHeight: AUTH_BUTTON.height,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: FIELD.fill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  country: { paddingHorizontal: 14, gap: 6, minWidth: 76, justifyContent: 'center' },
  flag: { fontSize: 22, lineHeight: 28 },
  number: { flex: 1, paddingLeft: 16, paddingRight: 12 },
  dialCode: { ...BRAND_TYPE.body, fontSize: 17, color: SHEET.ink, fontWeight: '500', marginRight: 10 },
  input: { ...BRAND_TYPE.body, flex: 1, fontSize: 17, color: SHEET.ink, paddingVertical: 14, letterSpacing: 0.4 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4, 17, 10, 0.55)' },
  sheet: {
    backgroundColor: SHEET.surface,
    borderTopLeftRadius: SHEET.radius,
    borderTopRightRadius: SHEET.radius,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sheetTitle: { ...BRAND_TYPE.title, fontSize: 20, lineHeight: 26, color: SHEET.ink, marginBottom: 8 },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SHEET.hairline },
  optionName: { ...BRAND_TYPE.body, flex: 1, color: SHEET.ink },
  optionCode: { ...BRAND_TYPE.body, color: SHEET.textMuted },
  check: { width: 20 },
  sheetNote: { ...BRAND_TYPE.fine, color: SHEET.textFaint, marginTop: 12, marginBottom: 8 },
});
