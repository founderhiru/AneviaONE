import React from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';

import { BrandMarkDefs, BrandMarkGlyph, BrandMarkRing, MARK_BOX } from './BrandMarkArt';

/**
 * The AneviaONE mark at rest — the ribbon A with its leaf, inside the ring —
 * for dark emerald surfaces (Welcome, Explore). Identical to the settled frame
 * of AnimatedSplash: both render the artwork in `BrandMarkArt`.
 */
export function BrandMark({ size = 168, id = 'brandMark' }: { size?: number; id?: string }) {
  return (
    <View testID="brand-mark" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}>
        <BrandMarkDefs id={id} />
        <BrandMarkRing id={id} />
        <BrandMarkGlyph id={id} part="letter" />
        <BrandMarkGlyph id={id} part="leaf" />
      </Svg>
    </View>
  );
}
