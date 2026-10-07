import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { EmptyState, ErrorState, FadeInView, LoadingState, ScreenContainer, TimelineEvent } from '../../components';
import { useTheme } from '../../design/theme';
import { healthService } from '../../services/health/healthService';
import { groupTimelineByYear } from '../../services/health/timeline';
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
  let entryIndex = 0;

  return (
    <ScreenContainer>
      <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        Health Timeline
      </Text>
      {grouped.map(({ year, events: yearEvents }) => (
        <View key={year} style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textTertiary }]}>{year}</Text>
          <View>
            {yearEvents.map((event, index) => {
              const staggerDelay = Math.min(entryIndex++, 8) * 35;
              return (
                <FadeInView key={event.id} delay={staggerDelay}>
                  <TimelineEvent
                    event={event}
                    isLast={index === yearEvents.length - 1}
                    onPress={() => router.push(`/timeline/${encodeURIComponent(event.id)}`)}
                  />
                </FadeInView>
              );
            })}
          </View>
        </View>
      ))}
    </ScreenContainer>
  );
}
