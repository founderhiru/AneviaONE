import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BRAND } from '../../config/brand';
import { radius } from '../../design/radius';
import { spacing } from '../../design/spacing';
import { typography } from '../../design/typography';
import { openAuth } from '../../navigation/authRoutes';
import { AuthButton } from '../AuthButton';
import { BrandMark } from '../BrandMark';

/**
 * Explore palette: the Welcome screen's emerald and gold carried onto cream
 * surfaces, so the sample experience reads as part of the same product.
 * Like Welcome, Explore keeps one look regardless of the system theme.
 */
export const EXPLORE = {
  field: '#07291F',
  deep: '#0B3D2C',
  emerald: '#1F6B4F',
  mint: '#7FE3C0',
  gold: '#F1E3B0',
  goldInk: '#8C6D24',
  amberInk: '#9A5F1A',
  cream: '#FBF8EF',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EFE3',
  border: '#E6E0D0',
  ink: '#14231D',
  ink2: '#3E4C46',
  ink3: '#6B7872',
  onDark: '#F6F9F4',
  onDarkMuted: 'rgba(246, 249, 244, 0.78)',
} as const;

/** Small pill marking content as sample data. */
export function SampleBadge({ label = 'Sample data', tone = 'light' }: { label?: string; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <View
      style={[styles.badge, dark ? styles.badgeDark : styles.badgeLight]}
      accessibilityLabel={`${label}. Fictional records for illustration.`}
      testID="sample-badge"
    >
      <View style={[styles.badgeDot, { backgroundColor: dark ? EXPLORE.gold : EXPLORE.goldInk }]} />
      <Text style={[styles.badgeText, { color: dark ? EXPLORE.gold : EXPLORE.goldInk }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** The disclaimer every Explore screen carries. */
export function SampleNotice({ children }: { children?: React.ReactNode }) {
  return (
    <Text style={styles.notice} testID="sample-notice">
      {children ??
        'Fictional sample records for illustration only. Not real patient data and not medical advice.'}
    </Text>
  );
}

/** Shared frame for Explore screens: back, title, sample badge, scroll. */
export function ExploreScreen({
  title,
  eyebrow,
  intro,
  children,
  testID,
}: {
  title: string;
  /** Small label above the title (e.g. "Demo health history"). */
  eyebrow?: string;
  intro?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const backIcon = Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back';
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen} testID={testID}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={styles.back}
          testID="explore-back"
        >
          <Ionicons name={backIcon} size={24} color={EXPLORE.ink} />
        </Pressable>
        <SampleBadge label={eyebrow ?? 'Sample data'} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {intro ? <Text style={styles.intro}>{intro}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A soft emerald field with one faint sweep of gold light, for dark panels. */
export function EmeraldField({ id }: { id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 360 360" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <RadialGradient id={`${id}Field`} cx="50%" cy="20%" rx="90%" ry="90%">
          <Stop offset="0" stopColor="#11523F" />
          <Stop offset="0.55" stopColor="#0A382B" />
          <Stop offset="1" stopColor="#051F17" />
        </RadialGradient>
        <LinearGradient id={`${id}Sweep`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={EXPLORE.gold} stopOpacity={0.5} />
          <Stop offset="0.6" stopColor={EXPLORE.mint} stopOpacity={0.2} />
          <Stop offset="1" stopColor={EXPLORE.mint} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="360" height="360" fill={`url(#${id}Field)`} />
      <Path d="M -20 70 C 60 130 170 130 380 30" stroke={`url(#${id}Sweep)`} strokeWidth={1.2} fill="none" />
      <Path d="M -20 86 C 70 140 180 138 380 50" stroke={`url(#${id}Sweep)`} strokeWidth={0.7} fill="none" />
    </Svg>
  );
}

/**
 * "Make it yours" — the hand-off from the sample to a person's own Health
 * Memory. Get started opens the one sign-in screen (openAuth); this panel
 * never carries a sign-in form of its own.
 */
export function MakeItYours({ id = 'makeItYours' }: { id?: string }) {
  return (
    <View style={styles.panel} testID="make-it-yours">
      <EmeraldField id={id} />
      <View style={styles.panelBody}>
        <BrandMark size={64} id={`${id}Mark`} />
        <Text style={styles.panelTitle} accessibilityRole="header">
          Make it yours
        </Text>
        <Text style={styles.panelCopy}>{`Bring your own health history into ${BRAND.wordmark}.`}</Text>
        <View style={styles.panelActions}>
          <AuthButton
            variant="primary"
            label="Get started"
            onPress={() => openAuth()}
            accessibilityHint="Opens sign-in. Log in or sign up with your mobile number, Google or email."
            testID={`${id}-get-started`}
          />
        </View>
      </View>
    </View>
  );
}

/** A minimal trend line of sample readings — shape only, no axes or targets. */
export function Sparkline({ values, color, width = 120, height = 40 }: { values: number[]; color: string; width?: number; height?: number }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const points = values.map((v, i) => ({
    x: pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1),
    // A flat series sits in the middle rather than on the floor.
    y: max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2),
  }));
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} stroke={color} strokeOpacity={0.9} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={last.x} cy={last.y} r={3.5} fill={color} />
    </Svg>
  );
}

export const exploreStyles = StyleSheet.create({
  card: {
    backgroundColor: EXPLORE.surface,
    borderColor: EXPLORE.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  sectionLabel: { ...typography.labelSmall, color: EXPLORE.ink3, letterSpacing: 1.6, textTransform: 'uppercase' },
  cardTitle: { ...typography.headingSmall, color: EXPLORE.ink },
  body: { ...typography.bodyMedium, color: EXPLORE.ink2 },
  meta: { ...typography.bodySmall, color: EXPLORE.ink3 },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: EXPLORE.surfaceAlt,
  },
  chipText: { ...typography.labelSmall, color: EXPLORE.ink2 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EXPLORE.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxs,
  },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.huge },
  title: { ...typography.displayMedium, color: EXPLORE.ink },
  intro: { ...typography.bodyLarge, color: EXPLORE.ink2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeLight: { backgroundColor: '#FBF3DC', borderColor: '#EADBB0' },
  badgeDark: { backgroundColor: 'rgba(241, 227, 176, 0.08)', borderColor: 'rgba(241, 227, 176, 0.35)' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { ...typography.labelSmall, letterSpacing: 1.4 },
  notice: { ...typography.caption, color: EXPLORE.ink3, textAlign: 'center' },
  panel: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: EXPLORE.field },
  panelBody: { padding: spacing.xl, alignItems: 'center', gap: spacing.xs },
  panelTitle: { ...typography.headingLarge, color: EXPLORE.onDark, marginTop: spacing.xxs },
  panelCopy: { ...typography.bodyMedium, color: EXPLORE.onDarkMuted, textAlign: 'center' },
  panelActions: { alignSelf: 'stretch', marginTop: spacing.md },
});
