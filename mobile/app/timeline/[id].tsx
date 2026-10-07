import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Card, ErrorState, LoadingState, ScreenContainer, ScreenHeader, SecondaryButton } from '../../components';
import { useTheme } from '../../design/theme';
import { healthService } from '../../services/health/healthService';
import type { HealthEvent, Observation } from '../../types';

export default function EventDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<HealthEvent | null | undefined>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const result = await healthService.getEventById(id);
      setEvent(result ?? undefined);
      if (result) setObservations(await healthService.getEventObservations(result));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Event" />
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  if (event === null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Event" />
        <LoadingState label="Loading event…" />
      </ScreenContainer>
    );
  }

  if (!event) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Event" />
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>Event not found.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={event.title} />
      <View style={{ gap: 2 }}>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          {event.date ? new Date(event.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Date not recorded'}
        </Text>
        {event.provider ? (
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>{event.provider}</Text>
        ) : null}
      </View>

      {observations.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Observations</Text>
          {observations.map((obs) => (
            <Card key={obs.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{obs.name}</Text>
                <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
                  {obs.value} {obs.unit}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {event.sourceDocumentId ? (
        <SecondaryButton label="View Original Document" onPress={() => router.push(`/documents/${event.sourceDocumentId}`)} fullWidth={false} />
      ) : null}
    </ScreenContainer>
  );
}
