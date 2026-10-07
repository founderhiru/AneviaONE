import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../design/theme';
import type { ReadReportView } from '../hooks/useReadReport';
import { AI_CONSENT_COPY } from '../services/consent/consentService';
import { FAILURE_TITLE } from '../services/processing/processingService';
import { Button } from './Button';
import { Card } from './Card';
import { ProcessingState, type ProcessingStep } from './ProcessingState';
import { SecondaryButton } from './SecondaryButton';

/** Uploading → Processing → Reading report → Ready. Upload is already done here. */
export function readingSteps(phase: 'starting' | 'reading' | 'ready'): ProcessingStep[] {
  const order = ['starting', 'reading', 'ready'] as const;
  const at = order.indexOf(phase);
  return [
    { id: 'uploading', label: 'Uploading', status: 'done' },
    { id: 'processing', label: 'Processing', status: at === 0 ? 'active' : 'done' },
    { id: 'reading', label: 'Reading report', status: at === 1 ? 'active' : at > 1 ? 'done' : 'pending' },
    { id: 'ready', label: 'Ready', status: at === 2 ? 'done' : 'pending' },
  ];
}

type Props = {
  view: ReadReportView;
  onAllow: () => void;
  onDecline: () => void;
  onRead: (retry?: boolean) => void;
  /** Read a completed report again (e.g. after reading improves). */
  onReadAgain?: () => void;
  /** Shown on "Ready" (e.g. open Health). */
  onViewResults?: () => void;
  /** Whether to offer "Read this report" when nothing has started. */
  offerRead?: boolean;
};

/**
 * Consent, progress, result and failure states for reading one report.
 * Wording only describes what the server has actually reported.
 */
export function ReadReportPanel({ view, onAllow, onDecline, onRead, onReadAgain, onViewResults, offerRead = true }: Props) {
  const theme = useTheme();
  const body = [theme.typography.bodyMedium, { color: theme.colors.textSecondary }];
  const small = [theme.typography.bodySmall, { color: theme.colors.textTertiary }];

  if (view.kind === 'loading') return null;

  if (view.kind === 'consent') {
    return (
      <Card testID="ai-consent">
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            {AI_CONSENT_COPY.title}
          </Text>
          {AI_CONSENT_COPY.points.map((point) => (
            <View key={point} style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.brandPrimary} style={{ marginTop: 2 }} />
              <Text style={[...body, { flex: 1 }]}>{point}</Text>
            </View>
          ))}
          <Button label={AI_CONSENT_COPY.allow} onPress={onAllow} />
          <SecondaryButton label={AI_CONSENT_COPY.decline} onPress={onDecline} />
        </View>
      </Card>
    );
  }

  if (view.kind === 'error') {
    return (
      <Card testID="read-report-error">
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{FAILURE_TITLE}</Text>
          <Text style={body}>{view.message}</Text>
          <SecondaryButton label="Retry" onPress={() => onRead(true)} />
        </View>
      </Card>
    );
  }

  if (view.kind === 'slow') {
    return (
      <Card testID="read-report-slow">
        <Text style={body}>
          This report is taking longer than usual to read. You can leave this screen — it keeps going, and its status updates in your documents.
        </Text>
      </Card>
    );
  }

  const { state } = view;
  switch (state.phase) {
    case 'not_started':
      return offerRead ? (
        <Card testID="read-report-offer">
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={body}>Nothing from this report has been added to your Health Memory yet.</Text>
            <Button label="Read this report" onPress={() => onRead(false)} />
          </View>
        </Card>
      ) : null;
    case 'processing':
      return <ProcessingState title="Reading your report…" steps={readingSteps('reading')} />;
    case 'ready': {
      const lines = [
        `${state.resultsAdded} result${state.resultsAdded === 1 ? '' : 's'} added to your Health Memory`,
        state.needsReview ? `${state.needsReview} held back until checked (not clear enough to use yet)` : null,
        state.alreadyInMemory ? `${state.alreadyInMemory} already in your Health Memory` : null,
      ].filter((l): l is string => Boolean(l));
      return (
        <Card testID="read-report-ready">
          <View style={{ gap: theme.spacing.sm }}>
            <ProcessingState title="Ready" steps={readingSteps('ready')} />
            {lines.map((line) => (
              <Text key={line} style={body}>
                {line}
              </Text>
            ))}
            <Text style={small}>Each result shows the report and page it was read from.</Text>
            {onViewResults ? <Button label="View results" onPress={onViewResults} /> : null}
            {onReadAgain ? <SecondaryButton label="Read again" onPress={onReadAgain} testID="read-report-again" /> : null}
          </View>
        </Card>
      );
    }
    case 'needs_review':
      return (
        <Card testID="read-report-needs-review">
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Needs review</Text>
            <Text style={body}>{state.message}</Text>
            <Text style={small}>Nothing from this report was added to your Health Memory. Check the original to see whose report it is.</Text>
          </View>
        </Card>
      );
    case 'failed':
      return (
        <Card testID="read-report-failed">
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{FAILURE_TITLE}</Text>
            <Text style={body}>{state.message}</Text>
            {state.canRetry ? <SecondaryButton label="Retry" onPress={() => onRead(true)} /> : null}
          </View>
        </Card>
      );
  }
}
