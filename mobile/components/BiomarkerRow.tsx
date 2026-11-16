import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';

import { useTheme } from '../design/theme';
import { RANGE_STATUS_LABEL, rangeStatusFor } from '../services/health/rangeStatus';
import type { RecordedObservation, Trend } from '../types';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

function Spark({ trend, color }: { trend: Trend; color: string }) {
  const values = trend.points.map((p) => p.value);
  if (values.length < 2) return null;
  const w = 44;
  const h = 20;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((v, i) => `${(i * w) / (values.length - 1)},${h - 2 - ((v - min) / range) * (h - 4)}`).join(' ');
  return (
    <Svg width={w} height={h}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * One result in the Biomarkers list: the value as printed, the report's own range, where the
 * value sits against that range, and a small line when there is history. Opens the trend when
 * there is one, else the report it came from.
 */
export function BiomarkerRow({ result, trend, onPress }: { result: RecordedObservation; trend?: Trend; onPress?: () => void }) {
  const theme = useTheme();
  const status = rangeStatusFor(result);
  const label = status ? RANGE_STATUS_LABEL[status] : result.needsReview ? 'To verify' : null;
  return (
    <Card
      onPress={onPress}
      testID={`biomarker-${result.id}`}
      accessibilityLabel={`${result.name} ${result.value}${result.unit ? ` ${result.unit}` : ''}${result.referenceRange ? `, range ${result.referenceRange}` : ''}${label ? `, ${label}` : ''}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {result.name}
          </Text>
          <Text style={[theme.typography.headingMedium, { color: theme.colors.textPrimary }]}>
            {result.value}
            {result.unit ? <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}> {result.unit}</Text> : null}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {result.referenceRange ? `Ref: ${result.referenceRange}` : 'No range on the report'}
          </Text>
        </View>
        {label ? <StatusBadge label={label} tone={status === 'in_range' ? 'success' : status ? 'warning' : 'neutral'} /> : null}
        {trend ? <Spark trend={trend} color={theme.colors.accent} /> : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} /> : null}
      </View>
    </Card>
  );
}
