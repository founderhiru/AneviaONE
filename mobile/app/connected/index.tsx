import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { BottomSheet, Card, ScreenContainer, ScreenHeader, StatusBadge } from '../../components';
import { AppleHealthCard } from '../../components/connected/AppleHealthCard';
import { ActionButton, IconTile, Segments, SourceCard, SourceStatusBadge, WearableTile } from '../../components/connected/ConnectedParts';
import { useTheme } from '../../design/theme';
import { useAppleHealth } from '../../hooks/useAppleHealth';
import { useAuth } from '../../hooks/useAuth';
import { usePeople } from '../../hooks/usePeople';
import { isOwnRecord } from '../../services/people/peopleService';
import { formatAdded, getRecordsSummary, type RecordsSummary } from '../../services/connected/connectedService';
import { byGroup, STATUS_LABEL, type Integration, type SourceGroup } from '../../services/connected/integrations';

type Panel = SourceGroup;
const PANELS: { key: Panel; label: string }[] = [
  { key: 'platform', label: 'Platforms' },
  { key: 'wearable', label: 'Wearables' },
  { key: 'records', label: 'Records' },
  { key: 'future', label: 'Future' },
];

const FLOW = [
  { icon: 'link-outline', label: 'Connect' },
  { icon: 'layers-outline', label: 'Consolidate' },
  { icon: 'bulb-outline', label: 'Understand' },
  { icon: 'trending-up-outline', label: 'Track progress' },
] as const;

/** What connected data feeds. `live` = works today from medical records; the rest need a connected platform. */
const OUTPUTS: { title: string; detail: string; live: boolean }[] = [
  { title: 'Biomarker intelligence', detail: 'Results from your lab reports, in one place', live: true },
  { title: 'Health trends and timeline', detail: 'How results move between reports', live: true },
  { title: 'Activity and fitness insights', detail: 'Needs a connected health platform', live: false },
  { title: 'Sleep and recovery insights', detail: 'Needs a connected health platform', live: false },
];

