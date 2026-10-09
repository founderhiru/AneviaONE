import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import {
  AiConsentCard,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ProcessingState,
  READING_COPY,
  readingSteps,
  ScreenContainer,
} from '../../components';
import { AskRow, AttentionList, ChangeRow, HealthAtAGlance, HomeSection, ReportRows, SnapshotList, TimelineRow } from '../../components/home/HomeDashboard';
import { BRAND, PRODUCT_TERMS, wordmarkParts } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { useAutoRead } from '../../hooks/useAutoRead';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { documentsService } from '../../services/documents/documentsService';
import { isProcessing } from '../../services/documents/documentStatus';
import { healthService } from '../../services/health/healthService';
import {
  SIGNAL_COPY,
  healthSignals,
  healthSnapshot,
  homeStage,
  latestActivity,
  pickChange,
  resultPosition,
  summarizeDashboard,
  trustedResults,
} from '../../services/health/homeDashboard';
import { visibleYears } from '../../services/health/homeSummary';
import type { HealthChange, HealthEvent, Medication, RecordedObservation, StoredDocument, Trend } from '../../types';

/** How many of the person's newest records Home shows. */
const RECENT_RECORDS = 3;
/** Home previews; the Health screen has everything. */
const MAX_SIGNALS = 3;
const MAX_SNAPSHOT = 4;
/** No single health area fills Home. */
const MAX_PER_AREA = 2;

