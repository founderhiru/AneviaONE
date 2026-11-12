import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import {
  AiConsentCard,
  Avatar,
  Card,
  EmptyState,
  LoadingState,
  ProcessingState,
  READING_COPY,
  readingSteps,
  ScreenContainer,
  PersonBar,
} from '../index';
import { SummaryTiles } from './WhatChangedUI';
import { ComingUp } from './ComingUp';
import { CheckCard, ChangeSummaryCard, DoctorShortcut, FamilyStrip, HealthStoryCard, KeyMeasureTiles, KeyNumbersCard, type FamilyRow } from './HomeV2UI';
import { BRAND, wordmarkParts } from '../../config/brand';
import { isDemoMode } from '../../config/appMode';
import { FOREST } from '../../design/brandSurface';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { useAutoRead } from '../../hooks/useAutoRead';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { documentsService } from '../../services/documents/documentsService';
import { isProcessing } from '../../services/documents/documentStatus';
import { healthService } from '../../services/health/healthService';
import { homeStage, trustedResults } from '../../services/health/homeDashboard';
import { buildHealthStory } from '../../services/health/homeStory';
import { familyDigest, keyNumbers, type FamilyDigest } from '../../services/health/homeInsights';
import { usePeople } from '../../hooks/usePeople';
import { startReading } from '../../services/processing/processingService';
import { reportNames } from '../../services/documents/reportName';
import {
  buildComparisons,
  couldNotRead,
  homeCounts,
  needsReview,
} from '../../services/health/whatChanged';
import type { RecordedObservation, StoredDocument } from '../../types';
import { NoticesCard } from './NoticesCard';

const [wordLead, wordAccent] = wordmarkParts();

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * HOME V2: the summary line, then "what changed" with graphs, then the key
 * measures. Recent documents live under Timeline > Documents. A report is
 * flagged only when a page was hard to read. The previous Home is kept as
 * HomeClassic (EXPO_PUBLIC_HOME_VARIANT=classic) until this one is proven.
 *
 * Home: "Your health, over time." — what the person has (reports, results,
 * anything awaiting review), what changed between their reports, their
 * latest results by kind, and their newest documents. Every count, result and
 * comparison is derived from their own TRUSTED records (current, never
 * superseded or held) and their documents' latest state, through the existing
 * services (services/health/whatChanged.ts). Nothing is invented: with too
 * little history, Home says so.
 */
