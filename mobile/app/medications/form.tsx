import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button, Card, ErrorState, LoadingState, ScreenContainer, ScreenHeader, SecondaryButton, TextInput } from '../../components';
import { useTheme } from '../../design/theme';
import { usePeople } from '../../hooks/usePeople';
import { healthService } from '../../services/health/healthService';
import { MEDICATION_LIMITS, medicationService, STATUS_CHOICES, type MedicationStatusChoice } from '../../services/health/medicationService';
import { canAddReports, isOwnRecord } from '../../services/people/peopleService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { Medication } from '../../types';

const messageOf = (e: unknown) => (e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
const STATUS_FROM: Record<Medication['status'], MedicationStatusChoice> = { active: 'active', as_needed: 'as_needed', past: 'stopped', recorded: 'active' };

/**
 * Add a medicine by hand, or change one (`?id=<record id>`). Opened from an unread prescription
 * it carries `?fromDocument=<id>` so the person can look at the original while they type.
 * Everything is stored exactly as typed. Nothing is suggested, completed or interpreted.
 */
export default function MedicationFormScreen() {
  const theme = useTheme();
  const { id, fromDocument } = useLocalSearchParams<{ id?: string; fromDocument?: string }>();
  const { active } = usePeople();
  const editing = typeof id === 'string' && id.length > 0;
  const allowed = canAddReports(active);

  const [original, setOriginal] = useState<Medication | null>(null);
  const [loading, setLoading] = useState(editing);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [status, setStatus] = useState<MedicationStatusChoice>('active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let live = true;
    healthService
      .getMedications()
      .then((list) => {
        if (!live) return;
        const found = list.find((m) => m.recordId === id) ?? null;
        if (!found) setMissing(true);
        else {
          setOriginal(found);
          setName(found.name);
          setDose(found.dosage ?? '');
          setFrequency(found.frequency ?? '');
          setDuration(found.duration ?? '');
          setInstructions(found.instructions ?? '');
          setPrescriber(found.prescribedBy ?? '');
          setStatus(STATUS_FROM[found.status]);
        }
      })
      .catch(() => live && setMissing(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [editing, id]);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/medications'));

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      done();
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  const save = () =>
    run(() => {
      const fields = { name, dose, frequency, duration, instructions, prescriber, status };
      return editing ? medicationService.update(id as string, fields) : medicationService.add(fields);
    });

  const who = active && !isOwnRecord(active) ? active.name : null;
  const typedIn = original?.origin === 'user_entered' || original?.origin === 'user_corrected';

  return (
    <ScreenContainer>
      <ScreenHeader title={editing ? 'Change medicine' : 'Add a medicine'} />
      {!allowed ? (
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]} testID="medication-not-allowed">
          You can look at {who ?? 'this person'}&rsquo;s medicines, but only they or the person who manages their record can add or change them.
        </Text>
      ) : loading ? (
        <LoadingState label="Loading…" />
      ) : missing ? (
        <ErrorState description="That medicine is no longer in the list." onRetry={done} />
      ) : (
        <View style={{ gap: theme.spacing.md }} testID="medication-form">
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
            {who ? `For ${who}. ` : ''}Type it as written on the prescription or the strip. It is saved exactly as you type it and marked as added by you.
          </Text>
          {fromDocument ? (
            <SecondaryButton label="View the prescription" onPress={() => router.push(`/documents/${fromDocument}`)} testID="medication-view-prescription" />
          ) : null}

          <TextInput label="Medicine name" value={name} onChangeText={setName} maxLength={MEDICATION_LIMITS.name} autoCapitalize="words" autoCorrect={false} editable={!busy} placeholder="Metformin" testID="medication-name" />
          <TextInput label="Dose (optional)" value={dose} onChangeText={setDose} maxLength={MEDICATION_LIMITS.dose} autoCorrect={false} editable={!busy} placeholder="500 mg" testID="medication-dose" />
          <TextInput label="When to take it (optional)" value={frequency} onChangeText={setFrequency} maxLength={MEDICATION_LIMITS.frequency} autoCorrect={false} editable={!busy} placeholder="1-0-1" helperText="As written, such as 1-0-1 or twice a day." testID="medication-frequency" />
          <TextInput label="For how long (optional)" value={duration} onChangeText={setDuration} maxLength={MEDICATION_LIMITS.duration} autoCorrect={false} editable={!busy} placeholder="30 days" testID="medication-duration" />
          <TextInput label="Instructions (optional)" value={instructions} onChangeText={setInstructions} maxLength={MEDICATION_LIMITS.instructions} editable={!busy} placeholder="After food" testID="medication-instructions" />
          <TextInput label="Prescribed by (optional)" value={prescriber} onChangeText={setPrescriber} maxLength={MEDICATION_LIMITS.prescriber} autoCapitalize="words" autoCorrect={false} editable={!busy} placeholder="Dr. Rao" testID="medication-prescriber" />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {STATUS_CHOICES.map((c) => {
              const selected = c.value === status;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setStatus(c.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`medication-status-${c.value}`}
                  style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surface }}
                >
                  <Text style={[theme.typography.labelMedium, { color: selected ? theme.colors.textOnDark : theme.colors.textPrimary }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="medication-error">
              {error}
            </Text>
          ) : null}
          <Button label={editing ? 'Save changes' : 'Add medicine'} onPress={save} loading={busy} disabled={name.trim().length === 0} testID="medication-save" />

          {editing ? (
            <Card>
              <View style={{ gap: theme.spacing.xs }}>
                {original?.status !== 'past' ? (
                  <SecondaryButton label="Mark as stopped" onPress={() => run(() => medicationService.stop(id as string))} testID="medication-stop" />
                ) : null}
                {typedIn ? (
                  confirmRemove ? (
                    <View style={{ gap: theme.spacing.xs }} testID="medication-remove-box">
                      <Text style={[theme.typography.bodySmall, { color: theme.colors.textPrimary }]}>Remove {original?.name} from the list? Use this for a mistake. If it was stopped, mark it as stopped instead.</Text>
                      <Button label="Remove" variant="destructive" onPress={() => run(() => medicationService.remove(id as string))} testID="medication-remove-confirm" />
                      <SecondaryButton label="Keep it" onPress={() => setConfirmRemove(false)} testID="medication-remove-cancel" />
                    </View>
                  ) : (
                    <Pressable onPress={() => setConfirmRemove(true)} accessibilityRole="button" testID="medication-remove" style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}>
                      <Text style={[theme.typography.labelLarge, { color: theme.colors.danger }]}>Remove this medicine</Text>
                    </Pressable>
                  )
                ) : (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} testID="medication-from-report-note">
                    This medicine was read from a report. You can change it or mark it as stopped; the original reading is kept.
                  </Text>
                )}
              </View>
            </Card>
          ) : null}
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            AneviaONE doesn&rsquo;t check medicine names or doses and doesn&rsquo;t give advice. Ask your Doctor or pharmacist about your medicines.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}
