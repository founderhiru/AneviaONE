import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Avatar, Card, LoadingState, ScreenContainer } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { healthService } from '../../services/health/healthService';
import type { HealthProfile } from '../../types';

type Row = { label: string; onPress: () => void; danger?: boolean };

function RowList({ rows }: { rows: Row[] }) {
  const theme = useTheme();
  return (
    <Card padded={false}>
      {rows.map((row, index) => (
        <Pressable
          key={row.label}
          onPress={row.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: theme.minTouchTarget,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.bodyLarge,
              { color: row.danger ? theme.colors.danger : theme.colors.textPrimary },
            ]}
          >
            {row.label}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </Pressable>
      ))}
    </Card>
  );
}

export default function MeScreen() {
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    healthService
      .getHealthProfile()
      .then(setProfile)
      .catch(() => setProfileError(true));
  }, []);

  const displayIdentity =
    user?.linkedIdentities.find((i) => i.provider === 'mobile_otp')?.displayValue ??
    user?.linkedIdentities[0]?.displayValue ??
    'Your account';

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Avatar name={user?.fullName} />
        <View>
          <Text style={[theme.typography.headingMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            {user?.fullName ?? 'Profile'}
          </Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{displayIdentity}</Text>
        </View>
      </View>

      {profileError ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          We couldn&rsquo;t load your summary right now.
        </Text>
      ) : !profile ? (
        <LoadingState label="Loading your profile…" />
      ) : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Card style={{ flex: 1 }}>
            <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>{profile.recordCount}</Text>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{PRODUCT_TERMS.healthMemory}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>{profile.documentCount}</Text>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>Documents</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>{profile.activeMedicationCount}</Text>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>Medications</Text>
          </Card>
        </View>
      )}

      <RowList
        rows={[
          { label: 'My documents', onPress: () => router.push('/documents') },
          { label: 'WhatsApp — Connected Services', onPress: () => router.push('/whatsapp') },
          { label: `${PRODUCT_TERMS.familyHealth} (coming soon)`, onPress: () => router.push('/family') },
        ]}
      />

      <RowList
        rows={[
          { label: 'Privacy & Security', onPress: () => router.push('/privacy') },
          { label: 'Data Sharing', onPress: () => router.push('/privacy/data-sharing') },
          { label: `${PRODUCT_TERMS.doctorBrief} (preview)`, onPress: () => router.push('/doctor-brief') },
        ]}
      />

      <RowList
        rows={[
          { label: 'Notifications', onPress: () => {} },
          { label: 'Language', onPress: () => {} },
          { label: 'Help', onPress: () => {} },
          { label: 'About', onPress: () => {} },
        ]}
      />

      <RowList rows={[{ label: 'Sign out', onPress: signOut, danger: true }]} />
    </ScreenContainer>
  );
}