export function HomeV2() {
  const theme = useTheme();
  const { user } = useAuth();
  const [results, setResults] = useState<RecordedObservation[] | null>(null);
  const [resultsError, setResultsError] = useState(false);
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [readingAgain, setReadingAgain] = useState(false);
  const { people, active, switchTo } = usePeople();
  const [digests, setDigests] = useState<Record<string, FamilyDigest>>({});
  // Reports waiting to be read are read automatically (consent once).
  const autoRead = useAutoRead();

  // The person's own documents, newest first — the same service as My documents (RLS: their rows only).
  const loadDocuments = useCallback(async () => {
    try {
      setDocuments(await documentsService.listDocuments());
      setDocumentsError(false);
    } catch {
      setDocumentsError(true);
      setDocuments((prev) => prev ?? []);
    }
  }, []);

  // Trusted current results (the same source as the Health screen).
  const loadResults = useCallback(async () => {
    try {
      setResults(await healthService.getRecordedObservations());
      setResultsError(false);
    } catch {
      setResultsError(true);
      setResults((prev) => prev ?? []);
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadDocuments(), loadResults()]);
  }, [loadDocuments, loadResults]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Coming back from Add Health Record (or a document) shows what's new.
  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments]),
  );

  // A report finished reading: its records are now in Health Memory.
  useHealthMemoryUpdates(load);

  // A read started or stopped: the documents list shows each one's status.
  const readingCount = useRef(autoRead.reading);
  useEffect(() => {
    if (readingCount.current === autoRead.reading) return;
    readingCount.current = autoRead.reading;
    loadDocuments();
  }, [autoRead.reading, loadDocuments]);

  // The rest of the family at a glance: each person's own reports only (RLS), counted, never merged.
  const others = people.filter((p) => p.id !== active?.id);
  const otherIds = others.map((p) => p.id).join(',');
  useEffect(() => {
    let cancelled = false;
    others.forEach((p) => {
      healthService
        .getRecordedObservations(p.id)
        .then((rs) => !cancelled && setDigests((d) => ({ ...d, [p.id]: familyDigest(rs) })))
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherIds, results]);

  // Reports held under the old identity rule are read again with the current one; confirmed results are kept.
  async function readHeldAgain(held: StoredDocument[]) {
    if (readingAgain) return;
    setReadingAgain(true);
    try {
      for (const d of held) await startReading(d.id, { reprocess: true }).catch(() => undefined);
    } finally {
      setReadingAgain(false);
      await load();
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([load(), autoRead.refresh()]);
    setRefreshing(false);
  }

  const readingStatus = autoRead.showConsent ? (
    <View style={{ gap: theme.spacing.xs }}>
      <AiConsentCard
        title={autoRead.waitingForConsent > 1 ? 'Read your reports for you?' : undefined}
        onAllow={autoRead.allow}
        onDecline={autoRead.decline}
      />
      {autoRead.error ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">
          {autoRead.error}
        </Text>
      ) : null}
    </View>
  ) : autoRead.reading > 0 ? (
    <Card testID="home-reading">
      <ProcessingState title={READING_COPY.title} description={READING_COPY.description} steps={readingSteps('reading')} />
    </Card>
  ) : autoRead.justFinished ? (
    <Card testID="home-report-ready">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{READING_COPY.ready}</Text>
      </View>
    </Card>
  ) : null;

  const isLoading = documents === null || results === null;
  const docs = documents ?? [];
  const allResults = results ?? [];
  const stage = homeStage({ documents: docs, results: allResults, timeline: [], trends: [] });
  const isEmpty = stage === 'new' && !documentsError && !resultsError;
  const counts = homeCounts(docs, allResults);
  const comparisons = buildComparisons(allResults).numeric;

  const hasTrusted = trustedResults(allResults).length > 0;

  const reviewDocs = docs.filter((d) => needsReview(d) || couldNotRead(d));
  const openReview = () => (reviewDocs.length === 1 ? router.push(`/documents/${reviewDocs[0].id}`) : router.push('/documents'));
  // "Reports to verify": the same reports the tile counts (needsReview), listed on their own.
  const openVerify = () => router.push({ pathname: '/documents', params: { filter: 'verify' } });
  const names = reportNames(trustedResults(allResults));
  const story = buildHealthStory(allResults, names);
  const numbers = comparisons.length === 0 ? keyNumbers(allResults) : [];
  const familyRows: FamilyRow[] = others.map((p) => ({ id: p.id, name: p.name, relationship: p.relationship === 'self' ? 'You' : p.relationship.charAt(0).toUpperCase() + p.relationship.slice(1), digest: digests[p.id] ?? null }));
  const heldDocs = docs.filter((d) => d.status === 'completed' && needsReview(d));
  const stillReading = autoRead.reading > 0 || docs.some((d) => d.status === 'uploaded' || isProcessing(d.status));
  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  const quiet = [theme.typography.bodySmall, { color: theme.colors.textTertiary }];

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }} testID="home-header">
      <Text style={[theme.typography.headingMedium, { flex: 1, color: theme.colors.textPrimary, fontWeight: '500' }]} accessibilityRole="header" numberOfLines={1}>
        {wordLead}
        <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{wordAccent}</Text>
      </Text>
      <Pressable
        onPress={() => router.push('/add')}
        accessibilityRole="button"
        accessibilityLabel="Add Health Record"
        testID="home-add-record"
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          minHeight: 36,
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.pill,
          backgroundColor: FOREST.field,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="add" size={18} color={FOREST.text} />
        <Text style={[theme.typography.labelMedium, { color: FOREST.text }]}>Add</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/(tabs)/me')}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        testID="home-profile"
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Avatar name={user?.fullName} size={36} />
      </Pressable>
    </View>
  );

  // Reminders belong to the person on screen; viewers of a shared record can read but not change them.
  const reminderSubject = active?.id ?? (isDemoMode ? 'demo-person' : null);
  const reminderEdit = active ? active.access !== 'viewer' : isDemoMode;
  const reminderFor = active && active.relationship !== 'self' ? active.name.split(' ')[0] : null;
  const comingUp = <ComingUp subjectId={reminderSubject} canEdit={reminderEdit} forName={reminderFor} />;

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <NoticesCard />
      <PersonBar />
      {header}

      <View testID="home-greeting" style={{ gap: 2 }}>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>{firstName ? `${greeting()}, ${firstName}` : greeting()}</Text>
        {isLoading || isEmpty ? null : (
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Your health, over time.
          </Text>
        )}
      </View>

      {readingStatus}

      {isLoading ? (
        <LoadingState label="Loading your Health Memory…" />
      ) : isEmpty ? (
        <>
          <EmptyState
            title="Your health story starts here."
            description={`Add your first health report and ${BRAND.wordmark} will begin connecting the pieces over time.`}
            actionLabel="Add health record"
            onActionPress={() => router.push('/add')}
          />
          {comingUp}
        </>
      ) : (
        <>
          <SummaryTiles counts={counts} onReports={() => router.push('/documents')} onResults={() => router.push('/(tabs)/health')} onVerify={openVerify} />

          {comingUp}

          {comparisons.length > 0 ? (
            <ChangeSummaryCard comparisons={comparisons} onOpen={() => router.push('/changes')} />
          ) : (
            <HealthStoryCard story={story} onOpenReport={(id) => router.push(`/documents/${id}`)} onOpenTimeline={() => router.push('/(tabs)/timeline')} />
          )}

          <KeyMeasureTiles comparisons={comparisons} onOpen={() => router.push('/changes')} />

          <KeyNumbersCard items={numbers} onOpenReport={(id) => router.push(`/documents/${id}`)} />

          <FamilyStrip rows={familyRows} onOpen={switchTo} />

          {comparisons.length === 0 && !hasTrusted ? (
            resultsError ? (
              <Pressable onPress={loadResults} accessibilityRole="button" testID="home-results-retry">
                <Text style={quiet}>We couldn&rsquo;t load your results. Tap to try again.</Text>
              </Pressable>
            ) : (
              <Text style={quiet} testID="home-no-results">
                {stillReading ? 'Your results appear here once your report has been read.' : 'No test results have been added to your Health Memory yet.'}
              </Text>
            )
          ) : null}

          <CheckCard unclear={counts.needsReview} couldNotRead={counts.couldNotRead} onPress={openReview} onReadAgain={heldDocs.length ? () => readHeldAgain(heldDocs) : undefined} readingAgain={readingAgain} />

          <DoctorShortcut onPress={() => router.push('/(tabs)/doctor')} />
        </>
      )}
    </ScreenContainer>
  );
}
