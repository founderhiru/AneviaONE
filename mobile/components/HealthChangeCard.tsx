import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';
import type { ChangeType, HealthChange } from '../types';
import { Card } from './Card';
import { EvidenceLink } from './EvidenceLink';
import { SecondaryButton } from './SecondaryButton';

export type HealthChangeCardProps = {
  change: HealthChange;
  onViewTrend?: () => void;
  onViewEvidence?: () => void;
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const ITEM_TITLES: Record<Exclude<ChangeType, 'value_change'>, string> = {
  new_medication: 'New medication',
  stopped_medication: 'Medication stopped',
  medication_not_in_latest: 'Not in the latest report',
  new_condition: 'New condition',
  new_allergy: 'New allergy',
  new_procedure: 'Procedure',
  new_immunization: 'Vaccination',
  new_encounter: 'Visit',
};

export function HealthChangeCard({ change, onViewTrend, onViewEvidence }: HealthChangeCardProps) {
  const theme = useTheme();
  const isItem = change.type !== 'value_change';

  return (
    <Card>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>
          {change.type !== 'value_change' ? ITEM_TITLES[change.type] : change.metricOrItemName}
        </Text>

        {isItem ? (
          <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>
            {change.metricOrItemName}
          </Text>
        ) : (
          <View style={styles.valueRow}>
            <Text style={[theme.typography.headingSmall, { color: theme.colors.textSecondary }]}>
              {change.previousValue}
            </Text>
            <Text style={[theme.typography.headingSmall, { color: theme.colors.textTertiary }]}> → </Text>
            <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>
              {change.currentValue}
            </Text>
            {change.unit ? (
              <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}> {change.unit}</Text>
            ) : null}
          </View>
        )}

        {change.summary ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{change.summary}</Text>
        ) : null}

        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          {formatDate(change.date)}
          {change.comparedWithDate ? `  ·  Compared with: ${formatDate(change.comparedWithDate)}` : ''}
        </Text>

        <View style={[styles.actions, { marginTop: theme.spacing.xs }]}>
          {!isItem && onViewTrend ? (
            <SecondaryButton label="View Trend" onPress={onViewTrend} fullWidth={false} />
          ) : null}
          {onViewEvidence ? <EvidenceLink onPress={onViewEvidence} /> : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
});
