import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';

import { Card, ErrorState, LoadingState, ReadReportPanel, ScreenContainer, ScreenHeader, StatusBadge } from '../../components';
import { isDemoMode } from '../../config/appMode';
import { useTheme } from '../../design/theme';
import { useReadReport } from '../../hooks/useReadReport';
import { loadDemoServices } from '../../services/demo/demoServices';
import {
  presentDocumentStatus,
  documentsService,
  formatFileSize,
  hasStoredOriginal,
  isStoredDocumentId,
} from '../../services/documents/documentsService';
import { healthService } from '../../services/health/healthService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import type { Document, HealthChange, Observation, RecordedObservation, StoredDocument } from '../../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Document screen.
 *   • Real stored documents (UUID ids) → their real metadata and reading
 *     status (read / retry), the results read from it with the page each
 *     came from, and the original via a short-lived signed URL (never a
 *     public URL). We don't promise to jump to the page inside the PDF.
 *   • Records behind the sample Health Memory → the existing viewer,
 *     clearly labelled "Sample data".
 */
export default function DocumentViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return isStoredDocumentId(id) ? <StoredDocumentView id={id} /> : <SampleDocumentView id={id} />;
}

function StoredDocumentView({ id }: { id: string }) {
  const theme = useTheme();
  const [document, setDocument] = useState<StoredDocument | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [results, setResults] = useState<RecordedObservation[]>([]);
  // Uploaded PDFs and camera scans are both read on the server.
  const reading = useReadReport(document ? id : null);
  const phase = reading.view.kind === 'state' ? reading.view.state.phase : null;

  const load = useCallback(
    async (quiet = false) => {
      setLoadError(null);
      if (!quiet) setDocument(undefined);
      try {
        const doc = await documentsService.getDocument(id);
        setDocument(doc);
        setResults(doc?.status === 'completed' ? await healthService.getDocumentObservations(id) : []);
      } catch (error) {
        if (!quiet) setLoadError(error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);
      }
    },
    [id]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Reading finished or failed while this screen was open: refresh status and results.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (phase === 'ready' || phase === 'failed') load(true);
  }, [phase, load]);

  async function openOriginal(doc: StoredDocument) {
    setOpenError(null);
    setOpening(true);
    try {
      const url = await documentsService.getOriginalDocumentUrl(doc);
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      setOpenError(error instanceof ServiceError ? error.userMessage : GENERIC_ERROR_MESSAGE);
    } finally {
      setOpening(false);
    }
  }

  if (loadError) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Report" />
        <ErrorState description={loadError} onRetry={() => load()} />
      </ScreenContainer>
    );
  }

  if (document === undefined) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Report" />
        <LoadingState label="Loading document…" />
      </ScreenContainer>
    );
  }

  if (!document) {
    // Also what another user's document id looks like: RLS returns nothing.
    return (
      <ScreenContainer>
        <ScreenHeader title="Report" />
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>Document not found.</Text>
      </ScreenContainer>
    );
  }

  const presentation = presentDocumentStatus(document);

  return (
    <ScreenContainer>
      <ScreenHeader title="Report" />

      <View style={{ gap: 4 }}>
        <Text style={[theme.typography.headingMedium, { color: theme.colors.textPrimary }]}>{document.originalFilename}</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          Uploaded {formatDate(document.uploadedAt ?? document.createdAt)} · {formatFileSize(document.fileSizeBytes)}
        </Text>
      </View>

      <Card>
        <View style={{ gap: theme.spacing.xs }}>
          <StatusBadge label={presentation.label} tone={presentation.tone} />
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{presentation.description}</Text>
        </View>
      </Card>

      {/* Reading status for PDFs and scans alike; once read, it offers Read again. */}
      {reading.view.kind !== 'loading' ? (
        <ReadReportPanel
          view={reading.view}
          onAllow={reading.allow}
          onDecline={reading.decline}
          onRead={reading.read}
          onReadAgain={reading.readAgain}
        />
      ) : null}

      {results.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }} testID="document-results">
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Read from this report</Text>
          {results.map((r) => (
            <RecordedResultRow key={r.id} result={r} />
          ))}
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            Values are shown exactly as printed. Open the original to check them against the page shown.
          </Text>
        </View>
      ) : null}

      <Card>
        <View
          style={{
            aspectRatio: 3 / 4,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
          accessibilityLabel={`${document.originalFilename}, PDF`}
        >
          <Ionicons name="document-text-outline" size={40} color={theme.colors.textTertiary} />
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>PDF · stored privately</Text>
        </View>
      </Card>

      {hasStoredOriginal(document.status) ? (
        <Card onPress={opening ? undefined : () => openOriginal(document)} accessibilityLabel="View original document">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name="open-outline" size={18} color={theme.colors.brandPrimary} />
            <Text style={[theme.typography.labelLarge, { color: theme.colors.brandPrimary }]}>
              {opening ? 'Opening…' : 'View Original'}
            </Text>
          </View>
        </Card>
      ) : null}
      {openError ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite">
          {openError}
        </Text>
      ) : null}
    </ScreenContainer>
  );
}

