import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { EmeraldField, EXPLORE, ExploreScreen, exploreStyles, SampleNotice } from '../../components/explore/ExploreUI';
import { BRAND, PRODUCT_TERMS } from '../../config/brand';
import { sampleSummary } from '../../content/exploreSample';
import { radius } from '../../design/radius';
import { spacing } from '../../design/spacing';
import { typography } from '../../design/typography';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const summary = sampleSummary();

const DESTINATIONS: { title: string; description: string; icon: IconName; href: Href; preview?: boolean; testID: string }[] = [
  {
    title: PRODUCT_TERMS.healthMemory,
    description: 'Records connected into one history',
    icon: 'library-outline',
    href: '/explore/memory',
    testID: 'explore-open-memory',
  },
  {
    title: PRODUCT_TERMS.whatChanged,
    description: 'How results moved between records',
    icon: 'pulse-outline',
    href: '/explore/changes',
    testID: 'explore-open-changes',
  },
  {
    title: PRODUCT_TERMS.healthTimeline,
    description: `${summary.years} years of records, in order`,
    icon: 'time-outline',
    href: '/explore/timeline',
    testID: 'explore-open-timeline',
  },
  {
    title: PRODUCT_TERMS.askMyHealth,
    description: 'The questions it is being built to answer',
    icon: 'chatbubble-ellipses-outline',
    href: '/explore/ask',
    preview: true,
    testID: 'explore-open-ask',
  },
];

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Demo Home: the entry to the sample experience. */
export default function ExploreHomeScreen() {
  return (
    <ExploreScreen
      eyebrow="Sample health history"
      title="Your health, connected over time."
      intro={`See how ${BRAND.wordmark} turns scattered health records into a connected health history.`}
      testID="explore-home"
    >
      <View style={styles.summary}>
        <EmeraldField id="exploreSummary" />
        <Text style={styles.summaryLabel}>A sample health history</Text>
        <View style={styles.stats}>
          <Stat value={summary.records} label="Records" />
          <View style={styles.divider} />
          <Stat value={summary.areas} label="Health Areas" />
          <View style={styles.divider} />
          <Stat value={summary.years} label="Years" />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        {DESTINATIONS.map((d) => (
          <Pressable
            key={d.testID}
            onPress={() => router.push(d.href)}
            accessibilityRole="button"
            accessibilityLabel={`${d.title}${d.preview ? ', preview' : ''}. ${d.description}`}
            testID={d.testID}
            style={({ pressed }) => [exploreStyles.card, styles.destination, { opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={styles.icon}>
              <Ionicons name={d.icon} size={20} color={EXPLORE.emerald} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.titleRow}>
                <Text style={exploreStyles.cardTitle}>{d.title}</Text>
                {d.preview ? (
                  <View style={exploreStyles.chip}>
                    <Text style={exploreStyles.chipText}>Preview</Text>
                  </View>
                ) : null}
              </View>
              <Text style={exploreStyles.meta}>{d.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={EXPLORE.ink3} />
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => router.push('/explore/make-it-yours')}
        accessibilityRole="button"
        accessibilityLabel="Make it yours"
        accessibilityHint="Sign in to bring your own health history"
        testID="explore-make-it-yours"
        style={({ pressed }) => [styles.makeItYours, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={styles.makeItYoursText}>Make it yours</Text>
        <Ionicons name="arrow-forward" size={16} color={EXPLORE.emerald} />
      </Pressable>
      <SampleNotice />
    </ExploreScreen>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: radius.xl, overflow: 'hidden', padding: spacing.lg, gap: spacing.md, backgroundColor: EXPLORE.field },
  summaryLabel: { ...typography.labelSmall, color: EXPLORE.gold, letterSpacing: 1.6, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 34, lineHeight: 40, fontWeight: '600', color: EXPLORE.onDark },
  statLabel: { ...typography.labelMedium, color: EXPLORE.onDarkMuted },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(246, 249, 244, 0.25)' },
  destination: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 72 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E6F2EC',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  makeItYours: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 },
  makeItYoursText: { ...typography.labelLarge, color: EXPLORE.emerald },
});
