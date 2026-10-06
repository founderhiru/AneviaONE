import React from 'react';
import { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

/**
 * The AneviaONE A — the single source for the mark's artwork. Traced from the
 * brand launch storyboard (INITIATE → FORM → REVEAL → SETTLE): a folded
 * ribbon A — a fine left stroke and a broad right stroke with a crease — and
 * a two-tone leaf in place of the crossbar, sweeping up from the left foot,
 * inside a thin gold-to-green ring.
 *
 * Everything is drawn in a 100 × 100 box: ring centred at (50, 50) with
 * radius 44, both feet of the A resting on the ring. `BrandMark` renders it
 * at rest; `AnimatedSplash` renders the same parts and animates them, so there
 * is only ever one A.
 */

export const MARK_BOX = 100;
export const MARK_CENTER = 50;
export const MARK_RING_R = 44;

/** Where the leaf grows from (the A's left foot), as a fraction of the box. */
export const LEAF_ORIGIN = { x: 0.176, y: 0.774 };

const APEX = '51.8 16.5';
const LEFT_FOOT = '17.6 77.4';

export const MARK_PATHS = {
  /** Fine left stroke, tapering to the foot; its top tucks under the right stroke. */
  leftStroke: `M 51.2 19.8 L ${LEFT_FOOT} L 26 72 L 50.8 30.2 Z`,
  /** Broad right stroke, inner (shaded) face of the fold. */
  rightInner: `M ${APEX} L 76.6 77.2 L 73 76.3 L 47.2 26.9 Z`,
  /** Broad right stroke, outer (lit) face of the fold. */
  rightOuter: `M ${APEX} L 83.9 77 L 76.6 77.2 Z`,
  /** The crease along the fold. */
  crease: `M ${APEX} L 76.6 77.2`,
  /** Leaf, upper (lighter) half: upper edge out to the tip, back along the midrib. */
  leafUpper: `M ${LEFT_FOOT} C 21 63 31 50.5 62.5 52.6 C 42 58 28 66 ${LEFT_FOOT} Z`,
  /** Leaf, lower (deeper) half: midrib out to the tip, back along the lower edge. */
  leafLower: `M ${LEFT_FOOT} C 28 66 42 58 62.5 52.6 C 50 60 33 74.5 ${LEFT_FOOT} Z`,
  leafVein: `M ${LEFT_FOOT} C 28 66 42 58 62.5 52.6`,
} as const;

/** Mark palette (from the storyboard): ivory A, emerald leaf, a
 * gold-to-champagne ring with a green turn. */
export const MARK_COLORS = {
  gold: '#F2D58A',
  champagne: '#F1E3B0',
  cream: '#FBF6E4',
  ringGreen: '#A9CF86',
  leafLight: '#8FD6A2',
  leafDeep: '#2E9A68',
} as const;

type Part = 'letter' | 'leaf';

/**
 * Gradients for the mark. Ids are prefixed so several marks can share a
 * screen without their `url(#…)` references colliding.
 */
export function BrandMarkDefs({ id }: { id: string }) {
  const { gold, champagne, cream, ringGreen, leafLight, leafDeep } = MARK_COLORS;
  return (
    <Defs>
      <RadialGradient id={`${id}Halo`} cx={MARK_CENTER} cy={MARK_CENTER} r={MARK_RING_R * 1.2} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={gold} stopOpacity={0.16} />
        <Stop offset="0.7" stopColor={ringGreen} stopOpacity={0.06} />
        <Stop offset="1" stopColor={ringGreen} stopOpacity={0} />
      </RadialGradient>
      <LinearGradient id={`${id}Ring`} gradientUnits="userSpaceOnUse" x1={94} y1={6} x2={6} y2={94}>
        <Stop offset="0" stopColor={gold} />
        <Stop offset="0.35" stopColor={champagne} />
        <Stop offset="0.7" stopColor={ringGreen} />
        <Stop offset="1" stopColor={gold} />
      </LinearGradient>
      <RadialGradient id={`${id}Flare`}>
        <Stop offset="0" stopColor={cream} stopOpacity={0.95} />
        <Stop offset="0.25" stopColor={gold} stopOpacity={0.55} />
        <Stop offset="1" stopColor={gold} stopOpacity={0} />
      </RadialGradient>
      <LinearGradient id={`${id}Left`} gradientUnits="userSpaceOnUse" x1={51} y1={20} x2={18} y2={77}>
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.6" stopColor="#F3EBC8" />
        <Stop offset="1" stopColor={gold} />
      </LinearGradient>
      <LinearGradient id={`${id}RightInner`} gradientUnits="userSpaceOnUse" x1={50} y1={18} x2={74} y2={77}>
        <Stop offset="0" stopColor="#E9E1BD" />
        <Stop offset="1" stopColor="#D6E3C6" />
      </LinearGradient>
      <LinearGradient id={`${id}RightOuter`} gradientUnits="userSpaceOnUse" x1={52} y1={16} x2={82} y2={77}>
        <Stop offset="0" stopColor={cream} />
        <Stop offset="0.55" stopColor="#FFFFFF" />
        <Stop offset="1" stopColor="#E7F2DC" />
      </LinearGradient>
      <LinearGradient id={`${id}LeafUpper`} gradientUnits="userSpaceOnUse" x1={18} y1={77} x2={62} y2={53}>
        <Stop offset="0" stopColor={gold} />
        <Stop offset="0.45" stopColor={leafLight} />
        <Stop offset="1" stopColor="#D3F0CC" />
      </LinearGradient>
      <LinearGradient id={`${id}LeafLower`} gradientUnits="userSpaceOnUse" x1={18} y1={77} x2={62} y2={53}>
        <Stop offset="0" stopColor="#B9B85E" />
        <Stop offset="0.5" stopColor={leafDeep} />
        <Stop offset="1" stopColor="#5FC08A" />
      </LinearGradient>
    </Defs>
  );
}

/** The ring, its soft halo and the gold flare at the top right. */
export function BrandMarkRing({ id }: { id: string }) {
  const flare = (-52 * Math.PI) / 180;
  return (
    <G>
      <Circle cx={MARK_CENTER} cy={MARK_CENTER} r={MARK_RING_R * 1.2} fill={`url(#${id}Halo)`} />
      <Circle cx={MARK_CENTER} cy={MARK_CENTER} r={MARK_RING_R} stroke={MARK_COLORS.ringGreen} strokeOpacity={0.16} strokeWidth={4} fill="none" />
      <Circle cx={MARK_CENTER} cy={MARK_CENTER} r={MARK_RING_R} stroke={`url(#${id}Ring)`} strokeWidth={1.3} fill="none" />
      <Circle
        cx={MARK_CENTER + MARK_RING_R * Math.cos(flare)}
        cy={MARK_CENTER + MARK_RING_R * Math.sin(flare)}
        r={9}
        fill={`url(#${id}Flare)`}
      />
    </G>
  );
}

/** The A (`letter`) or the leaf (`leaf`), without the ring. */
export function BrandMarkGlyph({ id, part }: { id: string; part: Part }) {
  if (part === 'leaf') {
    return (
      <G>
        <Path d={MARK_PATHS.leafLower} fill={`url(#${id}LeafLower)`} opacity={0.95} />
        <Path d={MARK_PATHS.leafUpper} fill={`url(#${id}LeafUpper)`} opacity={0.95} />
        <Path d={MARK_PATHS.leafVein} stroke={MARK_COLORS.cream} strokeOpacity={0.55} strokeWidth={0.5} fill="none" />
      </G>
    );
  }
  return (
    <G>
      <Path d={MARK_PATHS.leftStroke} fill={`url(#${id}Left)`} />
      <Path d={MARK_PATHS.rightInner} fill={`url(#${id}RightInner)`} />
      <Path d={MARK_PATHS.rightOuter} fill={`url(#${id}RightOuter)`} />
      <Path d={MARK_PATHS.crease} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={0.4} fill="none" />
    </G>
  );
}
