import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card, EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader, StatusBadge } from '../../components';
import { useTheme } from '../../design/theme';
import {
  DOCUMENT_STATUS_PRESENTATION,
  documentsService,
  formatFileSize,
} from '../../services/documents/documentsService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { StoredDocument } from '../../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** The signed-in user's real stored originals (reloaded whenever shown). */
export default function MyDocumentsScreen() {
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenContainer>
      <ScreenHeader title="My documents" onBack={() => router.back()} />

      {error ? (
        <ErrorState description={error} onRetry={load} />
      ) : documents === null ? (
        <LoadingState label="Loading your documents…" />
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload a PDF of a report and it will be stored privately here."
          actionLabel="Upload a report"
          onActionPress={() => router.push('/add')}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {documents.map((doc) => {
            const presentation = DOCUMENT_STATUS_PRESENTATION[doc.status];
            return (
              <Card
                key={doc.id}
                onPress={() => router.push(`/documents/${doc.id}`)}
                accessibilityLabel={`${doc.originalFilename}, ${presentation.label}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Ionicons name="document-text-outline" size={24} color={theme.colors.brandPrimary} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                      {doc.originalFilename}
                    </Text>
                    <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                      {formatDate(doc.uploadedAt ?? doc.createdAt)} · {formatFileSize(doc.fileSizeBytes)}
                    </Text>
                    <StatusBadge label={presentation.label} tone={presentation.tone} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}
