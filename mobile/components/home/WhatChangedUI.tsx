import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { FOREST } from '../../design/brandSurface';
import { useTheme } from '../../design/theme';
import { formatFileSize, presentDocumentStatus } from '../../services/documents/documentsService';
import { resultPosition, shortDate } from '../../services/health/homeDashboard';
import {
  GROUP_LABEL,
  resultGroup,
  type FindingHistory,
  type HomeCounts,
  type NumericComparison,
  type ResultGroup,
} from '../../services/health/whatChanged';
import type { RecordedObservation, StoredDocument } from '../../types';

/**
 * Home and "What changed?" building blocks, after the approved mockup.
 * Presentation only — every count and comparison arrives already derived
 * (services/health/whatChanged.ts) from the person's own trusted records.
 */

const withUnit = (value: string, unit: string | null | undefined) => (unit ? `${value} ${unit}` : value);

export const GROUP_ICON: Record<ResultGroup, keyof typeof Ionicons.glyphMap> = {
  lab: 'flask-outline',
  imaging: 'scan-outline',
  other: 'pulse-outline',
};

const GROUP_NOUN: Record<ResultGroup, string> = { lab: 'Lab test', imaging: 'Imaging', other: 'Other' };

/** "+5%" / "−0.4%": whole percent from 1% up, one decimal below. */
export function formatPercent(p: number): string {
  const sign = p > 0 ? '+' : p < 0 ? '−' : '';
  const abs = Math.abs(p);
  return `${sign}${abs >= 1 ? Math.round(abs) : Math.round(abs * 10) / 10}%`;
}

// ------------------------------------------------------------- summary --

type Tile = { key: string; value: number; label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; ink: string; onPress?: () => void };

