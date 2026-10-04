import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EXPLORE, ExploreScreen, exploreStyles, MakeItYours, SampleNotice } from '../../components/explore/ExploreUI';
import { formatSampleDate, sampleArea, sampleTimeline } from '../../content/exploreSample';
import { spacing } from '../../design/spacing';
import { typography } from '../../design/typography';

const YEARS = sampleTimeline();

/** Every sample record in order, grouped by year. */
export default function ExploreTimelineScreen() {
  return (
    <ExploreScreen
      eyebrow="Demo health history"
      title="Your health has a history."
      intro="Every record in the sample, in the order it happened."
      testID="explore-timeline"
    >
      {YEARS.map(({ year, records }) => (
        <View key={year} style={{ gap: spacing.sm }} testID={`timeline-year-${year}`}>
          <Text style={styles.year} accessibilityRole="header">
            {year}
          </Text>
          <View>
            {records.map((record, i) => (
              <View key={record.id} style={styles.row}>
                <View style={styles.rail}>
                  <View style={styles.dot} />
                  {i < records.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.entry}>
                  <Text style={exploreStyles.meta}>{formatSampleDate(record.date)}</Text>
                  <Text style={styles.title}>{record.title}</Text>
                  <Text style={exploreStyles.body}>{record.summary}</Text>
                  <View style={styles.chips}>
                    {record.areas.map((id) => (
                      <View key={id} style={exploreStyles.chip}>
                        <Text style={exploreStyles.chipText}>{sampleArea(id).label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      <MakeItYours id="exploreTimelineCta" />
      <SampleNotice />
    </ExploreScreen>
  );
}

const styles = StyleSheet.create({
  year: { ...typography.headingMedium, color: EXPLORE.emerald },
  row: { flexDirection: 'row' },
  rail: { width: 20, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5, backgroundColor: EXPLORE.gold, borderWidth: 2, borderColor: EXPLORE.goldInk },
  line: { width: 1.5, flex: 1, marginTop: 4, backgroundColor: EXPLORE.border },
  entry: { flex: 1, gap: 2, paddingLeft: spacing.sm, paddingBottom: spacing.lg },
  title: { ...typography.labelLarge, color: EXPLORE.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xxs },
});
