import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { EmptyState, ErrorState, HealthChangeCard, LoadingState, ScreenContainer, ScreenHeader } from '../../components';
import { useTheme } from '../../design/theme';
import { healthService } from '../../services/health/healthService';
import type { HealthChange } from '../../types';

export default function WhatChangedScreen() {
  const theme = useTheme();
  const [changes, setChanges] = useState<HealthChange[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setChanges(await healthService.getWhatChanged());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <ScreenContainer>
      <ScreenHeader title="What Changed?" />
      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary, marginTop: -theme.spacing.sm }]}>
        Compared with your previous available records
      </Text>

      {error ? (
        <ErrorState onRetry={load} />
      ) : changes === null ? (
        <LoadingState label="Comparing your records…" />
      ) : changes.length === 0 ? (
        <EmptyState title="No changes yet" description="Add another record to see what's changed over time." />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {changes.map((change) => (
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
      )}
    </ScreenContainer>
  );
}
