import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { EmptyState, ErrorState, FadeInView, LoadingState, ScreenContainer, TimelineEvent, PersonBar } from '../../components';
import { StoredDocumentCard } from '../../components/StoredDocumentCard';
import { useTheme } from '../../design/theme';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { documentsService } from '../../services/documents/documentsService';
import { healthService } from '../../services/health/healthService';
import { groupTimelineByYear } from '../../services/health/timeline';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { HealthEvent, StoredDocument } from '../../types';

type Segment = 'events' | 'documents';

/** Events | Documents. Every stored report lives under Documents. */
function SegmentSwitch({ value, onChange }: { value: Segment; onChange: (s: Segment) => void }) {
  const theme = useTheme();
  const items: { key: Segment; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'documents', label: 'Documents' },
  ];
  return (
    <View style={{ flexDirection: 'row', padding: 4, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceAlt }} testID="timeline-segments">
      {items.map((i) => {
        const on = value === i.key;
        return (
          <Pressable
            key={i.key}
            onPress={() => onChange(i.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            testID={`timeline-segment-${i.key}`}
            style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs, borderRadius: theme.radius.md, backgroundColor: on ? theme.colors.surface : 'transparent' }}
          >
            <Text style={[theme.typography.labelLarge, { color: on ? theme.colors.textPrimary : theme.colors.textTertiary }]}>{i.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** All of the person's stored reports, newest first (the same list as My documents). */
function DocumentsPane() {
  const theme = useTheme();
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDocuments(await documentsService.listDocuments());
    } catch (e) {
      setError(e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  // Coming back from a report (deleted, re-read) refreshes the list.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useHealthMemoryUpdates(load);

  if (error) return <ErrorState description={error} onRetry={load} />;
  if (documents === null) return <LoadingState label="Loading your documents…" />;
  if (documents.length === 0) {
    return (
      <EmptyState
        title="No documents yet"
        description="Add a report, scan or photo and it will be stored privately here."
        actionLabel="Add Health Record"
        onActionPress={() => router.push('/add')}
      />
    );
  }
  return (
    <View style={{ gap: theme.spacing.sm }} testID="timeline-documents">
      {documents.map((doc) => (
        <StoredDocumentCard key={doc.id} document={doc} onPress={() => router.push(`/documents/${doc.id}`)} />
      ))}
    </View>
  );
}

export default function TimelineScreen() {
  const theme = useTheme();
  const [segment, setSegment] = useState<Segment>('events');
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

  // A report finished reading: show its new records.
  useHealthMemoryUpdates(load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const grouped = events && events.length ? groupTimelineByYear(events) : [];
  let entryIndex = 0;

  const eventsView = error ? (
    <ErrorState onRetry={load} />
  ) : events === null ? (
    <LoadingState label="Loading your timeline…" />
  ) : events.length === 0 ? (
    <EmptyState
      title="No records yet"
      description="Add your first health record to start building your timeline."
      actionLabel="Add Record"
      onActionPress={() => router.push('/add')}
    />
  ) : (
    <>
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
    </>
  );

  return (
    <ScreenContainer>
      <PersonBar />
      <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        Health Timeline
      </Text>
      <SegmentSwitch value={segment} onChange={setSegment} />
      {segment === 'events' ? eventsView : <DocumentsPane />}
    </ScreenContainer>
  );
}
