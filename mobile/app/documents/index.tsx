import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader, PersonBar } from '../../components';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { StoredDocumentCard } from '../../components/StoredDocumentCard';
import { useTheme } from '../../design/theme';
import { documentsService } from '../../services/documents/documentsService';
import { needsReview } from '../../services/health/whatChanged';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { StoredDocument } from '../../types';

/**
 * The signed-in user's real stored originals (reloaded whenever shown).
 * `?filter=verify` (Home's "Reports to verify") lists only the reports whose
 * results are held until the person checks them — the same rule Home counts
 * with (`needsReview`), so the list and the number always agree.
 */
export default function MyDocumentsScreen() {
  const theme = useTheme();
  // Arrived here straight after deleting a document.
  const { deleted, filter } = useLocalSearchParams<{ deleted?: string; filter?: string }>();
  const verifyOnly = filter === 'verify';
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Choosing another person reloads this list.
  useHealthMemoryUpdates(load);

  const shown = verifyOnly ? (documents ?? []).filter(needsReview) : (documents ?? []);

  return (
    <ScreenContainer>
      <PersonBar />
      <ScreenHeader title={verifyOnly ? 'Reports to verify' : 'My documents'} />
      {verifyOnly ? (
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]} testID="verify-intro">
          These reports were read, but their results aren&rsquo;t in your Health Memory until they&rsquo;re checked. Open one to see why.
        </Text>
      ) : null}

      {deleted === '1' ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
          accessibilityLiveRegion="polite"
          testID="document-deleted-notice"
        >
          <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Health record deleted.</Text>
        </View>
      ) : null}

      {error ? (
        <ErrorState description={error} onRetry={load} />
      ) : documents === null ? (
        <LoadingState label="Loading your documents…" />
      ) : verifyOnly && shown.length === 0 ? (
        <EmptyState
          title="Nothing to verify"
          description="Every report you've added is either in your Health Memory or still being read."
          actionLabel="View all documents"
          onActionPress={() => router.replace('/documents')}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Add a report, scan or photo and it will be stored privately here."
          actionLabel="Add Health Record"
          onActionPress={() => router.push('/add')}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {shown.map((doc) => (
            <StoredDocumentCard key={doc.id} document={doc} onPress={() => router.push(`/documents/${doc.id}`)} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
