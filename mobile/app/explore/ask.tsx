import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { EXPLORE, ExploreScreen, exploreStyles, MakeItYours, SampleNotice } from '../../components/explore/ExploreUI';
import { PRODUCT_TERMS } from '../../config/brand';
import { SAMPLE_QUESTIONS } from '../../content/exploreSample';
import { radius } from '../../design/radius';
import { spacing } from '../../design/spacing';
import { typography } from '../../design/typography';

/**
 * Ask My Health, previewed honestly: example questions only. Nothing here
 * calls an AI service or shows a generated answer.
 */
export default function ExploreAskScreen() {
  return (
    <ExploreScreen eyebrow="Preview" title={PRODUCT_TERMS.askMyHealth} intro="Ask questions about your health history." testID="explore-ask">
      <View style={styles.status} testID="ask-preview-status">
        <Ionicons name="hourglass-outline" size={18} color={EXPLORE.goldInk} />
        <Text style={[exploreStyles.body, { flex: 1 }]}>
          <Text style={{ fontWeight: '600', color: EXPLORE.ink }}>Not available in this preview. </Text>
          These are examples of the questions {PRODUCT_TERMS.askMyHealth} is being built to answer from your own records.
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={exploreStyles.sectionLabel}>Example questions</Text>
        {SAMPLE_QUESTIONS.map((question) => (
          <View key={question} style={[exploreStyles.card, styles.question]}>
            <Ionicons name="chatbubble-outline" size={18} color={EXPLORE.emerald} />
            <Text style={[styles.questionText]}>{question}</Text>
          </View>
        ))}
      </View>

      <View
        style={styles.input}
        accessible
        accessibilityLabel="Question box, not available in preview"
        accessibilityState={{ disabled: true }}
        testID="ask-preview-input"
      >
        <Text style={styles.inputText}>Ask about your health history</Text>
        <Ionicons name="lock-closed-outline" size={16} color={EXPLORE.ink3} />
      </View>

      <MakeItYours id="exploreAskCta" />
      <SampleNotice>Example questions only — no answers are generated in this preview.</SampleNotice>
    </ExploreScreen>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#FBF3DC',
    borderWidth: 1,
    borderColor: '#EADBB0',
  },
  question: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questionText: { ...typography.bodyLarge, color: EXPLORE.ink, flex: 1 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: EXPLORE.border,
    backgroundColor: EXPLORE.surfaceAlt,
    opacity: 0.8,
  },
  inputText: { ...typography.bodyMedium, color: EXPLORE.ink3 },
});