const [wordLead, wordAccent] = wordmarkParts();

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home: the person's health at a glance, as slim rows rather than a stack of
 * cards. In order — what AneviaONE knows (reports, results, areas,
 * medications), anything worth their attention, a snapshot of their latest
 * results across areas (never repeating an attention item), their timeline,
 * what changed, a way to ask, and their recent reports. Every figure, result and signal is
 * derived from their own trusted records through the existing services
 * (services/health/homeDashboard.ts); anything the records don't support
 * shows an honest state, and an account with nothing yet sees a calm start.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [changes, setChanges] = useState<HealthChange[] | null>(null);
  const [trends, setTrends] = useState<Trend[] | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [timeline, setTimeline] = useState<HealthEvent[]>([]);
  const [storyYears, setStoryYears] = useState<string[]>([]);
  const [results, setResults] = useState<RecordedObservation[] | null>(null);
  const [resultsError, setResultsError] = useState(false);
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Reports waiting to be read are read automatically (consent once).
  const autoRead = useAutoRead();

  // The person's own uploaded records, newest first — the same
  // `documentsService` as My documents (RLS: only their rows).
  const loadDocuments = useCallback(async () => {
    try {
      const list = await documentsService.listDocuments();
      setDocuments(list);
      setDocumentsError(false);
    } catch {
      setDocumentsError(true);
      setDocuments((prev) => prev ?? []);
    }
  }, []);

  // Trusted test results (the same source as the Health screen). If they
  // can't be loaded the rest of Home still shows, with a way to retry.
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
    setError(false);
    try {
      // One Health Memory snapshot backs all of these (cached in the service).
      const [c, t, y, m, e] = await Promise.all([
        healthService.getWhatChanged(),
        healthService.getTrends(),
        healthService.getHealthStoryYears(),
        healthService.getMedications(),
        healthService.getTimeline(),
        loadDocuments(),
        loadResults(),
      ]);
      setChanges(c);
      setTrends(t);
      setStoryYears(y);
      setMedications(m);
      setTimeline(e);
    } catch {
      setError(true);
    }
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

  // A read started or stopped: the records list shows each one's status.
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
      <ProcessingState
        title={READING_COPY.title}
        description={READING_COPY.description}
        steps={readingSteps('reading')}
      />
    </Card>
  ) : autoRead.justFinished ? (
    <Card testID="home-report-ready">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{READING_COPY.ready}</Text>
      </View>
    </Card>
  ) : null;


  const isLoading = (changes === null && trends === null && !error) || documents === null || results === null;
  const docs = documents ?? [];
  const allResults = results ?? [];
  const stage = homeStage({ documents: docs, results: allResults, timeline, trends: trends ?? [] });
  const isEmpty = stage === 'new' && !documentsError && !resultsError;
  const summary = summarizeDashboard({ documents: docs, results: allResults, medications });
  const signals = healthSignals(allResults);
  const shownSignals = signals.slice(0, MAX_SIGNALS);
  // "Nothing flagged" is said only when at least one result could be checked against its report's range.
  const anyCheckable = trustedResults(allResults).some((r) => resultPosition(r) !== null);
  const snapshot = healthSnapshot(allResults, { exclude: shownSignals.map((s) => s.id), max: MAX_SNAPSHOT, perArea: MAX_PER_AREA });
  const hasTrusted = trustedResults(allResults).length > 0;
  const activity = latestActivity(timeline);
  const change = pickChange(changes ?? []);
  const recent = docs.slice(0, RECENT_RECORDS);
  const stillReading = autoRead.reading > 0 || docs.some((d) => d.status === 'uploaded' || isProcessing(d.status));
  const firstName = user?.fullName?.trim().split(/\s+/)[0];

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }} testID="home-header">
      <Text style={[theme.typography.headingMedium, { flex: 1, color: theme.colors.textPrimary, fontWeight: '500' }]} accessibilityRole="header">
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
          backgroundColor: theme.colors.brandPrimary,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="add" size={18} color={theme.colors.textOnDark} />
        <Text style={[theme.typography.labelMedium, { color: theme.colors.textOnDark }]}>Add</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/(tabs)/me')}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        testID="home-profile"
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        {user?.fullName ? (
          <Avatar name={user.fullName} size={36} />
        ) : (
          <Ionicons name="person-circle-outline" size={36} color={theme.colors.brandPrimary} />
        )}
      </Pressable>
    </View>
  );

  if (error) {
    return (
      <ScreenContainer>
        {header}
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  const quiet = [theme.typography.bodySmall, { color: theme.colors.textTertiary }];

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      {header}

      <View testID="home-greeting" style={{ gap: 2 }}>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>
          {firstName ? `${greeting()}, ${firstName}` : greeting()}
        </Text>
        {isLoading || isEmpty ? null : (
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]}>Your health at a glance.</Text>
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
          <HealthAtAGlance
            summary={summary}
            onReports={() => router.push('/documents')}
            onResults={() => router.push('/(tabs)/health')}
            onMedications={() => router.push('/medications')}
          />

          {shownSignals.length ? (
            <HomeSection
              title="Worth your attention"
              actionLabel={signals.length > MAX_SIGNALS ? `${signals.length - MAX_SIGNALS} more` : undefined}
              onActionPress={() => router.push('/(tabs)/health')}
              testID="home-signals"
            >
              <AttentionList signals={shownSignals} onPressSignal={(sig) => router.push(`/documents/${sig.sourceDocumentId}`)} />
            </HomeSection>
          ) : anyCheckable ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }} testID="home-no-signals">
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.textTertiary} />
              <Text style={quiet}>{SIGNAL_COPY.none}</Text>
            </View>
          ) : null}

          <HomeSection
            title="Latest health snapshot"
            actionLabel={hasTrusted ? 'View all results' : undefined}
            onActionPress={() => router.push('/(tabs)/health')}
            testID="home-latest-results"
          >
            {snapshot.length ? (
              <SnapshotList items={snapshot} onPressResult={(r) => router.push(`/documents/${r.source.documentId}`)} />
            ) : hasTrusted ? null : resultsError ? (
              <Pressable onPress={loadResults} accessibilityRole="button" testID="home-results-retry">
                <Text style={quiet}>We couldn&rsquo;t load your results. Tap to try again.</Text>
              </Pressable>
            ) : (
              <Text style={quiet} testID="home-no-results">
                {stillReading
                  ? 'Your results appear here once your report has been read.'
                  : 'No test results have been added to your Health Memory yet.'}
              </Text>
            )}
          </HomeSection>

          <HomeSection title={PRODUCT_TERMS.healthTimeline} actionLabel="View Timeline" onActionPress={() => router.push('/(tabs)/timeline')} testID="home-timeline">
            <TimelineRow years={visibleYears(storyYears)} latest={activity} onPress={() => router.push('/(tabs)/timeline')} />
          </HomeSection>

          <HomeSection
            title={PRODUCT_TERMS.whatChanged}
            actionLabel={change ? 'View Changes' : undefined}
            onActionPress={() => router.push('/changes')}
            testID="home-what-changed"
          >
            <ChangeRow change={change} onViewTrend={change ? () => router.push(`/trends/${encodeURIComponent(change.metricOrItemName)}`) : undefined} />
          </HomeSection>

          <AskRow title={PRODUCT_TERMS.askMyHealth} onPress={() => router.push('/(tabs)/ask')} />

          <HomeSection
            title="Recent reports"
            actionLabel={recent.length ? 'View all' : undefined}
            onActionPress={() => router.push('/documents')}
            testID="home-recent-records"
          >
            {documentsError ? (
              <Pressable onPress={loadDocuments} accessibilityRole="button" testID="home-records-retry">
                <Text style={quiet}>We couldn&rsquo;t load your records. Tap to try again.</Text>
              </Pressable>
            ) : recent.length === 0 ? (
              <Text style={quiet}>Records you add appear here.</Text>
            ) : (
              <ReportRows documents={recent} onPressDocument={(d) => router.push(`/documents/${d.id}`)} />
            )}
          </HomeSection>
        </>
      )}
    </ScreenContainer>
  );
}
