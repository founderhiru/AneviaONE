import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { EmptyState, ErrorState, LoadingState, ScreenContainer, TimelineEvent } from '../../components';
import { useTheme } from '../../design/theme';
import { groupTimelineByYear } from '../../mock';
import { healthService } from '../../services/health/healthService';
import type { HealthEvent } from '../../types';

export default function TimelineScreen() {
  const theme = useTheme();
  const [events, setEvents] = useState<HealthEvent[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setEvents(await healthService.getTimeline());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (error) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  if (events === null) {
    return (
      <ScreenContainer>
        <LoadingState label="Loading your timeline…" />
      </ScreenContainer>
    );
  }

  if (events.length === 0) {
    return (
      <ScreenContainer>
        <EmptyState
          title="No records yet"
          description="Add your first health record to start building your timeline."
          actionLabel="Add Record"
          onActionPress={() => router.push('/add')}
        />
      </ScreenContainer>
    );
  }

  const grouped = groupTimelineByYear(events);

  return (
    <ScreenContainer>
      <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        Health Timeline
      </Text>
      {grouped.map(({ year, events: yearEvents }) => (
        <View key={year} style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textTertiary }]}>{year}</Text>
          <View>
            {yearEvents.map((event, index) => (
              <TimelineEvent
                key={event.id}
                event={event}
                isLast={index === yearEvents.length - 1}
                onPress={() => router.push(`/timeline/${event.id}`)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScreenContainer>
  );
}