function RecordedResultRow({ result }: { result: RecordedObservation }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{result.name}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            {result.source.pageNumber ? `Page ${result.source.pageNumber}` : 'Page not recorded'}
            {result.referenceRange ? ` · Range ${result.referenceRange}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
            {result.value}
            {result.unit ? ` ${result.unit}` : ''}
          </Text>
          {result.needsReview ? <StatusBadge label="Not yet checked" tone="warning" /> : null}
        </View>
      </View>
    </Card>
  );
}

/** The existing viewer, now only for sample records (demo mode) — labelled as such. */
function SampleDocumentView({ id }: { id: string }) {
  const theme = useTheme();
  const [document, setDocument] = useState<Document | null | undefined>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [changes, setChanges] = useState<HealthChange[]>([]);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      // Sample records exist only in demo builds; production has none.
      const samples = isDemoMode ? loadDemoServices().sampleDocuments : null;
      const doc = samples ? await samples.getSampleDocument(id) : undefined;
      setDocument(doc ?? undefined);
      if (doc && samples) {
        setObservations(await samples.getSampleObservations(doc));
        const allChanges = await healthService.getWhatChanged();
        setChanges(allChanges.filter((change) => change.sourceDocumentId === doc.id));
      }
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
        <ScreenHeader title="Report" />
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  if (document === null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Report" />
        <LoadingState label="Loading document…" />
      </ScreenContainer>
    );
  }

  if (!document) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Report" />
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>Document not found.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Report" />

      <View style={{ gap: 4 }}>
        <StatusBadge label="Sample data" tone="warning" />
        <Text style={[theme.typography.headingMedium, { color: theme.colors.textPrimary }]}>{document.title}</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          {formatDate(document.date)}
          {document.provider ? ` · ${document.provider}` : ''}
        </Text>
      </View>

      <Card>
        <View
          style={{
            aspectRatio: 3 / 4,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
          accessibilityLabel={`Preview of ${document.title}`}
        >
          <Ionicons name="document-text-outline" size={40} color={theme.colors.textTertiary} />
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            {document.pageCount ?? 1} page{(document.pageCount ?? 1) > 1 ? 's' : ''} · sample preview
          </Text>
        </View>
      </Card>

      {observations.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Extracted information</Text>
          {observations.map((obs) => (
            <Card key={obs.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{obs.name}</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Page {document.pageCount ?? 1}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
                    {obs.value} {obs.unit}
                  </Text>
                  {obs.confidence ? (
                    <StatusBadge label={`${Math.round(obs.confidence * 100)}% confidence`} tone="neutral" />
                  ) : null}
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {changes.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>AI explanation</Text>
          {changes.map((change) => (
            <Card
              key={change.id}
              style={{ backgroundColor: theme.colors.surfaceAlt, borderStyle: 'dashed' }}
            >
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
                <Ionicons name="sparkles-outline" size={18} color={theme.colors.brandSecondary} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>
                    {change.type === 'value_change'
                      ? `Your latest ${change.metricOrItemName} (${change.currentValue}${change.unit ?? ''}) is ${
                          Number(change.currentValue) > Number(change.previousValue) ? 'higher' : 'lower'
                        } than your previous recorded value (${change.previousValue}${change.unit ?? ''}).`
                      : `${change.metricOrItemName} was added from this report.`}
                  </Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                    This is an observation about your records, not a diagnosis or treatment recommendation.
                  </Text>
                  {change.comparedSourceDocumentId ? (
                    <Card
                      onPress={() => router.push(`/documents/${change.comparedSourceDocumentId}`)}
                      accessibilityLabel="View previous result"
                      style={{ marginTop: theme.spacing.xs }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                        <Ionicons name="arrow-back-circle-outline" size={16} color={theme.colors.brandPrimary} />
                        <Text style={[theme.typography.labelMedium, { color: theme.colors.brandPrimary }]}>
                          View previous result
                        </Text>
                      </View>
                    </Card>
                  ) : null}
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <Card
        onPress={() => Alert.alert('Sample data', 'This is a sample report, so there is no original file to open.')}
        accessibilityLabel="View original document"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Ionicons name="open-outline" size={18} color={theme.colors.brandPrimary} />
          <Text style={[theme.typography.labelLarge, { color: theme.colors.brandPrimary }]}>View Original</Text>
        </View>
      </Card>
    </ScreenContainer>
  );
}
