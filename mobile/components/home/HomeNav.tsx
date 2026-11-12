import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AiConsentCard, Avatar, Card, LoadingState, ProcessingState, READING_COPY, readingSteps, ScreenContainer } from '../index';
import { ChangeSummaryCard, CheckCard } from './HomeV2UI';
import { SummaryTiles } from './WhatChangedUI';
import { isDemoMode } from '../../config/appMode';
import { VAULT_ENABLED } from '../../config/vaultFlag';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { useAutoRead } from '../../hooks/useAutoRead';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { useObligations } from '../../hooks/useObligations';
import { usePeople } from '../../hooks/usePeople';
import { documentsService } from '../../services/documents/documentsService';
import { displayName, reportNames } from '../../services/documents/reportName';
import { healthService } from '../../services/health/healthService';
import { trustedResults } from '../../services/health/homeDashboard';
import { buildComparisons, couldNotRead, homeCounts, needsReview } from '../../services/health/whatChanged';
import { startReading } from '../../services/processing/processingService';
import { lifeBadgeFor } from '../../services/home/categories';
import { isOwnRecord, type Person } from '../../services/people/peopleService';
import { CATEGORY_LABEL, type VaultFile } from '../../services/vault/vaultRules';
import { vaultService } from '../../services/vault/vaultService';
import type { RecordedObservation, StoredDocument } from '../../types';
import { NoticesCard } from './NoticesCard';

type IconName = keyof typeof Ionicons.glyphMap;
const go = (path: string) => router.push(path as Href);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const personLabel = (p: Person) => (isOwnRecord(p) ? 'Me' : p.name.split(' ')[0]);

/**
 * HOME for the new navigation (EXPO_PUBLIC_NAV_V2=on): who is on screen, what changed for
 * them, two doors (Health, Personal Documents), Life Management as one wide tile with a live
 * status line, and what was added recently. Everything is for the person chosen at the top,
 * through the same services and access rules as the screens it opens.
 */
