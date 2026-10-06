import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import {
  EmptyState,
  ErrorState,
  HealthChangeCard,
  HealthHistoryLine,
  LoadingState,
  ScreenContainer,
  SectionHeader,
  TrendCard,
} from '../../components';
import { StoredDocumentCard } from '../../components/StoredDocumentCard';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { documentsService } from '../../services/documents/documentsService';
import { healthService } from '../../services/health/healthService';
import type { HealthChange, StoredDocument, Trend } from '../../types';

/** How many of the person's newest records Home shows. */
const RECENT_RECORDS = 3;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const theme = useTheme();
  const [changes, setChanges] = useState<HealthChange[] | null>(null);
  const [trends, setTrends] = useState<Trend[] | null>(null);
  const [storyYears, setStoryYears] = useState<string[]>([]);
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
      const [c, t, y] = await Promise.all([
        healthService.getWhatChanged(),
        healthService.getTrends(),
        healthService.getHealthStoryYears(),
        loadDocuments(),
      ]);
      setChanges(c);
      setTrends(t);
      setStoryYears(y);
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

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const isLoading = (changes === null && trends === null && !error) || documents === null;
  const hasNoHistory = !isLoading && (changes ?? []).length === 0 && (trends ?? []).length === 0 && storyYears.length === 0;
  const recent = (documents ?? []).slice(0, RECENT_RECORDS);
  const isEmpty = hasNoHistory && recent.length === 0 && !documentsError;

  if (error) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>{greeting()}</Text>
          <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            Your Health
          </Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, marginTop: 2 }]}>Updated today</Text>
        </View>
        <Pressable
          onPress={() => router.push('/add')}
          accessibilityRole="button"
          accessibilityLabel="Add Health Record"
          testID="home-add-record"
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: theme.minTouchTarget,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.brandPrimary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="add" size={20} color={theme.colors.textOnDark} />
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textOnDark }]}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <LoadingState label="Loading your Health Memory…" />
      ) : isEmpty ? (
        <EmptyState
          title="Your health history starts here."
          description="Add a report, scan or photo to begin building your health memory."
          actionLabel="Add Health Record"
          onActionPress={() => router.push('/add')}
        />
      ) : (
        <>
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

          {hasNoHistory ? null : (
            <>
              <View style={{ gap: theme.spacing.sm }}>
                <SectionHeader
                  title={PRODUCT_TERMS.whatChanged}
                  subtitle={`${changes?.length ?? 0} changes found`}
                  actionLabel="View Changes"
                  onActionPress={() => router.push('/changes')}
                />
                {(changes ?? []).slice(0, 3).map((change) => (
                  <HealthChangeCard
                    key={change.id}
                    change={change}
                    onViewTrend={
                      change.type === 'value_change'
                        ? () => router.push(`/trends/${encodeURIComponent(change.metricOrItemName)}`)
                        : undefined
                    }
                    onViewEvidence={() => router.push(`/documents/${change.sourceDocumentId}`)}
                  />
                ))}
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                <SectionHeader
                  title="Your Health Story"
                  subtitle="A quiet timeline of everything you've added"
                  actionLabel="View Timeline"
                  onActionPress={() => router.push('/(tabs)/timeline')}
                />
                <View style={{ paddingHorizontal: theme.spacing.xs, paddingTop: theme.spacing.xs }}>
                  <HealthHistoryLine years={storyYears} />
                </View>
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                <SectionHeader
                  title={PRODUCT_TERMS.healthTrends}
                  actionLabel="View All"
                  onActionPress={() => router.push('/(tabs)/health')}
                />
                {(trends ?? []).slice(0, 3).map((trend) => (
                  <TrendCard key={trend.id} trend={trend} onPress={() => router.push(`/trends/${encodeURIComponent(trend.metricName)}`)} />
                ))}
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                <SectionHeader title={PRODUCT_TERMS.askMyHealth} />
                <Pressable
                  onPress={() => router.push('/(tabs)/ask')}
                  accessibilityRole="button"
                  accessibilityLabel="Ask about your health history"
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                      minHeight: theme.minTouchTarget,
                      paddingHorizontal: theme.spacing.md,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.surfaceAlt,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.brandSecondary} />
                  <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, flex: 1 }]}>
                    Ask about your health history...
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}
