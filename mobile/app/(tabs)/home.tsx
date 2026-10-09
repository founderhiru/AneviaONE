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
} from '../../components';
import { HomeSection } from '../../components/home/HomeDashboard';
import { DocumentRows, FilterChips, ResultRows, ReviewCard, SummaryTiles, WhatChangedHero } from '../../components/home/WhatChangedUI';
import { BRAND, wordmarkParts } from '../../config/brand';
import { FOREST } from '../../design/brandSurface';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { useAutoRead } from '../../hooks/useAutoRead';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { documentsService } from '../../services/documents/documentsService';
import { isProcessing } from '../../services/documents/documentStatus';
import { healthService } from '../../services/health/healthService';
import { healthSnapshot, homeStage, trustedResults } from '../../services/health/homeDashboard';
import {
  buildComparisons,
  couldNotRead,
  homeCounts,
  inGroup,
  needsReview,
  resultGroup,
  type GroupFilter,
} from '../../services/health/whatChanged';
import type { RecordedObservation, StoredDocument } from '../../types';

/** How many of the person's newest documents Home shows. */
const RECENT_DOCUMENTS = 3;
/** Snapshot rows on Home; the Health screen has everything. */
const MAX_SNAPSHOT = 4;

const [wordLead, wordAccent] = wordmarkParts();

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const IDENTITY_HELD = new Set(['no_identifiers', 'unverifiable']);

/**
 * Home: "Your health, over time." — what the person has (reports, results,
 * anything awaiting review), what changed between their reports, their
 * latest results by kind, and their newest documents. Every count, result and
 * comparison is derived from their own TRUSTED records (current, never
 * superseded or held) and their documents' latest state, through the existing
 * services (services/health/whatChanged.ts). Nothing is invented: with too
 * little history, Home says so.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [results, setResults] = useState<RecordedObservation[] | null>(null);
  const [resultsError, setResultsError] = useState(false);
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState(false);
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
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

  // Snapshot: latest result per test; chip counts cover every test, rows show a few.
  const latestPerTest = healthSnapshot(allResults, { max: Number.MAX_SAFE_INTEGER, perArea: Number.MAX_SAFE_INTEGER });
  const groupCount = (g: GroupFilter) => latestPerTest.filter(inGroup(g)).length;
  const snapshot =
    filter === 'all'
      ? healthSnapshot(allResults, { max: MAX_SNAPSHOT, perArea: 2 })
      : healthSnapshot(allResults.filter((r) => resultGroup(r) === filter), { max: MAX_SNAPSHOT, perArea: MAX_SNAPSHOT });
  const hasTrusted = trustedResults(allResults).length > 0;

  const reviewDocs = docs.filter((d) => needsReview(d) || couldNotRead(d));
  const identityHint = docs.some((d) => needsReview(d) && IDENTITY_HELD.has(d.identityCheck ?? ''));
  const openReview = () => (reviewDocs.length === 1 ? router.push(`/documents/${reviewDocs[0].id}`) : router.push('/documents'));
  const recent = docs.slice(0, RECENT_DOCUMENTS);
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
        {user?.fullName ? <Avatar name={user.fullName} size={36} /> : <Ionicons name="person-circle-outline" size={36} color={theme.colors.brandPrimary} />}
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
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
        <EmptyState
          title="Your health story starts here."
          description={`Add your first health report and ${BRAND.wordmark} will begin connecting the pieces over time.`}
          actionLabel="Add health record"
          onActionPress={() => router.push('/add')}
        />
      ) : (
        <>
          <SummaryTiles counts={counts} onReports={() => router.push('/documents')} onResults={() => router.push('/(tabs)/health')} onReview={openReview} />

          <WhatChangedHero comparisons={comparisons} onOpen={() => router.push('/changes')} />

          <HomeSection
            title="Latest health snapshot"
            actionLabel={hasTrusted ? 'View all' : undefined}
            onActionPress={() => router.push('/(tabs)/health')}
            testID="home-latest-results"
          >
            {hasTrusted ? (
              <View style={{ gap: theme.spacing.sm }}>
                <FilterChips
                  options={[
                    { key: 'all' as GroupFilter, label: 'All', count: latestPerTest.length },
                    { key: 'lab' as GroupFilter, label: 'Lab', count: groupCount('lab') },
                    { key: 'imaging' as GroupFilter, label: 'Imaging', count: groupCount('imaging') },
                    { key: 'other' as GroupFilter, label: 'Other', count: groupCount('other') },
                  ]}
                  selected={filter}
                  onSelect={setFilter}
                  testID="home-snapshot-filter"
                />
                {snapshot.length ? (
                  <ResultRows items={snapshot} onPress={(r) => router.push(`/documents/${r.source.documentId}`)} testID="home-snapshot" />
                ) : (
                  <Text style={quiet} testID="home-snapshot-empty">No results of this kind yet.</Text>
                )}
              </View>
            ) : resultsError ? (
              <Pressable onPress={loadResults} accessibilityRole="button" testID="home-results-retry">
                <Text style={quiet}>We couldn&rsquo;t load your results. Tap to try again.</Text>
              </Pressable>
            ) : (
              <Text style={quiet} testID="home-no-results">
                {stillReading ? 'Your results appear here once your report has been read.' : 'No test results have been added to your Health Memory yet.'}
              </Text>
            )}
          </HomeSection>

          <ReviewCard needsReview={counts.needsReview} couldNotRead={counts.couldNotRead} identityHint={identityHint} onPress={openReview} />

          <HomeSection title="Recent documents" actionLabel={recent.length ? 'View all' : undefined} onActionPress={() => router.push('/documents')} testID="home-recent-records">
            {documentsError ? (
              <Pressable onPress={loadDocuments} accessibilityRole="button" testID="home-records-retry">
                <Text style={quiet}>We couldn&rsquo;t load your documents. Tap to try again.</Text>
              </Pressable>
            ) : recent.length === 0 ? (
              <Text style={quiet}>Documents you add appear here.</Text>
            ) : (
              <DocumentRows documents={recent} onPress={(d) => router.push(`/documents/${d.id}`)} />
            )}
          </HomeSection>
        </>
      )}
    </ScreenContainer>
  );
}
