import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { EXPLORE, ExploreScreen, exploreStyles, MakeItYours, SampleNotice } from '../../components/explore/ExploreUI';
import { PRODUCT_TERMS } from '../../config/brand';
import {
  formatSampleDate,
  recordsInArea,
  SAMPLE_AREAS,
  SAMPLE_RECORDS,
  sampleConnections,
  sampleMarker,
  type SampleRecord,
} from '../../content/exploreSample';
import { spacing } from '../../design/spacing';
import { typography } from '../../design/typography';

const RECENT = SAMPLE_RECORDS.slice(0, 4);

function ConnectedRecord({ record, isLast }: { record: SampleRecord; isLast: boolean }) {
  const connections = sampleConnections(record.id);
  const markers = record.markerIds.map((id) => sampleMarker(id)?.name).filter(Boolean) as string[];
  return (
    <View style={styles.row} testID={`memory-record-${record.id}`}>
      <View style={styles.rail}>
        <View style={styles.node} />
        {!isLast ? <View style={styles.line} /> : null}
      </View>
      <View style={[exploreStyles.card, styles.recordCard]}>
        <Text style={exploreStyles.cardTitle}>{record.title}</Text>
        <Text style={exploreStyles.meta}>
          {formatSampleDate(record.date)} · {record.provider}
        </Text>
        <View style={styles.chips}>
          {(markers.length ? markers : [record.summary]).map((label) => (
            <View key={label} style={exploreStyles.chip}>
              <Text style={exploreStyles.chipText}>{label}</Text>
            </View>
          ))}
        </View>
        {connections.length ? (
          <View style={styles.connections}>
            {connections.map(({ record: linked, via }) => (
              <View key={linked.id} style={styles.connection}>
                <Ionicons name="git-commit-outline" size={14} color={EXPLORE.emerald} style={{ marginTop: 2 }} />
                <Text style={styles.connectionText}>
                  <Text style={styles.connectionVia}>{via}</Text>
                  {via === 'Follow-up' ? ' to ' : ' compared with '}
                  {linked.title}, {formatSampleDate(linked.date)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function OnwardLink({ label, href, testID }: { label: string; href: Href; testID: string }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [styles.onward, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.onwardText}>{label}</Text>
      <Ionicons name="arrow-forward" size={16} color={EXPLORE.emerald} />
    </Pressable>
  );
}

/** Sample records joined into one history, by the areas and markers they share. */
export default function ExploreMemoryScreen() {
  return (
    <ExploreScreen
      eyebrow="Demo health history"
      title={PRODUCT_TERMS.healthMemory}
      intro="Every record becomes part of one connected history — linked by what it measures, not filed away as a PDF."
      testID="explore-memory"
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={exploreStyles.sectionLabel}>Health areas</Text>
        <View style={styles.areas}>
          {SAMPLE_AREAS.map((area) => (
            <View key={area.id} style={[exploreStyles.card, styles.area]}>
              <Text style={exploreStyles.cardTitle}>{area.label}</Text>
              <Text style={exploreStyles.meta}>{recordsInArea(area.id)} records</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={exploreStyles.sectionLabel}>Recent records, connected</Text>
        <View>
          {RECENT.map((record, i) => (
            <ConnectedRecord key={record.id} record={record} isLast={i === RECENT.length - 1} />
          ))}
        </View>
        <OnwardLink label={`See ${PRODUCT_TERMS.whatChanged}`} href="/explore/changes" testID="memory-to-changes" />
        <OnwardLink label={`See the full ${PRODUCT_TERMS.healthTimeline}`} href="/explore/timeline" testID="memory-to-timeline" />
      </View>

      <MakeItYours id="exploreMemoryCta" />
      <SampleNotice />
    </ExploreScreen>
  );
}

const styles = StyleSheet.create({
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  area: { flexBasis: '47%', flexGrow: 1, gap: 2 },
  row: { flexDirection: 'row' },
  rail: { width: 24, alignItems: 'center' },
  node: { width: 10, height: 10, borderRadius: 5, marginTop: 20, backgroundColor: EXPLORE.emerald, borderWidth: 2, borderColor: '#CFE6DA' },
  line: { width: 2, flex: 1, marginTop: 4, backgroundColor: '#CFE6DA' },
  recordCard: { flex: 1, gap: spacing.xxs, marginBottom: spacing.sm, marginLeft: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xxs },
  connections: { gap: 6, marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: EXPLORE.border },
  connection: { flexDirection: 'row', gap: 6 },
  connectionText: { ...typography.bodySmall, color: EXPLORE.ink2, flex: 1 },
  connectionVia: { fontWeight: '600', color: EXPLORE.emerald },
  onward: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  onwardText: { ...typography.labelLarge, color: EXPLORE.emerald },
});