export function HomeNav() {
  const theme = useTheme();
  const { user } = useAuth();
  const { people, active, switchTo } = usePeople();
  const subjectId = active?.id ?? (isDemoMode ? 'demo-person' : null);
  const [results, setResults] = useState<RecordedObservation[] | null>(null);
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [readingAgain, setReadingAgain] = useState(false);
  const life = useObligations(subjectId);
  // Reports waiting to be read are read automatically (consent asked once), as on today's Home.
  const autoRead = useAutoRead();

  const load = useCallback(async () => {
    const [r, d, f] = await Promise.all([
      healthService.getRecordedObservations(active?.id ?? null).catch(() => [] as RecordedObservation[]),
      documentsService.listDocuments().catch(() => [] as StoredDocument[]),
      VAULT_ENABLED ? vaultService.list(subjectId).catch(() => [] as VaultFile[]) : Promise.resolve([] as VaultFile[]),
    ]);
    setResults(r);
    setDocuments(d);
    setFiles(f);
  }, [active?.id, subjectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A report finished reading: its results are now in Health Memory.
  useHealthMemoryUpdates(load);
  const reading = autoRead.reading;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [reading, load]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([load(), life.reload(), autoRead.refresh()]);
    setRefreshing(false);
  }

  // Reports held for review, or that could not be read: shown here exactly as on today's Home.
  const counts = homeCounts(documents ?? [], results ?? []);
  const reviewDocs = (documents ?? []).filter((d) => needsReview(d) || couldNotRead(d));
  const heldDocs = (documents ?? []).filter((d) => d.status === 'completed' && needsReview(d));
  const openReview = () => (reviewDocs.length === 1 ? router.push(`/documents/${reviewDocs[0].id}`) : router.push('/documents'));
  const openVerify = () => router.push({ pathname: '/documents', params: { filter: 'verify' } });
  // Reports held under an older identity rule are read again with the current one; confirmed results are kept.
  async function readHeldAgain() {
    if (readingAgain) return;
    setReadingAgain(true);
    try {
      for (const d of heldDocs) await startReading(d.id, { reprocess: true }).catch(() => undefined);
    } finally {
      setReadingAgain(false);
      await load();
    }
  }

  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  const viewing = active && !isOwnRecord(active) ? active : null;
  const comparisons = buildComparisons(results ?? []).numeric;
  const names = reportNames(trustedResults(results ?? []));
  const badge = lifeBadgeFor(life.visible, new Date());
  const lifeText = badge ? badge.text : life.visible === null ? 'Reminders and important dates' : 'Nothing coming up';
  const lifeColor = badge?.tone === 'danger' ? theme.colors.danger : badge ? theme.colors.brandPrimary : theme.colors.textTertiary;

  const recent: { id: string; icon: IconName; title: string; detail: string; path: string; at: string }[] = [
    ...(documents ?? []).map((d) => ({
      id: `d-${d.id}`,
      icon: 'heart-outline' as IconName,
      title: displayName(d, names),
      detail: 'Health report',
      path: `/documents/${d.id}`,
      at: d.createdAt ?? '',
    })),
    ...files.map((f) => ({
      id: `f-${f.id}`,
      icon: 'document-outline' as IconName,
      title: f.title,
      detail: `Personal document · ${f.kind ?? CATEGORY_LABEL[f.category]}`,
      path: `/vault?category=${f.category}`,
      at: f.uploadedAt ?? f.createdAt,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 4);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={refresh}>
      <NoticesCard />
      <View testID="home-nav">
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>{firstName ? `Hello, ${firstName}` : 'Hello'}</Text>
        <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          Your life. Your intelligence.
        </Text>
      </View>

      {people.length > 1 && active ? (
        <View style={{ gap: theme.spacing.xs }} testID="home-person-switcher">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs }}>
            {people.map((p) => {
              const selected = p.id === active.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => switchTo(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${personLabel(p)}${selected ? ', selected' : ''}`}
                  testID={`home-person-${p.id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 6,
                    paddingLeft: 6,
                    paddingRight: theme.spacing.sm,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                    backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surface,
                  }}
                >
                  <Avatar name={p.name} size={28} />
                  <Text style={[theme.typography.labelLarge, { color: selected ? '#FFFFFF' : theme.colors.textPrimary }]}>{personLabel(p)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {viewing ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="home-person-note">
              Viewing {viewing.name}&rsquo;s records{viewing.access === 'viewer' ? ' · you can look, but not add' : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      {autoRead.showConsent ? (
        <AiConsentCard title={autoRead.waitingForConsent > 1 ? 'Read your reports for you?' : undefined} onAllow={autoRead.allow} onDecline={autoRead.decline} />
      ) : autoRead.reading > 0 ? (
        <Card testID="home-reading">
          <ProcessingState title={READING_COPY.title} description={READING_COPY.description} steps={readingSteps('reading')} />
        </Card>
      ) : null}

      <CheckCard unclear={counts.needsReview} couldNotRead={counts.couldNotRead} onPress={openReview} onReadAgain={heldDocs.length ? readHeldAgain : undefined} readingAgain={readingAgain} />

      {results === null ? <LoadingState label="Loading…" /> : <ChangeSummaryCard comparisons={comparisons} onOpen={() => go('/changes')} />}

      {documents !== null && counts.needsReview > 0 ? (
        <View testID="home-verify">
          <SummaryTiles counts={counts} onReports={() => go('/documents')} onResults={() => go('/(tabs)/hub')} onVerify={openVerify} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <BigTile icon="heart-outline" title="Health" subtitle="Reports, results and Doctor Brief" badge={documents ? plural(documents.length, 'report', 'reports') : undefined} onPress={() => go('/(tabs)/hub')} testID="home-tile-health" />
        {VAULT_ENABLED ? (
          <BigTile icon="folder-open-outline" title="Personal Documents" subtitle="Identity, insurance and more" badge={plural(files.length, 'file', 'files')} onPress={() => go('/(tabs)/documents')} testID="home-tile-documents" />
        ) : null}
      </View>

      <Pressable
        onPress={() => go('/reminders')}
        accessibilityRole="button"
        accessibilityLabel={`Life Management. ${lifeText}`}
        testID="home-tile-life"
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg }}
      >
        <Ionicons name="calendar-outline" size={30} color={theme.colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>Life Management</Text>
          <Text style={[theme.typography.bodySmall, { color: lifeColor }]} numberOfLines={1} testID="home-life-status">
            {lifeText}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Pressable>

      {recent.length > 0 ? (
        <View style={{ gap: theme.spacing.xs }} testID="home-recent">
          <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Recently added
          </Text>
          {recent.map((i) => (
            <Card key={i.id} onPress={() => go(i.path)} accessibilityLabel={`${i.title}. ${i.detail}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Ionicons name={i.icon} size={22} color={theme.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={1}>{i.title}</Text>
                  <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{i.detail}</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function BigTile({ icon, title, subtitle, badge, onPress, testID }: { icon: IconName; title: string; subtitle: string; badge?: string; onPress: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}${badge ? `. ${badge}` : ''}`}
      testID={testID}
      style={{ flex: 1, minHeight: 170, padding: theme.spacing.md, gap: theme.spacing.xs, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg }}
    >
      <Ionicons name={icon} size={30} color={theme.colors.success} />
      <View style={{ minHeight: 48, justifyContent: 'flex-start', marginTop: 4 }}>
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} numberOfLines={2}>{title}</Text>
      </View>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} numberOfLines={3}>{subtitle}</Text>
      {badge ? <Text style={[theme.typography.labelMedium, { color: theme.colors.brandPrimary, marginTop: 'auto' }]}>{badge}</Text> : null}
    </Pressable>
  );
}
