import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { FOREST } from '../../design/brandSurface';
import { useTheme } from '../../design/theme';
import { shortDate } from '../../services/health/homeDashboard';
import type { NumericComparison } from '../../services/health/whatChanged';
import { formatPercent } from './WhatChangedUI';

/**
 * The new Home's building blocks ("what changed" first, with graphs).
 * Presentation only: every comparison arrives already derived from the
 * person's own trusted results. Lines are neutral: they show direction and
 * size, never good or bad, and never a diagnosis.
 *
 * Motion is a single gentle draw-in per line, skipped when the phone asks for
 * reduced motion.
 */

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const DRAW_LENGTH = 2000; // longer than any line drawn here

/** True when the phone asks for less motion (and until we know, assume it does). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => live && setReduced(Boolean(v)))
      .catch(() => live && setReduced(false));
    return () => {
      live = false;
    };
  }, []);
  return reduced;
}

/** A trend line that draws itself in once; needs at least two points. */
export function TrendLine({ values, width, height, color, delay = 0, onDark = false }: { values: number[]; width: number; height: number; color: string; delay?: number; onDark?: boolean }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const a = Animated.timing(progress, { toValue: 1, duration: 900, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [reduced, progress, delay]);
  if (values.length < 2) return null;
  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: pad + (i * (width - pad * 2)) / (values.length - 1),
    y: pad + (1 - (max === min ? 0.5 : (v - min) / span)) * (height - pad * 2),
  }));
  const last = pts[pts.length - 1];
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [DRAW_LENGTH, 0] });
  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="trend-line">
      <Svg width={width} height={height}>
        <AnimatedPolyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={onDark ? 2.5 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${DRAW_LENGTH}`}
          strokeDashoffset={dashOffset}
        />
        <Circle cx={last.x} cy={last.y} r={4} fill={color} />
      </Svg>
    </View>
  );
}

const arrow = (c: NumericComparison) => (c.direction === 'up' ? '▲' : c.direction === 'down' ? '▼' : '–');
const pct = (c: NumericComparison) => (c.direction === 'same' ? 'no change' : c.percentChange === null ? '' : formatPercent(c.percentChange));
const withUnit = (v: string, unit: string | null) => (unit ? `${v} ${unit}` : v);

/** Counts what moved since the previous report, with a small line for each. */
export function ChangeSummaryCard({ comparisons, onOpen }: { comparisons: NumericComparison[]; onOpen: () => void }) {
  const theme = useTheme();
  const moved = comparisons.filter((c) => c.direction !== 'same');
  const shown = comparisons.slice(0, 3);
  const latestDate = comparisons.map((c) => c.latest.date).sort().pop() ?? null;
  const [width, setWidth] = useState(0);
  if (comparisons.length === 0) {
    return (
      <View style={{ gap: 4, padding: theme.spacing.md, borderRadius: theme.radius.xl, backgroundColor: theme.colors.accentSubtle }} testID="home-change-empty">
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">What changed?</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          Your health story is taking shape. Add another report and you’ll see here how each result has moved.
        </Text>
      </View>
    );
  }
  const headline = moved.length === 0 ? 'Nothing has moved since your last report.' : `${moved.length} ${moved.length === 1 ? 'result' : 'results'} changed since your last report.`;
  const tileW = Math.floor(((width || 320) - theme.spacing.md * 2 - theme.spacing.xs * (shown.length - 1)) / shown.length); // 320 until measured
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`What changed. ${headline} Open.`}
      testID="home-change-card"
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={({ pressed }) => ({ gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.xl, backgroundColor: FOREST.field, opacity: pressed ? 0.92 : 1 })}
    >
      <Text style={[theme.typography.labelSmall, { color: FOREST.gold, letterSpacing: 1.2 }]}>
        {latestDate ? `WHAT CHANGED · ${shortDate(latestDate)?.toUpperCase()}` : 'WHAT CHANGED'}
      </Text>
      <Text style={[theme.typography.headingMedium, { color: FOREST.text }]} accessibilityRole="header">{headline}</Text>
      {tileW > 0 ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {shown.map((c, i) => (
            <View key={c.key} style={{ width: tileW, gap: 2, padding: theme.spacing.xs, borderRadius: theme.radius.md, backgroundColor: 'rgba(246,249,239,0.08)' }} testID={`change-tile-${c.key}`}>
              <Text style={[theme.typography.caption, { color: FOREST.textMuted }]} numberOfLines={1}>{c.name}</Text>
              <Text style={[theme.typography.labelLarge, { color: FOREST.text }]} numberOfLines={1}>{c.latest.valueText}</Text>
              <Text style={[theme.typography.labelSmall, { color: FOREST.gold }]} numberOfLines={1}>{arrow(c)} {pct(c)}</Text>
              <TrendLine values={c.points.map((p) => p.value)} width={tileW - theme.spacing.xs * 2} height={32} color={FOREST.gold} delay={i * 120} onDark />
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[theme.typography.labelMedium, { color: FOREST.text }]}>See every change</Text>
        <Ionicons name="chevron-forward" size={16} color={FOREST.text} />
      </View>
    </Pressable>
  );
}

/** Every tracked measure as a swipeable tile with its own line. */
export function KeyMeasureTiles({ comparisons, onOpen }: { comparisons: NumericComparison[]; onOpen: (c: NumericComparison) => void }) {
  const theme = useTheme();
  if (comparisons.length === 0) return null;
  return (
    <View style={{ gap: theme.spacing.xs }} testID="home-key-measures">
      <Text style={[theme.typography.labelMedium, { color: theme.colors.textTertiary, letterSpacing: 1 }]} accessibilityRole="header">YOUR KEY MEASURES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs }}>
        {comparisons.slice(0, 8).map((c, i) => (
          <Pressable
            key={c.key}
            onPress={() => onOpen(c)}
            accessibilityRole="button"
            accessibilityLabel={`${c.name}: ${withUnit(c.latest.valueText, c.unit)} on ${shortDate(c.latest.date)}. ${c.summary}`}
            testID={`measure-tile-${c.key}`}
            style={({ pressed }) => ({ width: 168, gap: 2, padding: theme.spacing.sm, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>{c.name}</Text>
            <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} numberOfLines={1}>{withUnit(c.latest.valueText, c.unit)}</Text>
            <TrendLine values={c.points.map((p) => p.value)} width={144} height={36} color={theme.colors.accent} delay={i * 100} />
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>
              {c.points.length} reports · {arrow(c)} {pct(c)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Only when a report has unclear pages (or couldn't be read): one calm card, never a warning per result. */
export function CheckCard({ unclear, couldNotRead, onPress }: { unclear: number; couldNotRead: number; onPress: () => void }) {
  const theme = useTheme();
  if (unclear === 0 && couldNotRead === 0) return null;
  const title = unclear
    ? `${unclear} ${unclear === 1 ? 'report has' : 'reports have'} pages that were hard to read`
    : `${couldNotRead} ${couldNotRead === 1 ? 'report' : 'reports'} couldn’t be read`;
  const line = unclear
    ? 'Compare them with the original and confirm in one tap.'
    : 'Open it to see why, or try a clearer photo or the original PDF.';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      testID="home-check-card"
      style={({ pressed }) => ({ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center', padding: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.colors.warningSubtle, opacity: pressed ? 0.85 : 1 })}
    >
      <Ionicons name="eye-outline" size={24} color={theme.colors.warning} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.warning }]}>{title}</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{line}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.warning} />
    </Pressable>
  );
}

/** A quiet shortcut to the one-page Doctor summary. */
export function DoctorShortcut({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Visiting a Doctor? Open your one-page summary"
      testID="home-doctor-shortcut"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 })}
    >
      <Ionicons name="medkit-outline" size={24} color={theme.colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Visiting a Doctor?</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Share a one-page summary of your history.</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
    </Pressable>
  );
}
