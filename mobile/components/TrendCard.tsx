import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useTheme } from '../design/theme';
import type { Trend } from '../types';
import { Card } from './Card';

export type TrendCardProps = {
  trend: Trend;
  onPress?: () => void;
  compact?: boolean;
};

const directionSymbol: Record<Trend['direction'], string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

function Sparkline({ trend, color, width, height }: { trend: Trend; color: string; width: number; height: number }) {
  const values = trend.points.map((p) => p.value);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrendCard({ trend, onPress, compact = true }: TrendCardProps) {
  const theme = useTheme();
  const directionColor = {
    up: theme.colors.trendUp,
    down: theme.colors.trendDown,
    flat: theme.colors.trendFlat,
  }[trend.direction];

  return (
    <Card onPress={onPress} accessibilityLabel={`${trend.metricName}, current value ${trend.currentValue} ${trend.unit ?? ''}, trending ${trend.direction}`}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>{trend.metricName}</Text>
          <View style={styles.valueRow}>
            <Text style={[theme.typography.headingMedium, { color: theme.colors.textPrimary }]}>
              {trend.currentValue}
              {trend.unit ? ` ${trend.unit}` : ''}
            </Text>
            <Text style={[theme.typography.labelMedium, { color: directionColor }]}>
              {' '}
              {directionSymbol[trend.direction]}
            </Text>
          </View>
        </View>
        {!compact ? null : <Sparkline trend={trend} color={directionColor} width={72} height={32} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});
