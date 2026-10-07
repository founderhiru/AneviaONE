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

export const READING_COPY = {
  title: 'Reading your report…',
  description: 'We’re extracting the important health information.',
  ready: 'Your report is ready.',
} as const;

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
};

/** The AI consent, shown once before anything is read. */
export function AiConsentCard({ onAllow, onDecline, title = AI_CONSENT_COPY.title }: { onAllow: () => void; onDecline: () => void; title?: string }) {
  const theme = useTheme();
  const body = [theme.typography.bodyMedium, { color: theme.colors.textSecondary }];
  return (
    <Card testID="ai-consent">
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          {title}
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

/**
 * Consent, progress, result and failure states for reading one report.
 * Reading starts by itself (useReadReport autoStart) — there is no "Read
 * report" button; "Read again" is a secondary recovery action only.
 * Wording only describes what the server has actually reported.
 */
export function ReadReportPanel({ view, onAllow, onDecline, onRead, onReadAgain, onViewResults }: Props) {
  const theme = useTheme();
  const body = [theme.typography.bodyMedium, { color: theme.colors.textSecondary }];
  const small = [theme.typography.bodySmall, { color: theme.colors.textTertiary }];

  if (view.kind === 'loading') return null;

  if (view.kind === 'consent') return <AiConsentCard onAllow={onAllow} onDecline={onDecline} />;

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
      // Only reached when reading hasn't been allowed ("Not now").
      return (
        <Card testID="read-report-not-allowed">
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={body}>Your original is stored safely. Nothing from it has been added to your Health Memory, because report reading isn’t allowed yet.</Text>
            <SecondaryButton label="Allow report reading" onPress={() => onRead(false)} testID="read-report-allow" />
          </View>
        </Card>
      );
    case 'processing':
      return (
        <View testID="read-report-processing">
          <ProcessingState title={READING_COPY.title} description={READING_COPY.description} steps={readingSteps('reading')} />
        </View>
      );
    case 'ready': {
      // Read, but nothing found: say so — never "added" with nothing added.
      if (state.resultsAdded === 0 && state.needsReview === 0 && state.alreadyInMemory === 0) {
        return (
          <Card testID="read-report-nothing-found">
            <View style={{ gap: theme.spacing.sm }}>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>No health information found</Text>
              <Text style={body}>We read this report but didn’t find any health information to add. Your original is stored safely.</Text>
              {onReadAgain ? <SecondaryButton label="Read again" onPress={onReadAgain} testID="read-report-again" /> : null}
            </View>
          </Card>
        );
      }
      const lines = [
        `${state.resultsAdded} result${state.resultsAdded === 1 ? '' : 's'} added to your Health Memory`,
        state.needsReview ? `${state.needsReview} held back until checked (not clear enough to use yet)` : null,
        state.alreadyInMemory ? `${state.alreadyInMemory} already in your Health Memory` : null,
      ].filter((l): l is string => Boolean(l));
      return (
        <Card testID="read-report-ready">
          <View style={{ gap: theme.spacing.sm }}>
            <ProcessingState title={READING_COPY.ready} steps={readingSteps('ready')} />
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
