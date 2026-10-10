import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FOREST } from '../../design/brandSurface';
import { useTheme } from '../../design/theme';
import { formatFileSize, presentDocumentStatus } from '../../services/documents/documentsService';
import type { DashboardSummary, HealthSignal } from '../../services/health/homeDashboard';
import { SIGNAL_COPY, areaOf, describeChange, reportFlag, resultPosition, shortDate } from '../../services/health/homeDashboard';
import type { HealthChange, HealthEvent, RecordedObservation, StoredDocument } from '../../types';
import { ITEM_TITLES } from '../HealthChangeCard';
import { uploadedLabel } from '../StoredDocumentCard';

/**
 * Home dashboard pieces: slim rows on quiet grouped surfaces rather than a
 * stack of cards. Presentation only — every figure, result and signal
 * arrives already derived (services/health/homeDashboard.ts).
 */

const withUnit = (value: string, unit: string | null | undefined) => (unit ? `${value} ${unit}` : value);

/** "06 Oct" — the year is on the timeline line beside it. */
const dayMonth = (iso: string | null | undefined) => shortDate(iso)?.slice(0, 6) ?? null;

/** A quiet uppercase section label with an optional action on the right. */
export function HomeSection({
  title,
  actionLabel,
  onActionPress,
  children,
  testID,
}: {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  children: React.ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 24 }}>
        <Text style={[theme.typography.headingSmall, { flex: 1, color: theme.colors.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        {actionLabel ? (
          <Pressable onPress={onActionPress} accessibilityRole="button" hitSlop={10}>
            <Text style={[theme.typography.labelMedium, { color: theme.colors.accent }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** One rounded surface holding hairline-separated rows. */
function Group({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const theme = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      testID={testID}
      style={{ borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' }}
    >
      {rows.map((row, i) => (
        <View key={i} style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** A tappable row inside a Group. */
function Row({
  onPress,
  accessibilityLabel,
  testID,
  style,
  children,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const base: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm };
  if (!onPress) {
    return (
      <View style={[base, style]} testID={testID} accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [base, style, { opacity: pressed ? 0.75 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

// ------------------------------------------------------------- summary --

type Stat = { key: string; value: string; label: string; onPress?: () => void };

const count = (n: number, one: string, many: string): Pick<Stat, 'value' | 'label'> => ({ value: String(n), label: n === 1 ? one : many });

/** Reports | Results | Medications — one slim forest row. (No "Areas" figure:
 * a count of health areas was ambiguous, so Home doesn't show one.) */
export function HealthAtAGlance({
  summary,
  onReports,
  onResults,
  onMedications,
}: {
  summary: DashboardSummary;
  onReports: () => void;
  onResults: () => void;
  onMedications: () => void;
}) {
  const theme = useTheme();
  const stats: Stat[] = [
    { key: 'reports', ...count(summary.reportCount, 'Report', 'Reports'), onPress: onReports },
    { key: 'results', ...count(summary.resultCount, 'Result', 'Results'), onPress: onResults },
    { key: 'medications', ...count(summary.medicationCount, 'Medication', 'Medications'), onPress: onMedications },
  ];
  return (
    <View
      testID="home-glance"
      style={{ backgroundColor: FOREST.field, borderRadius: theme.radius.lg, paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xxs }}
    >
      <View style={{ flexDirection: 'row' }}>
        {stats.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 ? <View style={{ width: 1, marginVertical: 4, backgroundColor: FOREST.hairline, opacity: 0.45 }} /> : null}
            <Pressable
              onPress={s.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${s.value === '—' ? 'Not yet known' : s.value} ${s.label}`}
              testID={`glance-${s.key}`}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', opacity: pressed ? 0.75 : 1 })}
            >
              <Text style={[theme.typography.headingMedium, { color: FOREST.text }]}>{s.value}</Text>
              <Text style={[theme.typography.caption, { color: FOREST.textMuted }]} numberOfLines={1}>
                {s.label}
              </Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------- attention --

/** Up to three compact signal rows, then one shared professional-follow-up line. */
export function AttentionList({ signals, onPressSignal }: { signals: HealthSignal[]; onPressSignal: (s: HealthSignal) => void }) {
  const theme = useTheme();
  return (
    <>
      <Group>
        {signals.map((s) => {
          const tone = s.kind === 'critical' ? theme.colors.danger : theme.colors.warning;
          // "Outside" is fully said by its headline; other kinds add their evidence.
          const extra = s.kind === 'outside' ? null : s.detail;
          return (
            <Row
              key={s.id}
              onPress={() => onPressSignal(s)}
              accessibilityLabel={`${s.name} ${withUnit(s.value, s.unit)}. ${s.headline}.${s.referenceRange ? ` Reported range ${s.referenceRange}.` : ''}${extra ? ` ${extra}` : ''}`}
              testID={`signal-${s.id}`}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone, marginTop: 7 }} />
              <View style={{ flex: 1, gap: 1 }}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Text style={[theme.typography.labelLarge, { flex: 1, color: theme.colors.textPrimary }]}>{s.name}</Text>
                  <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{withUnit(s.value, s.unit)}</Text>
                </View>
                <Text style={[theme.typography.labelSmall, { color: tone }]}>{s.headline}</Text>
                {s.referenceRange ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Reported range: {s.referenceRange}</Text>
                ) : null}
                {extra ? <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{extra}</Text> : null}
              </View>
            </Row>
          );
        })}
      </Group>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} testID="home-signals-advice">
        {SIGNAL_COPY.discussAll}
      </Text>
    </>
  );
}

// -------------------------------------------------------------- snapshot --

export function SnapshotList({ items, onPressResult }: { items: RecordedObservation[]; onPressResult: (r: RecordedObservation) => void }) {
  const theme = useTheme();
  return (
    <Group>
      {items.map((r) => {
        const position = resultPosition(r);
        const marker = position === 'above' ? 'Above range' : position === 'below' ? 'Below range' : reportFlag(r) ? 'Flagged on report' : null;
        const meta = [shortDate(r.date) ?? 'Date not clear on report', areaOf(r)].filter(Boolean).join(' · ');
        return (
          <Row
            key={r.id}
            onPress={() => onPressResult(r)}
            accessibilityLabel={`${r.name} ${withUnit(r.value, r.unit)}, ${meta}${r.referenceRange ? `, reported range ${r.referenceRange}` : ''}${marker ? `, ${marker}` : ''}`}
            testID={`snapshot-${r.id}`}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{r.name}</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{meta}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 1, maxWidth: '50%' }}>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, textAlign: 'right' }]}>{withUnit(r.value, r.unit)}</Text>
              {r.referenceRange ? (
                <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, textAlign: 'right' }]}>Range {r.referenceRange}</Text>
              ) : null}
              {marker ? <Text style={[theme.typography.labelSmall, { color: theme.colors.warning }]}>{marker}</Text> : null}
            </View>
          </Row>
        );
      })}
    </Group>
  );
}

// -------------------------------------------------------------- timeline --

export function TimelineRow({ years, latest, onPress }: { years: string[]; latest: HealthEvent | null; onPress: () => void }) {
  const theme = useTheme();
  const span = years.length > 1 ? `${years[0]} – ${years[years.length - 1]}` : years[0];
  const line = latest ? ['Latest:', [dayMonth(latest.date), latest.title, latest.summary].filter(Boolean).join(' · ')].join(' ') : null;
  return (
    <Group>
      <Row onPress={onPress} accessibilityLabel="Open your Health Timeline" testID="home-timeline-row" style={{ alignItems: 'center' }}>
        <Ionicons name="time-outline" size={18} color={theme.colors.accent} />
        <View style={{ flex: 1, gap: 1 }}>
          {span ? <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{span}</Text> : null}
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} numberOfLines={2} testID="home-latest-activity">
            {line ?? 'Your timeline appears once a report has been read.'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </Row>
    </Group>
  );
}

// ---------------------------------------------------------- what changed --

export const GETTING_STARTED = 'Your history is just getting started. Add another report to see changes over time.';

export function ChangeRow({ change, onViewTrend }: { change: HealthChange | null; onViewTrend?: () => void }) {
  const theme = useTheme();
  if (!change) {
    return (
      <Group testID="home-getting-started">
        <Row style={{ alignItems: 'center' }}>
          <Ionicons name="git-compare-outline" size={18} color={theme.colors.accent} />
          <Text style={[theme.typography.bodySmall, { flex: 1, color: theme.colors.textSecondary }]}>{GETTING_STARTED}</Text>
        </Row>
      </Group>
    );
  }
  const isValue = change.type === 'value_change';
  const description = describeChange(change);
  return (
    <Group testID="home-change">
      <Row style={{ alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>
            {isValue ? change.metricOrItemName : ITEM_TITLES[change.type as keyof typeof ITEM_TITLES]}
          </Text>
          {isValue ? (
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>
              <Text style={{ color: theme.colors.textTertiary }}>{change.previousValue}</Text>
              {' → '}
              {change.currentValue}
              {change.unit ? <Text style={{ color: theme.colors.textTertiary }}> {change.unit}</Text> : null}
            </Text>
          ) : (
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{change.metricOrItemName}</Text>
          )}
          {description ? <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{description}</Text> : null}
        </View>
        {isValue && onViewTrend ? (
          <Pressable onPress={onViewTrend} accessibilityRole="button" hitSlop={8} testID="home-view-trend">
            <Text style={[theme.typography.labelMedium, { color: theme.colors.brandPrimary }]}>View trend →</Text>
          </Pressable>
        ) : null}
      </Row>
    </Group>
  );
}

// ------------------------------------------------------------------- ask --

export function AskRow({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID="home-ask"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        minHeight: 48,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceAlt,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="sparkles-outline" size={16} color={theme.colors.accent} />
      <Text style={[theme.typography.bodyMedium, { flex: 1, color: theme.colors.textPrimary }]}>Ask about your health records</Text>
      <Ionicons name="arrow-forward" size={16} color={theme.colors.brandPrimary} />
    </Pressable>
  );
}

// ---------------------------------------------------------- recent reports --

export function ReportRows({ documents, onPressDocument }: { documents: StoredDocument[]; onPressDocument: (d: StoredDocument) => void }) {
  const theme = useTheme();
  const tones = { neutral: theme.colors.textTertiary, success: theme.colors.success, warning: theme.colors.warning, danger: theme.colors.danger, accent: theme.colors.accent };
  return (
    <Group>
      {documents.map((d) => {
        const status = presentDocumentStatus(d);
        const when = uploadedLabel(d.uploadedAt ?? d.createdAt);
        return (
          <Row
            key={d.id}
            onPress={() => onPressDocument(d)}
            accessibilityLabel={`${d.originalFilename}, ${when}, ${status.label}`}
            testID={`stored-document-${d.id}`}
            style={{ alignItems: 'center' }}
          >
            <Ionicons name={d.source === 'camera' ? 'camera-outline' : 'document-text-outline'} size={18} color={theme.colors.brandPrimary} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {d.originalFilename}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                {when} · {formatFileSize(d.fileSizeBytes)}
              </Text>
              {/* Its own line, so the status is never cut off on a narrow screen. */}
              <Text style={[theme.typography.labelSmall, { color: tones[status.tone] }]} numberOfLines={1}>
                {status.label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
          </Row>
        );
      })}
    </Group>
  );
}
