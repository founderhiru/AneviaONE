import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, ScreenContainer, ScreenHeader, SecondaryButton, TextInput } from '../../components';
import { BRAND } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { custodyService, type CustodyPerson, type DeletionPlan } from '../../services/custody/custodyService';
import { profileService } from '../../services/profile/profileService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';

/** Typed exactly, so the account is never deleted by a stray tap. */
export const DELETE_CONFIRMATION = 'DELETE';

const WHAT_IS_DELETED = [
  'Every report you added and its original file',
  'Your personal documents, including any a family member added to your record',
  'Every result in your Health Memory, including your corrections and confirmations',
  'Your identity details and your consent choices',
  'Your sign-in — you will be signed out on this device',
];

/**
 * Deleting the account: what goes, that it can't be undone, a typed
 * confirmation, and an honest outcome. The server (delete-account) also
 * requires a recent sign-in and deletes only the signed-in person.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ServiceError | null>(null);
  const [plan, setPlan] = useState<DeletionPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const confirmed = typed.trim() === DELETE_CONFIRMATION;

  const loadPlan = useCallback(async () => {
    try {
      setPlan(await custodyService.getPlan());
      setPlanError(null);
    } catch (e) {
      setPlanError(e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlan();
  }, [loadPlan]);

  // Deleting is only possible once every person you look after has a decision recorded.
  const decided = plan !== null && plan.unresolved === 0 && !plan.blockedByLegalHold;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await profileService.deleteAccount();
    } catch (e) {
      setError(e instanceof ServiceError ? e : new ServiceError('unknown', GENERIC_ERROR_MESSAGE, { retryable: true }));
      setDeleting(false);
      return;
    }
    // The account is gone: clear this device and say so on Welcome.
    await signOut('account_deleted').catch(() => undefined);
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Delete account" />

      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>
        This permanently deletes your {BRAND.productName} account and everything in it:
      </Text>
      <Card>
        <View style={{ gap: theme.spacing.xs }} testID="delete-account-scope">
          {WHAT_IS_DELETED.map((line) => (
            <Text key={line} style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
              {'•'} {line}
            </Text>
          ))}
        </View>
      </Card>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} testID="delete-account-kept">
        This can&rsquo;t be undone. We keep only an anonymous record of actions taken on the account, with no name, email or
        health information.
      </Text>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
        If you signed in with Apple, you can also remove {BRAND.productName} from your Apple Account settings (Sign in with
        Apple).
      </Text>

      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="delete-account-others-note">
        Files you added to someone else&rsquo;s record stay with them. Their record is theirs.
      </Text>

      {planError ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="delete-account-plan-error">
          {planError}
        </Text>
      ) : null}
      {plan && plan.people.length > 0 ? <CustodyDecisions plan={plan} onChanged={loadPlan} /> : null}

      <TextInput
        label={`Type ${DELETE_CONFIRMATION} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!deleting && (plan === null || decided)}
        testID="delete-account-confirm-input"
      />

      {error ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="delete-account-error">
          {error.userMessage}
        </Text>
      ) : null}
      {error?.code === 'reauthentication_required' ? (
        <SecondaryButton label="Sign out to sign in again" onPress={() => signOut().catch(() => undefined)} testID="delete-account-reauth" />
      ) : null}

      <Button
        label={error?.code === 'incomplete' || error?.code === 'network' ? 'Try again' : 'Delete my account'}
        onPress={handleDelete}
        disabled={!confirmed || deleting || !(plan === null ? !planError : decided)}
        loading={deleting}
        variant="destructive"
        testID="delete-account-submit"
      />
    </ScreenContainer>
  );
}

/**
 * Everyone you look after needs a decision before the account can go. There is no silent
 * deletion and no silent hand-over: you either keep your account, or you choose to delete each
 * person's records by typing their name. (Handing custody to someone else is not available yet.)
 */
function CustodyDecisions({ plan, onChanged }: { plan: DeletionPlan; onChanged: () => Promise<void> }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }} testID="delete-account-custody">
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        People you look after
      </Text>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
        Their records are theirs, so they can&rsquo;t be deleted without you deciding. Handing them to another family member isn&rsquo;t
        available yet. Either keep your account, or choose to delete each person&rsquo;s records below.
      </Text>
      {plan.blockedByLegalHold ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} testID="delete-account-hold">
          A record on your account is on hold and can&rsquo;t be deleted right now, so your account can&rsquo;t be deleted yet.
        </Text>
      ) : null}
      {plan.people.map((p) => (
        <CustodyPersonCard key={p.subjectId} person={p} onChanged={onChanged} />
      ))}
      <SecondaryButton label="Keep my account" onPress={() => router.back()} testID="delete-account-keep" />
    </View>
  );
}

function CustodyPersonCard({ person, onChanged }: { person: CustodyPerson; onChanged: () => Promise<void> }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = `${person.vaultFiles} ${person.vaultFiles === 1 ? 'document' : 'documents'}`;
  const reports = `${person.healthReports} ${person.healthReports === 1 ? 'health report' : 'health reports'}`;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(false);
      setTyped('');
      await onChanged();
    } catch (e) {
      setError(e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={{ gap: theme.spacing.xs }} testID={`custody-person-${person.subjectId}`}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{person.name}</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          {files} · {reports}
          {person.otherPeopleWithAccess > 0 ? ` · ${person.otherPeopleWithAccess} other ${person.otherPeopleWithAccess === 1 ? 'person' : 'people'} can see their records` : ''}
        </Text>
        {person.legalHold ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} testID={`custody-hold-${person.subjectId}`}>
            On hold: can&rsquo;t be deleted right now.
          </Text>
        ) : person.deleteConfirmed ? (
          <>
            <Text style={[theme.typography.labelMedium, { color: theme.colors.success }]} testID={`custody-decided-${person.subjectId}`}>
              Will be deleted with your account
            </Text>
            <SecondaryButton label="Undo" onPress={() => run(() => custodyService.cancelDeletion(person.subjectId))} loading={busy} testID={`custody-undo-${person.subjectId}`} />
          </>
        ) : open ? (
          <>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textPrimary }]}>
              This erases all of {person.name}&rsquo;s records and files. Other family members lose access. It can&rsquo;t be recovered.
            </Text>
            <TextInput label={`Type ${person.name} to confirm`} value={typed} onChangeText={setTyped} autoCorrect={false} editable={!busy} testID={`custody-typed-${person.subjectId}`} />
            <Button
              label={`Delete ${person.name}’s records with my account`}
              variant="destructive"
              onPress={() => run(() => custodyService.confirmDeletion(person.subjectId, typed))}
              disabled={typed.trim().length === 0 || busy}
              loading={busy}
              testID={`custody-confirm-${person.subjectId}`}
            />
            <SecondaryButton label="Not now" onPress={() => setOpen(false)} testID={`custody-cancel-${person.subjectId}`} />
          </>
        ) : (
          <Button label={`Delete ${person.name}’s records`} variant="secondary" onPress={() => setOpen(true)} testID={`custody-delete-${person.subjectId}`} />
        )}
        {error ? <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID={`custody-error-${person.subjectId}`}>{error}</Text> : null}
      </View>
    </Card>
  );
}
