import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Card, ScreenContainer, ScreenHeader } from '../../components';
import { useTheme } from '../../design/theme';
import { AI_CONSENT_COPY, consentService, type AiConsentState } from '../../services/consent/consentService';
import { profileService } from '../../services/profile/profileService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';

const errorMessage = (error: unknown) => (error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);

export default function PrivacyScreen() {
  const theme = useTheme();
  const [requesting, setRequesting] = useState<'download' | 'delete' | 'consent' | null>(null);
  const [consent, setConsent] = useState<AiConsentState | null>(null);

  const loadConsent = useCallback(async () => {
    try {
      setConsent(await consentService.getAiConsent());
    } catch {
      setConsent(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConsent();
  }, [loadConsent]);

  async function changeConsent(grant: boolean) {
    setRequesting('consent');
    try {
      if (grant) await consentService.grantAiConsent();
      else await consentService.revokeAiConsent();
      await loadConsent();
    } catch (error) {
      Alert.alert('Report reading', errorMessage(error));
    } finally {
      setRequesting(null);
    }
  }

  function handleConsent() {
    if (consent?.granted) {
      Alert.alert(
        'Turn off report reading?',
        'New reports won’t be read or added to your Health Memory. Your stored originals and results already added stay in your account.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn off', style: 'destructive', onPress: () => changeConsent(false) },
        ]
      );
    } else {
      Alert.alert(AI_CONSENT_COPY.title, AI_CONSENT_COPY.points.join('\n\n'), [
        { text: AI_CONSENT_COPY.decline, style: 'cancel' },
        { text: 'Allow', onPress: () => changeConsent(true) },
      ]);
    }
  }

  async function handleDownload() {
    setRequesting('download');
    try {
      await profileService.requestDataDownload();
      Alert.alert('Request received', "We'll prepare your data and notify you when it's ready to download.");
    } catch (error) {
      Alert.alert('Download My Data', errorMessage(error));
    } finally {
      setRequesting(null);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your Health Memory and cannot be undone. This is a UI preview — no account will actually be deleted yet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRequesting('delete');
            try {
              await profileService.requestAccountDeletion();
            } catch (error) {
              Alert.alert('Delete account', errorMessage(error));
            } finally {
              setRequesting(null);
            }
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Privacy & Security" />

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
        <Ionicons name="shield-checkmark-outline" size={22} color={theme.colors.brandSecondary} />
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary, flex: 1 }]}>
          Your health data is yours. You control what&rsquo;s stored, what&rsquo;s shared, and who can see it.
        </Text>
      </View>

      <InfoRow
        icon="lock-closed-outline"
        label="Private by design"
        description="Your Health Memory is built around your records alone — it isn't used to train models or shared for advertising."
      />
      <InfoRow
        icon="server-outline"
        label="Secure storage"
        description="Records are stored encrypted and access is limited to what each part of the app needs to function."
      />
      <Row
        icon="share-social-outline"
        label="You control sharing"
        description="Choose what you allow this app to share, and with whom."
        onPress={() => router.push('/privacy/data-sharing')}
      />
      <Row
        icon="document-text-outline"
        label="Report reading (AI)"
        description={
          consent === null
            ? 'Checking…'
            : consent.granted
              ? `On — your report text is read by our AI provider (Anthropic) to add results to your Health Memory. Since ${new Date(consent.recordedAt ?? '').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Tap to turn off.`
              : 'Off — reports are stored but not read. Tap to turn on.'
        }
        onPress={handleConsent}
        loading={requesting === 'consent'}
      />
      <InfoRow
        icon="sparkles-outline"
        label="Transparent AI"
        description="Every AI-generated explanation is shown separately from your factual records, with the source document linked so you can check it yourself."
      />
      {/* No "Connected Services": the only one (WhatsApp) isn't available yet;
          its /whatsapp screen stays parked. */}
      <Row
        icon="download-outline"
        label="Download My Data"
        description="Get a copy of everything stored in your Health Memory."
        onPress={handleDownload}
        loading={requesting === 'download'}
      />
      <Row
        icon="trash-outline"
        label="Delete your data"
        description="Permanently delete your account and all associated data."
        onPress={handleDeleteAccount}
        loading={requesting === 'delete'}
        danger
      />
    </ScreenContainer>
  );
}

function InfoRow({
  icon,
  label,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
        <Ionicons name={icon} size={22} color={theme.colors.brandSecondary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{label}</Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{description}</Text>
        </View>
      </View>
    </Card>
  );
}

function Row({
  icon,
  label,
  description,
  onPress,
  danger,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={label}>
      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <Ionicons name={icon} size={22} color={danger ? theme.colors.danger : theme.colors.brandPrimary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.typography.labelLarge, { color: danger ? theme.colors.danger : theme.colors.textPrimary }]}>
              {label}
            </Text>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{description}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