export default function ConnectedHealthScreen() {
  const theme = useTheme();
  const [panel, setPanel] = useState<Panel>('platform');
  const [sheet, setSheet] = useState(false);
  const [records, setRecords] = useState<RecordsSummary | null>(null);
  const [recordsError, setRecordsError] = useState(false);
  // Apple Health is the signed-in person's own data on this iPhone; never a family member's.
  const { user } = useAuth();
  const { active } = usePeople();
  const ownRecord = isOwnRecord(active);
  const apple = useAppleHealth(user?.id);

  // Refreshed when the screen is shown (e.g. back from adding a report).
  useFocusEffect(
    useCallback(() => {
      getRecordsSummary()
        .then((r) => {
          setRecordsError(false);
          setRecords(r);
        })
        .catch(() => setRecordsError(true));
    }, []),
  );

  const open = (route: NonNullable<Integration['route']>) => {
    setSheet(false);
    router.push(route);
  };
  const count = records?.documentCount ?? 0;
  const last = formatAdded(records?.lastAddedAt ?? null);
  const recordsStatus = count > 0 ? 'connected' : 'available';
  const items = byGroup(panel);

  return (
    <ScreenContainer>
      <ScreenHeader title="" />

      {/* 1 — Header */}
      <View style={{ gap: theme.spacing.xs }} testID="connected-header">
        <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          Connected Health
        </Text>
        <Text style={[theme.typography.bodyLarge, { color: theme.colors.textSecondary }]}>Bring your health data together. Understand the bigger picture.</Text>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>
          Results, activity and sleep make more sense side by side than apart.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }} testID="connected-privacy-chip">
          <Ionicons name="lock-closed-outline" size={16} color={theme.colors.accent} />
          <Text style={[theme.typography.labelMedium, { color: theme.colors.accent }]}>You choose what to connect and what to share.</Text>
        </View>
      </View>

      {/* 2 — Your sources */}
      <View style={{ gap: theme.spacing.sm }} testID="connected-sources">
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>Your sources</Text>
        <Card testID="source-records-live">
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <IconTile icon="folder-open-outline" active />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.xs }}>
                <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, flex: 1 }]}>Medical records</Text>
                <SourceStatusBadge status={recordsStatus} />
              </View>
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} testID="records-summary">
                {recordsError
                  ? 'We couldn’t load your documents right now.'
                  : records === null
                    ? 'Loading…'
                    : count > 0
                      ? `${count} ${count === 1 ? 'document' : 'documents'}${last ? ` · last added ${last}` : ''}`
                      : 'Nothing added yet.'}
              </Text>
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>Includes: test results, prescriptions, scans</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ActionButton label="Add a report" onPress={() => router.push('/add')} testID="records-add" />
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton label="Manage" onPress={() => router.push('/documents')} testID="records-manage" />
            </View>
          </View>
        </Card>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="devices-empty">
          {apple.offered
            ? apple.connected && ownRecord
              ? 'Apple Health is connected on this iPhone. Health Connect and wearables are coming soon.'
              : 'Apple Health can be connected below. Health Connect and wearables are coming soon.'
            : 'No health platforms or devices are connected yet. Apple Health and Health Connect are coming soon.'}
        </Text>
        <ActionButton label="Connect a source" onPress={() => setSheet(true)} primary icon="add" testID="connect-source" />
      </View>

      {/* 3 — Connect */}
      <View style={{ gap: theme.spacing.sm }} testID="connected-connect">
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>What you can bring in</Text>
        <Segments options={PANELS} value={panel} onChange={setPanel} testIDPrefix="connect-seg" />
        {panel === 'wearable' ? (
          <>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="wearables-explainer">
              Wearables don’t connect to AneviaONE directly. Once a health platform is connected, data your device app shares to it can reach AneviaONE.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: theme.spacing.xs }}>
              {items.map((i) => (
                <WearableTile key={i.id} item={i} />
              ))}
            </View>
          </>
        ) : (
          items.map((i) =>
            i.id === 'apple_health' && apple.offered ? (
              <AppleHealthCard key={i.id} state={apple} ownRecord={ownRecord} personName={active?.name} />
            ) : (
              <SourceCard key={i.id} item={i} onOpen={open} />
            ),
          )
        )}
      </View>

      {/* 4 — What AneviaONE does with your data */}
      <View style={{ gap: theme.spacing.sm }} testID="connected-flow">
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>What AneviaONE does with your data</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {FLOW.map((s, idx) => (
            <React.Fragment key={s.label}>
              <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
                <IconTile icon={s.icon} active />
                <Text style={[theme.typography.labelSmall, { color: theme.colors.textSecondary, textAlign: 'center' }]}>{s.label}</Text>
              </View>
              {idx < FLOW.length - 1 ? <Ionicons name="chevron-forward" size={14} color={theme.colors.textDisabled} /> : null}
            </React.Fragment>
          ))}
        </View>
        <Card padded={false}>
          {OUTPUTS.map((o, idx) => (
            <View
              key={o.title}
              testID={`output-${idx}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, padding: theme.spacing.sm, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{o.title}</Text>
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{o.detail}</Text>
              </View>
              <StatusBadge label={o.live ? STATUS_LABEL.available : STATUS_LABEL.coming_soon} tone={o.live ? 'accent' : 'neutral'} />
            </View>
          ))}
        </Card>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="ai-limits">
          AneviaONE uses AI to read your lab reports. It doesn’t diagnose conditions or replace your Doctor.
        </Text>
      </View>

      {/* 5 — Privacy and control */}
      <Card testID="connected-privacy" style={{ gap: theme.spacing.xs }}>
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>Privacy and control</Text>
        {[
          'Nothing connects unless you authorise it.',
          'You will choose which data types each source shares.',
          'You will be able to disconnect a source at any time.',
          'Your records are stored privately; only you and people you choose can see them.',
        ].map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
            <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.accent} style={{ marginTop: 2 }} />
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, flex: 1 }]}>{line}</Text>
          </View>
        ))}
        <Pressable onPress={() => router.push('/privacy')} accessibilityRole="button" testID="connected-open-privacy" style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.brandPrimary }]}>Privacy &amp; Security</Text>
        </Pressable>
      </Card>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Connect a source">
        <View style={{ gap: theme.spacing.xs }} testID="connect-sheet">
          {byGroup('records')
            .filter((i) => i.status === 'available' && i.route)
            .map((i) => (
              <Pressable
                key={i.id}
                onPress={() => open(i.route as NonNullable<Integration['route']>)}
                accessibilityRole="button"
                testID={`sheet-${i.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: theme.minTouchTarget + 8 }}
              >
                <Ionicons name={i.icon} size={22} color={theme.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyLarge, { color: theme.colors.textPrimary }]}>{i.name}</Text>
                  <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>Available now</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </Pressable>
            ))}
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, marginTop: theme.spacing.xs }]} testID="sheet-coming">
            {apple.offered ? 'Apple Health is under Platforms on this page. Health Connect, wearables and lab partners are coming soon.' : 'Apple Health, Health Connect, wearables and lab partners are coming soon.'}
          </Text>
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
