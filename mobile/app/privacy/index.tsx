import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Card, ScreenContainer, ScreenHeader } from '../../components';
import { useTheme } from '../../design/theme';
import { profileService } from '../../services/profile/profileService';

export default function PrivacyScreen() {
  const theme = useTheme();
  const [requesting, setRequesting] = useState<'download' | 'delete' | null>(null);

  async function handleDownload() {
    setRequesting('download');
    await profileService.requestDataDownload();
    setRequesting(null);
    Alert.alert('Request received', "We'll prepare your data and notify you when it's ready to download.");
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
            await profileService.requestAccountDeletion();
            setRequesting(null);
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
          Your health information belongs to you. You control what&rsquo;s stored, what&rsquo;s shared, and who can
          see it.
        </Text>
      </View>

      <Row
        icon="share-social-outline"
        label="Data Sharing"
        description="Choose what you allow this app to share, and with whom."
        onPress={() => router.push('/privacy/data-sharing')}
      />
      <Row
        icon="link-outline"
        label="Connected Services"
        description="Manage apps and services linked to your account."
        onPress={() => router.push('/whatsapp')}
      />
      <Row
        icon="download-outline"
        label="Download My Data"
        description="Get a copy of everything stored in your Health Memory."
        onPress={handleDownload}
        loading={requesting === 'download'}
      />
      <Row
        icon="trash-outline"
        label="Delete Account"
        description="Permanently delete your account and all associated data."
        onPress={handleDeleteAccount}
        loading={requesting === 'delete'}
        danger
      />
    </ScreenContainer>
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
