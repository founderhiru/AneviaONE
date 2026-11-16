import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BottomSheet } from '../BottomSheet';
import { Card } from '../Card';
import { useTheme } from '../../design/theme';
import type { AppleHealthState } from '../../hooks/useAppleHealth';
import { APPLE_HEALTH_READS, formatSleep } from '../../services/connected/appleHealth';
import { ActionButton, IconTile, SourceStatusBadge } from './ConnectedParts';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/**
 * Apple Health on Connected Health, when this build and iPhone offer it. It is the signed-in
 * person's own data: on a family member's record there is nothing to connect and nothing shown.
 * What it reads stays on this iPhone.
 */
export function AppleHealthCard({ state, ownRecord, personName }: { state: AppleHealthState; ownRecord: boolean; personName?: string }) {
  const theme = useTheme();
  const [sheet, setSheet] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const small = [theme.typography.bodySmall, { color: theme.colors.textTertiary }] as const;
  const week = state.week;

  const metrics: { key: string; label: string; value: string | null; note?: string }[] = week
    ? [
        { key: 'steps', label: 'Steps', value: week.averageSteps === null ? null : week.averageSteps.toLocaleString('en-IN'), note: 'a day' },
        { key: 'sleep', label: 'Sleep', value: formatSleep(week.averageSleepMinutes), note: 'a night' },
        { key: 'heart', label: 'Resting heart rate', value: week.restingHeartRate === null ? null : `${week.restingHeartRate}`, note: 'beats a minute' },
        { key: 'workouts', label: 'Workouts', value: `${week.workouts}`, note: 'this week' },
      ]
    : [];

  return (
    <Card testID="apple-health-card">
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <IconTile icon="heart-outline" active={state.connected} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.xs }}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, flex: 1 }]}>Apple Health</Text>
            <SourceStatusBadge status={ownRecord && state.connected ? 'connected' : 'available'} />
          </View>
          {!ownRecord ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} testID="apple-health-other-person">
              Apple Health belongs to the person whose iPhone this is. It is only shown on your own record, never on {personName ?? 'a family member'}’s.
            </Text>
          ) : state.connected ? (
            <Text style={[...small]} testID="apple-health-last-read">
              {week ? `Last 7 days · read at ${time(week.readAt)} · stays on this iPhone` : 'Reading from Apple Health…'}
            </Text>
          ) : (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
              See your steps, sleep, resting heart rate and workouts here. Read on this iPhone only.
            </Text>
          )}
        </View>
      </View>

      {ownRecord && state.connected && week ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: theme.spacing.xs, marginTop: theme.spacing.sm }} testID="apple-health-week">
          {metrics.map((m) => (
            <View key={m.key} testID={`apple-health-${m.key}`} style={{ width: '48.5%', padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt }}>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{m.label}</Text>
              <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>{m.value ?? 'No data'}</Text>
              {m.value ? <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{m.note}</Text> : null}
            </View>
          ))}
          <Text style={[...small, { width: '100%' }]} testID="apple-health-empty-hint">
            These are averages of what Apple Health recorded, not medical advice. “No data” can mean nothing was recorded, or that reading it isn’t allowed in the Health app.
          </Text>
        </View>
      ) : null}

      {state.error ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger, marginTop: theme.spacing.xs }]} testID="apple-health-error">
          {state.error}
        </Text>
      ) : null}

      {ownRecord ? (
        state.connected ? (
          confirmOff ? (
            <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }} testID="apple-health-disconnect-box">
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textPrimary }]}>
                AneviaONE will stop reading and forget this connection. To withdraw the permission itself, open the Health app → your picture → Apps → AneviaONE.
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <ActionButton label="Disconnect" onPress={() => { setConfirmOff(false); state.disconnect(); }} testID="apple-health-disconnect-confirm" />
                </View>
                <View style={{ flex: 1 }}>
                  <ActionButton label="Keep it" onPress={() => setConfirmOff(false)} testID="apple-health-disconnect-cancel" />
                </View>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <ActionButton label={state.busy ? 'Reading…' : 'Read again'} onPress={state.refresh} testID="apple-health-refresh" />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton label="Disconnect" onPress={() => setConfirmOff(true)} testID="apple-health-disconnect" />
              </View>
            </View>
          )
        ) : (
          <View style={{ marginTop: theme.spacing.sm }}>
            <ActionButton label="Connect Apple Health" onPress={() => setSheet(true)} primary testID="apple-health-connect" />
          </View>
        )
      ) : null}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Before you connect">
        <View style={{ gap: theme.spacing.sm }} testID="apple-health-consent">
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>AneviaONE will ask to read, for the last 7 days:</Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>{APPLE_HEALTH_READS.join(' · ')}</Text>
          {[
            'It is read on this iPhone and shown to you here.',
            'It is not uploaded to AneviaONE and not stored on our servers.',
            'It is never sent to an AI provider.',
            'It is for your own record only, never a family member’s.',
            'AneviaONE never writes to Apple Health.',
            'You can disconnect at any time.',
          ].map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.accent} style={{ marginTop: 2 }} />
              <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, flex: 1 }]}>{line}</Text>
            </View>
          ))}
          <Text style={[...small]}>Next, your iPhone will ask which of these to allow. You choose each one.</Text>
          <ActionButton
            label="Continue"
            primary
            onPress={() => {
              setSheet(false);
              state.connect();
            }}
            testID="apple-health-consent-continue"
          />
          <ActionButton label="Not now" onPress={() => setSheet(false)} testID="apple-health-consent-cancel" />
        </View>
      </BottomSheet>
    </Card>
  );
}
