import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button, Card, ErrorState, LoadingState, ScreenContainer, ScreenHeader, TextInput } from '../../components';
import { useTheme } from '../../design/theme';
import { checkDateOfBirth, checkFullName, splitDate } from '../../services/profile/identityValidation';
import { profileService } from '../../services/profile/profileService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';

/**
 * Identity details — full name and date of birth, entered by the person.
 * Used later to check that a health report belongs to them; entering them
 * doesn't verify any report by itself. Both are optional: leaving one empty
 * keeps it unset. Values are shown only here, never logged.
 */
export default function IdentityDetailsScreen() {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const identity = await profileService.getMyIdentity();
      setFullName(identity.fullName ?? '');
      const parts = splitDate(identity.dateOfBirth);
      setDay(parts.day);
      setMonth(parts.month);
      setYear(parts.year);
      setLoaded(true);
    } catch (error) {
      setLoadError(error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Any edit means what's on screen is no longer what was saved.
  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setSaved(false);
    setSaveError(null);
  };

  async function save() {
    const name = checkFullName(fullName);
    const dob = checkDateOfBirth(day, month, year);
    setNameError(name.ok ? null : name.error);
    setDateError(dob.ok ? null : dob.error);
    setSaveError(null);
    setSaved(false);
    if (!name.ok || !dob.ok) return;
    setSaving(true);
    try {
      const result = await profileService.updateMyIdentity({ fullName: name.value, dateOfBirth: dob.value });
      setFullName(result.fullName ?? '');
      setSaved(true);
    } catch (error) {
      // The entered values stay on screen so nothing has to be retyped.
      setSaveError(error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  const dateField = (label: string, value: string, onChange: (v: string) => void, maxLength: number, placeholder: string, testID: string) => (
    <View style={{ flex: maxLength === 4 ? 1.4 : 1 }}>
      <TextInput
        label={label}
        value={value}
        onChangeText={edit(onChange)}
        keyboardType="number-pad"
        maxLength={maxLength}
        placeholder={placeholder}
        accessibilityLabel={`${label} of birth`}
        testID={testID}
      />
    </View>
  );

  return (
    <ScreenContainer>
      <ScreenHeader title="Identity details" onBack={() => router.back()} />

      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accent} style={{ marginTop: 2 }} />
          <Text style={[theme.typography.bodySmall, { flex: 1, color: theme.colors.textSecondary }]}>
            Your identity details help us verify that a health report belongs to you before adding it to Health Memory.
            They&rsquo;re private to you and are only compared with the name and date of birth printed on your reports.
          </Text>
        </View>
      </Card>

      {loadError ? (
        <ErrorState description={loadError} onRetry={load} />
      ) : !loaded ? (
        <LoadingState label="Loading your details…" />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <TextInput
            label="Full name"
            value={fullName}
            onChangeText={edit(setFullName)}
            placeholder="As printed on your health reports"
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
              {dateField('Day', day, setDay, 2, 'DD', 'identity-dob-day')}
              {dateField('Month', month, setMonth, 2, 'MM', 'identity-dob-month')}
              {dateField('Year', year, setYear, 4, 'YYYY', 'identity-dob-year')}
            </View>
            {dateError ? (
              <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="identity-dob-error">
                {dateError}
              </Text>
            ) : null}
          </View>

          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            You can leave either one empty for now. Adding them doesn&rsquo;t verify a report by itself.
          </Text>

          <Button label="Save" onPress={save} loading={saving} testID="identity-save" />

          {saved ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }} accessibilityLiveRegion="polite" testID="identity-saved">
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Saved.</Text>
            </View>
          ) : null}
          {saveError ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="identity-save-error">
              {saveError}
            </Text>
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}
