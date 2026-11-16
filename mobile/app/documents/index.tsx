import React, { useCallback, useState } from 'react';
import { Pressable, Text, TextInput as RNTextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button, EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader, PersonBar } from '../../components';
import { VISUAL_V2_ENABLED } from '../../config/visualFlag';
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

  // V2 only: search by file name, and a quick switch between all reports and the ones to verify.
  const [query, setQuery] = useState('');
  const term = VISUAL_V2_ENABLED ? query.trim().toLowerCase() : '';
  const byFilter = verifyOnly ? (documents ?? []).filter(needsReview) : (documents ?? []);
  const shown = term ? byFilter.filter((d) => d.originalFilename.toLowerCase().includes(term)) : byFilter;
  const verifyCount = (documents ?? []).filter(needsReview).length;

  return (
    <ScreenContainer>
      <PersonBar />
      <ScreenHeader title={verifyOnly ? 'Reports to verify' : VISUAL_V2_ENABLED ? 'Documents & Records' : 'My documents'} />
      {VISUAL_V2_ENABLED && documents && documents.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }} testID="documents-tools">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, minHeight: theme.minTouchTarget }}>
            <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
            <RNTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search documents"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel="Search documents"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="documents-search"
              style={[theme.typography.bodyMedium, { flex: 1, color: theme.colors.textPrimary, paddingVertical: 0 }]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            {[
              { key: 'all', label: 'All', on: !verifyOnly, go: () => router.setParams({ filter: undefined }) },
              { key: 'verify', label: verifyCount > 0 ? `To verify (${verifyCount})` : 'To verify', on: verifyOnly, go: () => router.setParams({ filter: 'verify' }) },
            ].map((chip) => (
              <Pressable
                key={chip.key}
                onPress={chip.go}
                accessibilityRole="button"
                accessibilityState={{ selected: chip.on }}
                testID={`documents-chip-${chip.key}`}
                style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: chip.on ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: chip.on ? theme.colors.brandPrimary : theme.colors.surface }}
              >
                <Text style={[theme.typography.labelMedium, { color: chip.on ? theme.colors.textOnDark : theme.colors.textPrimary }]}>{chip.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
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
          {term && shown.length === 0 ? (
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]} testID="documents-no-match">
              No documents match that name.
            </Text>
          ) : null}
          {VISUAL_V2_ENABLED ? <Button label="Upload document" onPress={() => router.push('/add')} testID="documents-upload" /> : null}
        </View>
      )}
    </ScreenContainer>
  );
}
