import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader } from '../../components';
import { StoredDocumentCard } from '../../components/StoredDocumentCard';
import { useTheme } from '../../design/theme';
import { documentsService } from '../../services/documents/documentsService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { StoredDocument } from '../../types';

/** The signed-in user's real stored originals (reloaded whenever shown). */
export default function MyDocumentsScreen() {
  const theme = useTheme();
  // Arrived here straight after deleting a document.
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
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

  return (
    <ScreenContainer>
      <ScreenHeader title="My documents" onBack={() => router.back()} />

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
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Add a report, scan or photo and it will be stored privately here."
          actionLabel="Add Health Record"
          onActionPress={() => router.push('/add')}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {documents.map((doc) => (
            <StoredDocumentCard key={doc.id} document={doc} onPress={() => router.push(`/documents/${doc.id}`)} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
