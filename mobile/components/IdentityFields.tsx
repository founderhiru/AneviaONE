import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../design/theme';
import type { IdentityForm, IdentityFormFields } from '../hooks/useIdentityForm';
import { TextInput } from './TextInput';

export type IdentityFieldsProps = {
  form: IdentityForm;
  /** Shown inside the empty name field. */
  namePlaceholder?: string;
  /** Shown under the name field when there's no error. */
  nameHint?: string;
};

/**
 * Full name + date of birth (Day / Month / Year) inputs, bound to
 * `useIdentityForm`. Used by Identity details and by the first-time
 * "Set up your health profile" step, so both look and validate the same.
 */
export function IdentityFields({ form, namePlaceholder, nameHint }: IdentityFieldsProps) {
  const theme = useTheme();
  const { fields, setField, nameError, dateError } = form;

  const dateField = (field: Exclude<keyof IdentityFormFields, 'fullName'>, label: string, maxLength: number, placeholder: string) => (
    <View style={{ flex: maxLength === 4 ? 1.4 : 1 }}>
      <TextInput
        label={label}
        value={fields[field]}
        onChangeText={(v) => setField(field, v)}
        keyboardType="number-pad"
        maxLength={maxLength}
        placeholder={placeholder}
        accessibilityLabel={`${label} of birth`}
        testID={`identity-dob-${field}`}
      />
    </View>
  );

  return (
    <View style={{ gap: theme.spacing.md }}>
      <TextInput
        label="Full name"
        value={fields.fullName}
        onChangeText={(v) => setField('fullName', v)}
        placeholder={namePlaceholder}
        helperText={nameHint}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="name"
        textContentType="name"
        maxLength={220}
        errorText={nameError ?? undefined}
        testID="identity-full-name"
      />

      <View style={{ gap: theme.spacing.xxs }}>
        <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Date of birth</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {dateField('day', 'Day', 2, 'DD')}
          {dateField('month', 'Month', 2, 'MM')}
          {dateField('year', 'Year', 4, 'YYYY')}
        </View>
        {dateError ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="identity-dob-error">
            {dateError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
