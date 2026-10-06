import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BRAND, taglineLines, wordmarkParts } from '../config/brand';
import { BRAND_TYPE, FOREST } from '../design/brandSurface';

const [nameLead, nameAccent] = wordmarkParts();

/** The launch tagline as display lines, without trailing full stops
 * ("HEALTHIER GENERATIONS" / "BRIGHTER LIVES" once upper-cased). */
export const LAUNCH_TAGLINE_LINES = taglineLines(BRAND.launchTagline)
  .filter(Boolean)
  .map((line) => line.replace(/\.$/, ''));

/** The AneviaONE wordmark as set on the brand surface, accent on "ONE". */
export function BrandWordmark() {
  return (
    <Text style={styles.name} accessibilityRole="header" testID="brand-wordmark">
      {nameLead}
      {nameAccent ? <Text style={styles.nameAccent}>{nameAccent}</Text> : null}
    </Text>
  );
}

/** The launch tagline under the wordmark, read as one phrase. */
export function BrandTagline() {
  return (
    <View accessible accessibilityLabel={BRAND.launchTagline} testID="brand-tagline">
      {LAUNCH_TAGLINE_LINES.map((line) => (
        <Text key={line} style={styles.tagline}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  name: { ...BRAND_TYPE.wordmark, color: FOREST.ivory, marginBottom: 10 },
  nameAccent: { ...BRAND_TYPE.wordmarkAccent, color: FOREST.limeGold },
  tagline: { ...BRAND_TYPE.tagline, color: 'rgba(246, 249, 239, 0.8)' },
});
