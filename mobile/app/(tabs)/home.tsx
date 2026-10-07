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
  HealthChangeCard,
  HealthHistoryLine,
  LoadingState,
  ProcessingState,
  READING_COPY,
  readingSteps,
  ScreenContainer,
  SectionHeader,
} from '../../components';
import { StoredDocumentCard } from '../../components/StoredDocumentCard';
import { BRAND, PRODUCT_TERMS, wordmarkParts } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useAuth } from '../../hooks/useAuth';
import { useAutoRead } from '../../hooks/useAutoRead';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { documentsService } from '../../services/documents/documentsService';
import { healthService } from '../../services/health/healthService';
import { monthYear, summarizeHome, visibleYears } from '../../services/health/homeSummary';
import type { HealthChange, HealthEvent, Medication, StoredDocument, Trend } from '../../types';

/** How many of the person's newest records Home shows. */
const RECENT_RECORDS = 3;

const [wordLead, wordAccent] = wordmarkParts();

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Home: the person's health story at a glance — the years their records
 * span, a snapshot (records, trends, medications, next check-up), the most
 * recent change, and a way to ask. Every figure is derived from their own
 * records through the existing services; anything the records don't support
 * shows a neutral state, and an account with nothing yet sees a calm start.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [changes, setChanges] = useState<HealthChange[] | null>(null);
  const [trends, setTrends] = useState<Trend[] | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [timeline, setTimeline] = useState<HealthEvent[]>([]);
  const [storyYears, setStoryYears] = useState<string[]>([]);
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
      ]);
      setChanges(c);
      setTrends(t);
      setStoryYears(y);
      setMedications(m);
      setTimeline(e);
    } catch {
      setError(true);
    }
  }, [loadDocuments]);

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

  const isLoading = (changes === null && trends === null && !error) || documents === null;
  const hasNoHistory = !isLoading && (changes ?? []).length === 0 && (trends ?? []).length === 0 && storyYears.length === 0;
  const recent = (documents ?? []).slice(0, RECENT_RECORDS);
  const isEmpty = hasNoHistory && recent.length === 0 && !documentsError;
  const summary = summarizeHome({ documents: documents ?? [], trends: trends ?? [], medications, timeline });
  const latestChange = (changes ?? [])[0];
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

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      {header}

      <View testID="home-greeting">
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>
          {firstName ? `${greeting()}, ${firstName}` : `${greeting()},`}
        </Text>
        {isEmpty ? null : (
          <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]}>Your health story continues.</Text>
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
          <View style={{ gap: theme.spacing.sm }} testID="home-timeline">
            <SectionHeader
              title={PRODUCT_TERMS.healthTimeline}
              subtitle={summary.latestRecordDate ? `Latest record ${monthYear(summary.latestRecordDate)}` : undefined}
              actionLabel="View Timeline"
              onActionPress={() => router.push('/(tabs)/timeline')}
            />
            {storyYears.length ? (
              <View style={{ paddingHorizontal: theme.spacing.xs, paddingTop: theme.spacing.xs }}>
                <HealthHistoryLine years={visibleYears(storyYears)} activeYear={summary.latestRecordDate?.slice(0, 4)} />
              </View>
            ) : (
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                Your timeline appears once a report has been read.
              </Text>
            )}
          </View>

          <View style={{ gap: theme.spacing.sm }} testID="home-snapshot">
            <SectionHeader title="Health Snapshot" />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <SnapshotTile
                label="All Records"
                value={plural(summary.documentCount, 'document', 'documents')}
                icon="documents-outline"
                onPress={() => router.push('/documents')}
                testID="snapshot-records"
              />
              <SnapshotTile
                label="Trends"
                value={summary.trendMeasureCount ? plural(summary.trendMeasureCount, 'measure', 'measures') : 'Not enough yet'}
                muted={!summary.trendMeasureCount}
                icon="trending-up-outline"
                onPress={() => router.push('/(tabs)/health')}
                testID="snapshot-trends"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <SnapshotTile
                label="Medications"
                value={summary.medicationCount ? `${summary.medicationCount} recorded` : 'None recorded'}
                muted={!summary.medicationCount}
                icon="medical-outline"
                onPress={() => router.push('/medications')}
                testID="snapshot-medications"
              />
              <SnapshotTile
                label="Next Checkup"
                value={summary.nextCheckupDate ? monthYear(summary.nextCheckupDate) : 'None on record'}
                muted={!summary.nextCheckupDate}
                icon="calendar-outline"
                testID="snapshot-checkup"
              />
            </View>
          </View>

          <View style={{ gap: theme.spacing.sm }} testID="home-what-changed">
            <SectionHeader
              title={PRODUCT_TERMS.whatChanged}
              actionLabel={latestChange ? 'View Changes' : undefined}
              onActionPress={latestChange ? () => router.push('/changes') : undefined}
            />
            {latestChange ? (
              <HealthChangeCard
                change={latestChange}
                onViewTrend={
                  latestChange.type === 'value_change'
                    ? () => router.push(`/trends/${encodeURIComponent(latestChange.metricOrItemName)}`)
                    : undefined
                }
                onViewEvidence={() => router.push(`/documents/${latestChange.sourceDocumentId}`)}
              />
            ) : (
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="home-no-change">
                Nothing to compare yet. Changes appear when the same test is recorded in more than one report.
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => router.push('/(tabs)/ask')}
            accessibilityRole="button"
            accessibilityLabel={PRODUCT_TERMS.askMyHealth}
            testID="home-ask"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              minHeight: 52,
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, flex: 1 }]}>Ask about your health...</Text>
            <Ionicons name="arrow-forward" size={18} color={theme.colors.textTertiary} />
          </Pressable>

          <View style={{ gap: theme.spacing.sm }} testID="home-recent-records">
            <SectionHeader
              title="Recent Health Records"
              actionLabel={recent.length ? 'View all' : undefined}
              onActionPress={recent.length ? () => router.push('/documents') : undefined}
            />
            {documentsError ? (
              <Pressable onPress={loadDocuments} accessibilityRole="button" testID="home-records-retry">
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                  We couldn&rsquo;t load your records. Tap to try again.
                </Text>
              </Pressable>
            ) : recent.length === 0 ? (
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>Records you add appear here.</Text>
            ) : (
              recent.map((doc) => <StoredDocumentCard key={doc.id} document={doc} onPress={() => router.push(`/documents/${doc.id}`)} />)
            )}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

/** One compact Health Snapshot card: a label and one real value. */
function SnapshotTile({
  label,
  value,
  icon,
  muted = false,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  muted?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={16} color={theme.colors.accent} />
        <Text style={[theme.typography.labelSmall, { color: theme.colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }]}>
          {label}
        </Text>
      </View>
      <Text
        style={[theme.typography.headingSmall, { color: muted ? theme.colors.textTertiary : theme.colors.textPrimary, marginTop: theme.spacing.xs }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </>
  );
  const frame = {
    flex: 1,
    minHeight: 84,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  } as const;
  if (!onPress) {
    return (
      <View style={frame} testID={testID} accessible accessibilityLabel={`${label}: ${value}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
      style={({ pressed }) => [frame, { opacity: pressed ? 0.85 : 1 }]}
    >
      {body}
    </Pressable>
  );
}
