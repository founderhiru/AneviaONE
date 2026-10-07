import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../design/theme';

export type ProcessingStep = {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending';
};

export type ProcessingStateProps = {
  title: string;
  steps: ProcessingStep[];
};

/** A step checklist (upload stages, report reading). Purely presentational:
 * callers pass steps that reflect what has actually happened. */
export function ProcessingState({ title, steps }: ProcessingStateProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.lg, padding: theme.spacing.xl }} accessibilityRole="progressbar" accessibilityLabel={title}>
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary, textAlign: 'center' }]}>
        {title}
      </Text>
      <View style={{ gap: theme.spacing.sm }}>
        {steps.map((step) => (
          <View key={step.id} style={styles.row}>
            <StepIcon status={step.status} />
            <Text
              style={[
                theme.typography.bodyMedium,
                {
                  color: step.status === 'pending' ? theme.colors.textTertiary : theme.colors.textPrimary,
                },
              ]}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepIcon({ status }: { status: ProcessingStep['status'] }) {
  const theme = useTheme();
  if (status === 'active') {
    return <ActivityIndicator size="small" color={theme.colors.brandPrimary} />;
  }
  const symbol = status === 'done' ? '✓' : '○';
  const color = status === 'done' ? theme.colors.success : theme.colors.textDisabled;
  return (
    <Text style={[theme.typography.labelLarge, { color, width: 20, textAlign: 'center' }]}>{symbol}</Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
