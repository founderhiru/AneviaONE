import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { router, useLocalSearchParams } from 'expo-router';

import { Card, EvidenceLink, ErrorState, LoadingState, ScreenContainer, ScreenHeader } from '../../components';
import { useTheme } from '../../design/theme';
import { healthService } from '../../services/health/healthService';
import type { Trend } from '../../types';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;

function HistoricalChart({ trend, color }: { trend: Trend; color: string }) {
  const theme = useTheme();
  const values = trend.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 24;
  const usableWidth = CHART_WIDTH - padding * 2;
  const usableHeight = CHART_HEIGHT - padding * 2;
  const stepX = trend.points.length > 1 ? usableWidth / (trend.points.length - 1) : 0;

  const coords = trend.points.map((p, i) => ({
    x: padding + i * stepX,
    y: padding + usableHeight - ((p.value - min) / range) * usableHeight,
    year: new Date(p.date).getFullYear(),
  }));

  return (
    <View>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Line x1={padding} y1={CHART_HEIGHT - padding} x2={CHART_WIDTH - padding} y2={CHART_HEIGHT - padding} stroke={theme.colors.border} strokeWidth={1} />
        <Polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={4} fill={color} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: padding - 12 }}>
        {coords.map((c, i) => (
          <Text key={i} style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            {c.year}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function TrendDetailScreen() {
  const theme = useTheme();
  const { metric } = useLocalSearchParams<{ metric: string }>();
  const [trend, setTrend] = useState<Trend | null | undefined>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const result = await healthService.getTrendByMetricName(decodeURIComponent(metric));
      setTrend(result ?? undefined);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric]);

  if (error) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Trend" />
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  if (trend === null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Trend" />
        <LoadingState label="Loading trend…" />
      </ScreenContainer>
    );
  }

  if (!trend) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Trend" />
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>Trend not found.</Text>
      </ScreenContainer>
    );
  }

  const directionColor = { up: theme.colors.trendUp, down: theme.colors.trendDown, flat: theme.colors.trendFlat }[trend.direction];

  return (
    <ScreenContainer>
      <ScreenHeader title={trend.metricName} />

      <View style={{ gap: 2 }}>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>Current</Text>
        <Text style={[theme.typography.displayLarge, { color: theme.colors.textPrimary }]}>
          {trend.currentValue}
          {trend.unit ? trend.unit : ''}
        </Text>
        {trend.referenceRange ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            Reference range: {trend.referenceRange}
          </Text>
        ) : null}
      </View>

      <Card>
        <HistoricalChart trend={trend} color={directionColor} />
      </Card>

      <Card>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{trend.neutralSummary}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: theme.spacing.xs }]}>
          This is an observation about your records, not a diagnosis or treatment recommendation.
        </Text>
      </Card>

      <View style={{ gap: theme.spacing.xs }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Source records</Text>
        {trend.points.map((point, index) => (
          <View
            key={index}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.xxs }}
          >
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
              {new Date(point.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>
                {point.value} {trend.unit}
              </Text>
              {point.sourceDocumentId ? (
                <EvidenceLink label="Evidence" onPress={() => router.push(`/documents/${point.sourceDocumentId}`)} />
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}
