import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EXPLORE, ExploreScreen, exploreStyles, MakeItYours, SampleNotice, Sparkline } from '../../components/explore/ExploreUI';
import { PRODUCT_TERMS } from '../../config/brand';
import { formatSampleDate, latestChange, SAMPLE_MARKERS, sampleArea, type SampleChangeLabel, type SampleMarker } from '../../content/exploreSample';
import { radius } from '../../design/radius';
import { spacing } from '../../design/spacing';
import { typography } from '../../design/typography';

// Label meaning is carried by the word; colour only supports it.
const LABEL_TONE: Record<SampleChangeLabel, { fg: string; bg: string }> = {
  Improved: { fg: EXPLORE.emerald, bg: '#E6F2EC' },
  Stable: { fg: EXPLORE.ink2, bg: EXPLORE.surfaceAlt },
  Changed: { fg: EXPLORE.amberInk, bg: '#F8EBD8' },
};

function ChangeCard({ marker }: { marker: SampleMarker }) {
  const { previous, latest } = latestChange(marker);
  const tone = LABEL_TONE[marker.change];
  return (
    <View
      style={[exploreStyles.card, styles.card]}
      testID={`change-${marker.id}`}
      accessible
      accessibilityLabel={`${marker.name}, ${marker.change}. ${previous.value} to ${latest.value} ${marker.unit}, sample values.`}
    >
      <View style={styles.top}>
        <View style={{ gap: 2 }}>
          <Text style={styles.name}>{marker.name}</Text>
          <Text style={exploreStyles.meta}>{sampleArea(marker.area).label}</Text>
        </View>
        <View style={[styles.label, { backgroundColor: tone.bg }]}>
          <Text style={[styles.labelText, { color: tone.fg }]}>{marker.change}</Text>
        </View>
      </View>
      <View style={styles.bottom}>
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={styles.values}>
            <Text style={{ color: EXPLORE.ink3 }}>{previous.value}</Text>
            <Text style={{ color: EXPLORE.ink3 }}> → </Text>
            {latest.value}
            <Text style={styles.unit}> {marker.unit}</Text>
          </Text>
          <Text style={exploreStyles.meta}>
            {formatSampleDate(previous.date)} → {formatSampleDate(latest.date)}
          </Text>
          <Text style={exploreStyles.meta}>{marker.readings.length} readings in this history</Text>
        </View>
        <Sparkline values={marker.readings.map((r) => r.value)} color={tone.fg} />
      </View>
    </View>
  );
}

/** Sample markers compared across records — illustrative, never an assessment. */
export default function ExploreChangesScreen() {
  return (
    <ExploreScreen
      eyebrow="Demo health history"
      title={PRODUCT_TERMS.whatChanged}
      intro="Results from different records, lined up so you can see how they moved."
      testID="explore-changes"
    >
      <View style={{ gap: spacing.sm }}>
        {SAMPLE_MARKERS.map((marker) => (
          <ChangeCard key={marker.id} marker={marker} />
        ))}
      </View>

      <View style={styles.note} testID="changes-disclaimer">
        <Text style={styles.noteTitle}>Illustrative values only</Text>
        <Text style={exploreStyles.body}>
          These are invented sample results. The labels describe how the sample moved — they are not medical advice, a
          diagnosis, or a treatment recommendation. Always talk to your doctor about your own results.
        </Text>
      </View>

      <MakeItYours id="exploreChangesCta" />
      <SampleNotice />
    </ExploreScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { ...typography.headingMedium, color: EXPLORE.ink },
  label: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  labelText: { ...typography.labelMedium },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  values: { ...typography.headingSmall, color: EXPLORE.ink },
  unit: { ...typography.bodySmall, color: EXPLORE.ink3 },
  note: { gap: spacing.xxs, padding: spacing.md, borderRadius: radius.lg, backgroundColor: EXPLORE.surfaceAlt },
  noteTitle: { ...typography.labelLarge, color: EXPLORE.ink },
});
