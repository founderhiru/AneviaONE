import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader } from '../../components';
import { ComparisonCard, FilterChips, FindingCard, ResultRows, type ChipOption } from '../../components/home/WhatChangedUI';
import { useTheme } from '../../design/theme';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { healthService } from '../../services/health/healthService';
import { healthSnapshot } from '../../services/health/homeDashboard';
import { GROUP_LABEL, availableGroups, buildComparisons, inGroup, type GroupFilter } from '../../services/health/whatChanged';
import type { RecordedObservation } from '../../types';

type Period = 'all' | '6m' | '12m';
const PERIOD_LABEL: Record<Period, string> = { all: 'All time', '6m': 'Last 6 months', '12m': 'Last 12 months' };
type Sort = 'latest' | 'name';
const SORT_LABEL: Record<Sort, string> = { latest: 'Latest first', name: 'A–Z' };

/** "YYYY-MM-DD" of `months` before today (device date). */
function since(months: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function choose<T extends string>(title: string, labels: Record<T, string>, onPick: (v: T) => void) {
  Alert.alert(title, undefined, [
    ...(Object.keys(labels) as T[]).map((k) => ({ text: labels[k], onPress: () => onPick(k) })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

/**
 * "What changed?": how the person's results moved between their own dated
 * reports. Numbers are compared only for the same test in the same unit, each
 * against its own report's range; written findings (imaging) are shown as
 * written, side by side, never scored. Built from TRUSTED current results only
 * (services/health/whatChanged.ts) — nothing is stored or inferred.
 */
export default function WhatChangedScreen() {
  const theme = useTheme();
  const [results, setResults] = useState<RecordedObservation[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [sort, setSort] = useState<Sort>('latest');

  const load = useCallback(async () => {
    setError(false);
    try {
      setResults(await healthService.getRecordedObservations());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useHealthMemoryUpdates(load);

  const intro = (
    <>
      <ScreenHeader title="What changed?" />
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
        See how your key health results have changed over time across your reports.
      </Text>
    </>
  );

  if (error) {
    return (
      <ScreenContainer>
        {intro}
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }
  if (!results) {
    return (
      <ScreenContainer>
        {intro}
        <LoadingState label="Comparing your reports…" />
      </ScreenContainer>
    );
  }

  const groups = availableGroups(results);
  const chips: ChipOption<GroupFilter>[] = [{ key: 'all', label: 'All' }, ...groups.map((g) => ({ key: g as GroupFilter, label: GROUP_LABEL[g] }))];
  const { numeric, findings, undated } = buildComparisons(results);
  const from = period === 'all' ? null : since(period === '6m' ? 6 : 12);
  const keepPeriod = (latestDate: string) => from === null || latestDate >= from;
  const shownNumeric = numeric.filter((c) => inGroup(filter)({ category: c.group === 'lab' ? 'laboratory' : c.group }) && keepPeriod(c.latest.date));
  const shownFindings = findings.filter((f) => (filter === 'all' || filter === 'imaging') && keepPeriod(f.entries[f.entries.length - 1].date));
  const cards = [
    ...shownNumeric.map((c) => ({ date: c.latest.date, el: <ComparisonCard key={c.key} c={c} onPress={() => router.push(`/documents/${c.latest.documentId}`)} /> })),
    ...shownFindings.map((f) => ({ date: f.entries[f.entries.length - 1].date, el: <FindingCard key={f.key} f={f} onPress={() => router.push(`/documents/${f.entries[f.entries.length - 1].documentId}`)} /> })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const tracked = healthSnapshot(results.filter(inGroup(filter)), { max: Number.MAX_SAFE_INTEGER, perArea: Number.MAX_SAFE_INTEGER });
  const trackedSorted = sort === 'name' ? [...tracked].sort((a, b) => a.name.localeCompare(b.name)) : [...tracked].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const selector = (label: string, onPress: () => void, testID: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
    >
      <Text style={[theme.typography.labelMedium, { color: theme.colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
    </Pressable>
  );

  return (
    <ScreenContainer>
      {intro}
      {groups.length > 0 ? <FilterChips options={chips} selected={filter} onSelect={setFilter} testID="changes-filter" /> : null}

      <View style={{ gap: theme.spacing.sm }} testID="key-changes">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">Key changes</Text>
          <Pressable
            onPress={() =>
              Alert.alert(
                'How changes are shown',
                'Results are compared only for the same test in the same unit, on two different dates, each against the range printed on its own report. Written findings are shown as written, side by side. Only results in your Health Memory are used — never ones still awaiting review.'
              )
            }
            accessibilityRole="button"
            accessibilityLabel="How changes are shown"
            hitSlop={10}
            testID="key-changes-info"
          >
            <Ionicons name="information-circle-outline" size={18} color={theme.colors.textTertiary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {selector(PERIOD_LABEL[period], () => choose('Comparison period', PERIOD_LABEL, setPeriod), 'changes-period')}
        </View>

        {cards.length ? (
          cards.map((c) => c.el)
        ) : (
          <EmptyState
            title="Not enough comparable history yet."
            description={
              numeric.length + findings.length > 0
                ? 'Nothing to compare for this selection. Try another filter or period.'
                : `Comparisons appear when the same result is on reports from two different dates.${undated ? ' Some results have no readable date and can’t be compared.' : ''} Adding more dated reports will start your comparisons.`
            }
          />
        )}
      </View>

      {tracked.length ? (
        <View style={{ gap: theme.spacing.sm }} testID="tracked-results">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[theme.typography.headingSmall, { flex: 1, color: theme.colors.textPrimary }]} accessibilityRole="header">All tracked results</Text>
            {selector(SORT_LABEL[sort], () => choose('Sort results', SORT_LABEL, setSort), 'tracked-sort')}
          </View>
          <ResultRows items={trackedSorted} onPress={(r) => router.push(`/documents/${r.source.documentId}`)} testID="tracked-list" />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