/** Reports | Results | Needs review — three tinted tiles. */
export function SummaryTiles({ counts, onReports, onResults, onReview }: { counts: HomeCounts; onReports: () => void; onResults: () => void; onReview: () => void }) {
  const theme = useTheme();
  const tiles: Tile[] = [
    { key: 'reports', value: counts.reports, label: counts.reports === 1 ? 'Report' : 'Reports', icon: 'document-text-outline', tint: theme.colors.accentSubtle, ink: theme.colors.accent, onPress: onReports },
    { key: 'results', value: counts.results, label: counts.results === 1 ? 'Result' : 'Results', icon: 'bar-chart-outline', tint: theme.colors.infoSubtle, ink: theme.colors.info, onPress: onResults },
    { key: 'review', value: counts.needsReview, label: 'Needs review', icon: 'time-outline', tint: theme.colors.warningSubtle, ink: theme.colors.warning, onPress: counts.needsReview ? onReview : undefined },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }} testID="home-summary">
      {tiles.map((t) => (
        <Pressable
          key={t.key}
          onPress={t.onPress}
          disabled={!t.onPress}
          accessibilityRole={t.onPress ? 'button' : 'text'}
          accessibilityLabel={`${t.value} ${t.label}`}
          testID={`summary-${t.key}`}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            gap: 2,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.xxs,
            borderRadius: theme.radius.lg,
            backgroundColor: t.tint,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name={t.icon} size={22} color={t.ink} />
          <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]}>{t.value}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ----------------------------------------------------------- sparkline --

/** A small line with dots and a soft fill; needs at least two points. */
export function Sparkline({ values, height = 56, color }: { values: number[]; height?: number; color?: string }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const stroke = color ?? theme.colors.accent;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  if (values.length < 2) return null;
  const w = width || 280; // until measured
  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: pad + (i * (w - pad * 2)) / (values.length - 1),
    y: pad + (1 - (max === min ? 0.5 : (v - min) / span)) * (height - pad * 2),
  }));
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `M${pts[0].x},${height} ${pts.map((p) => `L${p.x},${p.y}`).join(' ')} L${pts[pts.length - 1].x},${height} Z`;
  return (
    <View onLayout={onLayout} style={{ height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="sparkline">
      {values.length > 1 ? (
        <Svg width={w} height={height}>
          <Path d={area} fill={stroke} fillOpacity={0.08} />
          <Polyline points={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4 : 3} fill={stroke} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------ hero card --

function ChangeBadge({ c }: { c: NumericComparison }) {
  const theme = useTheme();
  if (c.direction === 'same') return <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>No change</Text>;
  if (c.percentChange === null) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Ionicons name={c.direction === 'up' ? 'trending-up' : 'trending-down'} size={16} color={theme.colors.accent} />
      <Text style={[theme.typography.labelLarge, { color: theme.colors.accent }]}>{formatPercent(c.percentChange)}</Text>
    </View>
  );
}

function HeroPreview({ c, width }: { c: NumericComparison; width?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{ width, gap: theme.spacing.xxs, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface }}
      accessible
      accessibilityLabel={`${c.name}: ${withUnit(c.previous.valueText, c.unit)} on ${shortDate(c.previous.date)}, ${withUnit(c.latest.valueText, c.unit)} on ${shortDate(c.latest.date)}. ${c.summary}`}
      testID={`hero-comparison-${c.key}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs }}>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={1}>{c.name}</Text>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {c.previous.valueText} → {withUnit(c.latest.valueText, c.unit)}
          </Text>
        </View>
        <ChangeBadge c={c} />
      </View>
      <Sparkline values={c.points.map((p) => p.value)} height={52} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{shortDate(c.points[0].date)}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{shortDate(c.latest.date)}</Text>
      </View>
    </View>
  );
}

/** The primary intelligence card: up to four recent comparisons, swipeable. */
export function WhatChangedHero({ comparisons, onOpen }: { comparisons: NumericComparison[]; onOpen: () => void }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const shown = comparisons.slice(0, 4);
  return (
    <View
      testID="home-what-changed"
      style={{ gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.xl, backgroundColor: theme.colors.accentSubtle }}
    >
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="What changed? Open" testID="home-what-changed-open" style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
          <Ionicons name="trending-up" size={22} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">What changed?</Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
            See how your key health results have changed across your reports and dates.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ marginTop: 2 }} />
      </Pressable>

      <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {shown.length === 0 ? (
          <View style={{ gap: 4, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface }} testID="home-what-changed-empty">
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Your health story is taking shape.</Text>
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Add another report to start comparing results over time.</Text>
          </View>
        ) : width === 0 ? (
          // Before the first layout pass: the newest comparison, full width.
          <Pressable onPress={onOpen} accessibilityRole="button">
            <HeroPreview c={shown[0]} />
          </Pressable>
        ) : (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            testID="home-what-changed-pages"
          >
            {shown.map((c) => (
              <Pressable key={c.key} onPress={onOpen} accessibilityRole="button">
                <HeroPreview c={c} width={width} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {shown.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityElementsHidden>
          {shown.map((c, i) => (
            <View key={c.key} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === page ? FOREST.field : theme.colors.borderStrong }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// --------------------------------------------------------------- chips --

export type ChipOption<K extends string> = { key: K; label: string; count?: number };

export function FilterChips<K extends string>({ options, selected, onSelect, testID }: { options: ChipOption<K>[]; selected: K; onSelect: (k: K) => void; testID?: string }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs }} testID={testID}>
      {options.map((o) => {
        const on = o.key === selected;
        const label = o.count === undefined ? o.label : `${o.label} (${o.count})`;
        return (
          <Pressable
            key={o.key}
            onPress={() => onSelect(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            testID={`${testID ?? 'chip'}-${o.key}`}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.pill,
              backgroundColor: on ? FOREST.field : theme.colors.surfaceAlt,
            }}
          >
            <Text style={[theme.typography.labelMedium, { color: on ? FOREST.text : theme.colors.textSecondary }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// -------------------------------------------------------- result rows --

function GroupIcon({ group }: { group: ResultGroup }) {
  const theme = useTheme();
  const tint = group === 'lab' ? theme.colors.accentSubtle : group === 'imaging' ? theme.colors.infoSubtle : theme.colors.surfaceAlt;
  const ink = group === 'lab' ? theme.colors.accent : group === 'imaging' ? theme.colors.info : theme.colors.textSecondary;
  return (
    <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: tint }}>
      <Ionicons name={GROUP_ICON[group]} size={18} color={ink} />
    </View>
  );
}

const Divider = () => {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 36 + theme.spacing.md * 2 }} />;
};

/** Compact result rows in one grouped card. Written findings are clamped to two lines (the full text is on the report page). */
export function ResultRows({ items, onPress, testID }: { items: RecordedObservation[]; onPress: (r: RecordedObservation) => void; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={{ borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }} testID={testID}>
      {items.map((r, i) => {
        const group = resultGroup(r);
        const isText = group === 'imaging' || r.valueNumeric === null || r.valueNumeric === undefined;
        const position = resultPosition(r);
        const marker = position === 'above' ? 'Above range' : position === 'below' ? 'Below range' : null;
        const meta = [shortDate(r.date) ?? 'Date not clear on report', GROUP_NOUN[group]].join(' · ');
        return (
          <React.Fragment key={r.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => onPress(r)}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}, ${withUnit(r.value, r.unit)}, ${meta}${r.referenceRange ? `, reported range ${r.referenceRange}` : ''}${marker ? `, ${marker}` : ''}`}
              testID={`result-row-${r.id}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, opacity: pressed ? 0.7 : 1 })}
            >
              <GroupIcon group={group} />
              {isText ? (
                // Written results: name and date on their own lines, the finding below (two lines at most).
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>{meta}</Text>
                  <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} numberOfLines={2} testID={`result-value-${r.id}`}>
                    {withUnit(r.value, r.unit)}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={2}>{r.name}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>{meta}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '45%' }}>
                    <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, textAlign: 'right' }]} numberOfLines={1} testID={`result-value-${r.id}`}>
                      {withUnit(r.value, r.unit)}
                    </Text>
                    {r.referenceRange ? (
                      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, textAlign: 'right' }]} numberOfLines={1}>Range {r.referenceRange}</Text>
                    ) : null}
                    {marker ? <Text style={[theme.typography.labelSmall, { color: theme.colors.warning }]}>{marker}</Text> : null}
                  </View>
                </>
              )}
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// --------------------------------------------------------- review card --

/** Shown only when reports actually need review (or couldn't be read). */
export function ReviewCard({ needsReview, couldNotRead, identityHint, onPress }: { needsReview: number; couldNotRead: number; identityHint: boolean; onPress: () => void }) {
  const theme = useTheme();
  if (needsReview === 0 && couldNotRead === 0) return null;
  const title = needsReview
    ? `${needsReview} ${needsReview === 1 ? 'report needs' : 'reports need'} your review`
    : `${couldNotRead} ${couldNotRead === 1 ? 'report' : 'reports'} couldn’t be read`;
  const lines = [
    needsReview
      ? `Results were found but are held until confirmed.${identityHint ? ' Adding your name and date of birth helps us recognise your reports.' : ''}`
      : null,
    needsReview && couldNotRead ? `${couldNotRead} more ${couldNotRead === 1 ? 'report' : 'reports'} couldn’t be read.` : null,
    !needsReview && couldNotRead ? 'Open it to see why, or try a clearer photo or the original PDF.' : null,
  ].filter((l): l is string => Boolean(l));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${lines.join(' ')}`}
      testID="home-review-card"
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.spacing.sm,
        alignItems: 'center',
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.warningSubtle,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="document-text-outline" size={26} color={theme.colors.warning} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.warning }]}>{title}</Text>
        {lines.map((l) => (
          <Text key={l} style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{l}</Text>
        ))}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.warning} />
    </Pressable>
  );
}

