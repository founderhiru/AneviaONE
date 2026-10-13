import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer, ScreenHeader, SecondaryButton, TextInput } from '../../components';
import { BRAND } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { profileService } from '../../services/profile/profileService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';

/** Typed exactly, so the account is never deleted by a stray tap. */
export const DELETE_CONFIRMATION = 'DELETE';

const WHAT_IS_DELETED = [
  'Every report you added and its original file',
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
  const confirmed = typed.trim() === DELETE_CONFIRMATION;

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

      <TextInput
        label={`Type ${DELETE_CONFIRMATION} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!deleting}
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
        disabled={!confirmed || deleting}
        loading={deleting}
        variant="destructive"
        testID="delete-account-submit"
      />
    </ScreenContainer>
  );
}
