import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

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
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { healthService } from '../../services/health/healthService';
import type { HealthChange, Trend } from '../../types';

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
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [c, t, y] = await Promise.all([
        healthService.getWhatChanged(),
        healthService.getTrends(),
        healthService.getHealthStoryYears(),
      ]);
      setChanges(c);
      setTrends(t);
      setStoryYears(y);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const isLoading = changes === null && trends === null && !error;
  const hasNoHistory = !isLoading && (changes ?? []).length === 0 && (trends ?? []).length === 0 && storyYears.length === 0;

  if (error) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <View>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>{greeting()}</Text>
        <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          Your Health
        </Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, marginTop: 2 }]}>
          Updated today
        </Text>
      </View>

      {isLoading ? (
        <LoadingState label="Loading your Health Memory…" />
      ) : hasNoHistory ? (
        <EmptyState
          title="Your health history starts here"
          description="Add your first report and it will be stored privately in your Health Memory."
          actionLabel="Add a record"
          onActionPress={() => router.push('/add')}
        />
      ) : (
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
                  change.type === 'value_change' ? () => router.push(`/trends/${encodeURIComponent(change.metricOrItemName)}`) : undefined
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
    </ScreenContainer>
  );
}