// -------------------------------------------------------- recent docs --

export function DocumentRows({ documents, onPress }: { documents: StoredDocument[]; onPress: (d: StoredDocument) => void }) {
  const theme = useTheme();
  return (
    <View style={{ borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
      {documents.map((d, i) => {
        const status = presentDocumentStatus(d);
        const tone = status.tone === 'success' ? [theme.colors.successSubtle, theme.colors.success] : status.tone === 'warning' ? [theme.colors.warningSubtle, theme.colors.warning] : [theme.colors.surfaceAlt, theme.colors.textSecondary];
        const date = shortDate(d.uploadedAt ?? d.createdAt);
        return (
          <React.Fragment key={d.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => onPress(d)}
              accessibilityRole="button"
              accessibilityLabel={`${d.originalFilename}, ${date}, ${status.label}`}
              testID={`stored-document-${d.id}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 36, height: 44, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }}>
                <Ionicons name="document-text-outline" size={18} color={theme.colors.textTertiary} />
              </View>
              <View style={{ flex: 1, gap: 3, alignItems: 'flex-start' }}>
                <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={1}>{d.originalFilename}</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{[date, formatFileSize(d.fileSizeBytes)].filter(Boolean).join(' · ')}</Text>
                <View style={{ paddingHorizontal: theme.spacing.xs, paddingVertical: 2, borderRadius: theme.radius.pill, backgroundColor: tone[0] }}>
                  <Text style={[theme.typography.labelSmall, { color: tone[1] }]}>{status.label}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ------------------------------------------------ "What changed?" cards --

function CardShell({ children, onPress, label, testID }: { children: React.ReactNode; onPress: () => void; label: string; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => ({
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function CardTitle({ group, name, sub, badge }: { group: ResultGroup; name: string; sub: string; badge: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <GroupIcon group={group} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={2}>{name}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{sub}</Text>
      </View>
      {badge}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </View>
  );
}

function BeforeAfter({ before, beforeDate, after, afterDate, clamp }: { before: string; beforeDate: string; after: string; afterDate: string; clamp?: boolean }) {
  const theme = useTheme();
  const value = [clamp ? theme.typography.bodyMedium : theme.typography.headingSmall, { color: theme.colors.textPrimary }];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Text style={value} numberOfLines={clamp ? 3 : 1}>{before}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{beforeDate}</Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={theme.colors.textTertiary} />
      <View style={{ flex: 1 }}>
        <Text style={value} numberOfLines={clamp ? 3 : 1}>{after}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{afterDate}</Text>
      </View>
    </View>
  );
}

export function ComparisonCard({ c, onPress }: { c: NumericComparison; onPress: () => void }) {
  const theme = useTheme();
  const badge =
    c.percentChange !== null && c.direction !== 'same' ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: theme.spacing.xs, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.warningSubtle }} testID={`change-badge-${c.key}`}>
        <Ionicons name={c.direction === 'up' ? 'arrow-up' : 'arrow-down'} size={14} color={theme.colors.warning} />
        <Text style={[theme.typography.labelMedium, { color: theme.colors.warning }]}>{formatPercent(c.percentChange)}</Text>
      </View>
    ) : c.direction === 'same' ? (
      <View style={{ paddingHorizontal: theme.spacing.xs, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.successSubtle }}>
        <Text style={[theme.typography.labelMedium, { color: theme.colors.success }]}>No change</Text>
      </View>
    ) : null;
  return (
    <CardShell
      onPress={onPress}
      label={`${c.name}, ${c.points.length} results. ${withUnit(c.previous.valueText, c.unit)} on ${shortDate(c.previous.date)}, then ${withUnit(c.latest.valueText, c.unit)} on ${shortDate(c.latest.date)}. ${c.summary}${c.rangeNote ? ` ${c.rangeNote}` : ''}`}
      testID={`comparison-${c.key}`}
    >
      <CardTitle group={c.group} name={c.name} sub={`${c.points.length} results · ${GROUP_NOUN[c.group]}`} badge={badge} />
      <BeforeAfter
        before={withUnit(c.previous.valueText, c.unit)}
        beforeDate={shortDate(c.previous.date) ?? ''}
        after={withUnit(c.latest.valueText, c.unit)}
        afterDate={shortDate(c.latest.date) ?? ''}
      />
      <Sparkline values={c.points.map((p) => p.value)} height={64} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{shortDate(c.points[0].date)}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{shortDate(c.latest.date)}</Text>
      </View>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
        {c.summary}
        {c.rangeNote ? ` ${c.rangeNote}` : ''}
      </Text>
    </CardShell>
  );
}

/** A written finding on two or more dated reports: as written, side by side — never a trend. */
export function FindingCard({ f, onPress }: { f: FindingHistory; onPress: () => void }) {
  const theme = useTheme();
  const previous = f.entries[f.entries.length - 2];
  const latest = f.entries[f.entries.length - 1];
  const same = previous.text.trim().toLowerCase() === latest.text.trim().toLowerCase();
  const badge = same ? (
    <View style={{ paddingHorizontal: theme.spacing.xs, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.successSubtle }}>
      <Text style={[theme.typography.labelMedium, { color: theme.colors.success }]}>Same wording</Text>
    </View>
  ) : null;
  return (
    <CardShell
      onPress={onPress}
      label={`${f.name}, ${f.entries.length} reports. ${shortDate(previous.date)}: ${previous.text}. ${shortDate(latest.date)}: ${latest.text}.`}
      testID={`finding-${f.key}`}
    >
      <CardTitle group={f.group} name={f.name} sub={`${f.entries.length} reports · ${GROUP_LABEL[f.group]}`} badge={badge} />
      <BeforeAfter before={previous.text} beforeDate={shortDate(previous.date) ?? ''} after={latest.text} afterDate={shortDate(latest.date) ?? ''} clamp />
      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>As written on each report. Written findings are shown side by side, not scored.</Text>
    </CardShell>
  );
}
